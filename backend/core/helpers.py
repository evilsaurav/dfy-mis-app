import os
import re
import json
import asyncio
from datetime import datetime, timedelta, timezone, date
import calendar
from typing import Optional, Dict, Any, List, Tuple
from backend.core.cache import cache
from backend.core.database import db
from backend.core.supabase import pg_upsert_row, get_active_db


IST_TIMEZONE = timezone(timedelta(hours=5, minutes=30))

def get_ist_now() -> datetime:
    """Returns current datetime in Indian Standard Time (IST, UTC+5:30)."""
    import sys
    main_mod = sys.modules.get("main")
    if main_mod and hasattr(main_mod, "get_ist_now"):
        custom = getattr(main_mod, "get_ist_now")
        if custom is not get_ist_now:
            return custom()
    return datetime.now(IST_TIMEZONE)

def parse_to_ist_datetime(raw_ts) -> Optional[datetime]:
    """Converts Firestore timestamp, datetime, or ISO string to an IST datetime object.
    
    If raw_ts is naive (tzinfo is None or string has no explicit offset/Z), it is treated as IST
    because application timestamps are generated in IST.
    If raw_ts has an explicit timezone offset or UTC indicator ('Z'), it is converted to IST.
    """
    if not raw_ts:
        return None
    try:
        if hasattr(raw_ts, "to_datetime") and callable(raw_ts.to_datetime):
            raw_ts = raw_ts.to_datetime()

        if isinstance(raw_ts, datetime):
            if raw_ts.tzinfo is None:
                return raw_ts.replace(tzinfo=IST_TIMEZONE)
            return raw_ts.astimezone(IST_TIMEZONE)

        str_ts = str(raw_ts).strip()
        if not str_ts:
            return None

        clean_str = str_ts.replace("Z", "+00:00").replace("z", "+00:00")
        try:
            dt = datetime.fromisoformat(clean_str)
        except ValueError:
            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%Y/%m/%d %H:%M:%S",
                "%d-%m-%Y %H:%M:%S",
                "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d",
            ):
                try:
                    dt = datetime.strptime(str_ts, fmt)
                    break
                except ValueError:
                    continue
            else:
                return None

        if dt.tzinfo is None:
            return dt.replace(tzinfo=IST_TIMEZONE)
        return dt.astimezone(IST_TIMEZONE)
    except Exception:
        return None

def format_to_ist_time(raw_ts) -> str:
    """Converts Firestore timestamp, datetime, or ISO string to Indian Standard Time (IST - UTC+5:30) 12-hour format."""
    if not raw_ts:
        return ""
    try:
        if isinstance(raw_ts, str):
            str_ts = raw_ts.strip()
            # If already in 12-hour format like "12:45 PM" or "01:30 AM"
            m12 = re.match(r'^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$', str_ts, re.IGNORECASE)
            if m12:
                h = int(m12.group(1))
                mn = int(m12.group(2))
                mer = m12.group(3).upper()
                return f"{h:02d}:{mn:02d} {mer}"

            # If 24-hour time-only string like "14:30" or "09:15:00"
            m24 = re.match(r'^(\d{1,2}):(\d{2})(?::\d{2})?$', str_ts)
            if m24:
                h = int(m24.group(1))
                mn = int(m24.group(2))
                mer = "AM" if h < 12 else "PM"
                h12 = h % 12
                if h12 == 0:
                    h12 = 12
                return f"{h12:02d}:{mn:02d} {mer}"

        dt_ist = parse_to_ist_datetime(raw_ts)
        if dt_ist:
            return dt_ist.strftime("%I:%M %p")
        return str(raw_ts)[:16]
    except Exception:
        return str(raw_ts)[:16]

def get_month_date_range(month_str: Optional[str]) -> Tuple[str, str]:
    """
    Returns (start_date, end_date) as 'YYYY-MM-DD' strings for the given month string.
    Handles 'YYYY-MM' or 'YYYY-MM-DD'.
    E.g.: '2026-09' -> ('2026-09-01', '2026-09-30')
          '2026-10' -> ('2026-10-01', '2026-10-31')
          '2026-02' -> ('2026-02-01', '2026-02-28' or '2026-02-29')
    """
    try:
        parts = (month_str or "").strip()[:7].split("-")
        year, month = int(parts[0]), int(parts[1])
        last_day = calendar.monthrange(year, month)[1]
        return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"
    except Exception:
        today = date.today()
        year, month = today.year, today.month
        last_day = calendar.monthrange(year, month)[1]
        return f"{year:04d}-{month:02d}-01", f"{year:04d}-{month:02d}-{last_day:02d}"

DEFAULT_BIHAR_DISTRICTS = [
    "Aurangabad", "Begusarai", "Bhojpur", "Buxar", "Darbhanga",
    "East Champaran", "Gaya", "Jamui", "Jehanabad", "Kaimur",
    "Khagaria", "Lakhisarai", "Madhubani", "Munger", "Muzaffarpur",
    "Nawada", "Rohtas", "Samastipur", "Sheikhpura", "Sheohar",
    "Sitamarhi", "Vaishali"
]

DISTRICT_CANONICAL_MAP = {
    "aurangabad-bi": "Aurangabad",
    "aurangabad bi": "Aurangabad",
    "aurangabad": "Aurangabad",
    "bhojpur": "Bhojpur",
    "east champaran": "East Champaran",
    "purba champaran": "East Champaran",
    "purbi champaran": "East Champaran",
    "motihari": "East Champaran"
}

def canonicalize_district(name: str) -> str:
    if not name:
        return ""
    clean = str(name).strip()
    return DISTRICT_CANONICAL_MAP.get(clean.lower(), clean)

def normalize_staff_key(dist_str: str, name_str: str) -> str:
    d = re.sub(r'[^a-z0-9]', '', canonicalize_district(dist_str or '').lower())
    n = re.sub(r'[^a-z0-9]', '', (name_str or '').lower())
    collapsed = re.sub(r'(.)\1+', r'\1', n)
    return f"{d}_{collapsed}"

def is_officer_name_match(name_a: str, name_b: str, district: str = "") -> bool:
    if not name_a or not name_b:
        return False
    a = str(name_a).strip().lower()
    b = str(name_b).strip().lower()
    if a == b:
        return True
    if (a in ("ashwani kumar", "ashwani kr keshri")) and (b in ("ashwani kumar", "ashwani kr keshri")):
        return True
    c_dist = canonicalize_district(district).lower() if district else ""
    if not district or c_dist == "muzaffarpur":
        aliases = ("vinay prakash", "vinay kumar", "vinay kumar lt")
        if a in aliases and b in aliases:
            return True
    return False

def get_previous_month(month_str: Optional[str]) -> str:
    """Returns YYYY-MM formatted string for the calendar month immediately preceding month_str."""
    if not month_str or not isinstance(month_str, str) or "-" not in month_str:
        return ""
    try:
        parts = month_str.strip().split("-")
        y = int(parts[0])
        m = int(parts[1])
        m -= 1
        if m < 1:
            m = 12
            y -= 1
        return f"{y:04d}-{m:02d}"
    except Exception:
        return ""

def load_baseline_staff_directory():
    directory = {d: [] for d in DEFAULT_BIHAR_DISTRICTS}
    if os.path.exists("staff_directory_snapshot.json"):
        try:
            with open("staff_directory_snapshot.json", "r", encoding="utf-8") as f:
                snap = json.load(f)
                if snap and isinstance(snap, dict):
                    for dist, staff in snap.items():
                        c_dist = canonicalize_district(dist)
                        if c_dist in directory:
                            directory[c_dist] = sorted(list(set(directory.get(c_dist, []) + staff)))
                    return directory
        except Exception:
            pass

    if os.path.exists("staff_master.csv"):
        try:
            import csv
            with open("staff_master.csv", "r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    dist = canonicalize_district(row.get("District", "").strip())
                    name = row.get("Name", "").strip()
                    if dist in directory and name:
                        if name not in directory[dist]:
                            directory[dist].append(name)
            for d in directory:
                directory[d] = sorted(directory[d])
            return directory
        except Exception:
            pass

    return directory

def canonicalize_fo_name(name: str, district: str = None) -> str:
    if not name:
        return ""
    clean = re.sub(r'\s+', ' ', str(name)).strip()
    if not clean:
        return ""
    
    c_dist = canonicalize_district(district) if district else ""
    directory = cache.get("staff_directory_list") or load_baseline_staff_directory()
    if directory and isinstance(directory, dict):
        if c_dist and c_dist in directory:
            for official_name in directory[c_dist]:
                if clean.lower() == official_name.strip().lower():
                    return official_name.strip()
        for d, names in directory.items():
            for official_name in names:
                if clean.lower() == official_name.strip().lower():
                    return official_name.strip()
                    
    return clean.title()

def get_profile_cache_key(district: str, fo_name: str, month: str) -> str:
    clean_wp = canonicalize_district(district)
    clean_fo = re.sub(r'[^a-zA-Z0-9]', '', str(fo_name or "")).lower()
    clean_m = str(month or "").strip()[:7]
    return f"profile_{clean_wp}_{clean_fo}_{clean_m}".replace(" ", "_").lower()

def evict_officer_profile_cache(district: str, fo_name: str, date_str: str = "", old_district: Optional[str] = None):
    try:
        month = str(date_str or "").strip()[:7]
        if not month:
            month = get_ist_now().strftime("%Y-%m")
        cache.delete(get_profile_cache_key(district, fo_name, month))
        # Also evict legacy underscored format for backward compatibility with external tests
        clean_dist = canonicalize_district(district).lower().replace(" ", "_")
        clean_fo = str(fo_name or "").strip().lower().replace(" ", "_")
        cache.delete(f"profile_{clean_dist}_{clean_fo}_{month}")
        if old_district:
            cache.delete(get_profile_cache_key(old_district, fo_name, month))
            clean_old = canonicalize_district(old_district).lower().replace(" ", "_")
            cache.delete(f"profile_{clean_old}_{clean_fo}_{month}")
    except Exception as e:
        print(f"[Profile Eviction Notice] {e}")

def get_reporting_cutoff_hour(now_ist: Optional[datetime] = None) -> int:
    """
    Returns the reporting cutoff hour in IST.
    On Day 1 of any month, grace period extends until 12:00 PM (hour 12)
    to allow completion of previous month's final reports.
    On all other days, standard technical cutoff is 11:00 AM (hour 11).
    """
    if now_ist is None:
        now_ist = get_ist_now()
    if now_ist.day == 1:
        return 12
    return 11

def get_active_operational_month(now_ist: Optional[datetime] = None) -> str:
    """
    Returns the active operational month string (YYYY-MM).
    On Day 1 of any month before 12:00 PM Noon IST, the operational context
    is the previous calendar month (month-end grace period).
    Otherwise, returns the current calendar month.
    """
    if now_ist is None:
        now_ist = get_ist_now()
    if now_ist.day == 1 and now_ist.hour < 12:
        return get_previous_month(now_ist.strftime("%Y-%m"))
    return now_ist.strftime("%Y-%m")

import urllib.request
from fastapi import Request

# In-memory IP Geolocation Cache to guarantee zero repeated latency
ip_geo_cache: Dict[str, str] = {}

def extract_client_info(request: Optional[Request] = None) -> Tuple[str, str]:
    """
    Extracts the client's real public IP address and a human-friendly device/browser summary.
    Handles reverse proxies like Render, Vercel, Cloudflare, etc.
    """
    if not request:
        return "Unknown IP", "Unknown Device"
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.headers.get("x-real-ip", "") or (request.client.host if request.client else "Unknown IP")
        
    ua = request.headers.get("user-agent", "Unknown Device")
    ua_lower = ua.lower()
    
    device = "Unknown Device"
    if "android" in ua_lower:
        device = "📱 Android Mobile"
        if "chrome" in ua_lower:
            device += " (Chrome)"
    elif "iphone" in ua_lower:
        device = "📱 iPhone (Safari)"
    elif "ipad" in ua_lower:
        device = "📱 iPad"
    elif "windows" in ua_lower:
        device = "💻 Windows PC"
        if "chrome" in ua_lower:
            device += " (Chrome)"
        elif "edg" in ua_lower:
            device += " (Edge)"
        elif "firefox" in ua_lower:
            device += " (Firefox)"
    elif "macintosh" in ua_lower or "mac os" in ua_lower:
        device = "💻 Mac OS"
    elif "linux" in ua_lower:
        device = "🖥️ Linux"
    elif any(bot in ua_lower for bot in ["curl", "python", "postman", "wget", "aiohttp", "requests"]):
        device = "🤖 API Client / Script"
        
    return ip, device

async def get_ip_location(ip: str) -> str:
    """
    Resolves city, state/region, and ISP from client public IP address.
    Fully asynchronous and non-blocking with in-memory caching and 1.2s timeout.
    """
    if not ip or ip in ["Unknown IP", "127.0.0.1", "localhost", "::1"]:
        return ""

    clean_ip = str(ip).strip()
    if clean_ip.startswith(("10.", "192.168.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.")):
        return "Local / Private Network"

    if clean_ip in ip_geo_cache:
        return ip_geo_cache[clean_ip]

    def _fetch_geo():
        try:
            req = urllib.request.Request(
                f"http://ip-api.com/json/{clean_ip}?fields=status,country,regionName,city,isp",
                headers={"User-Agent": "mis-app-audit-radar/1.0"}
            )
            with urllib.request.urlopen(req, timeout=1.2) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("status") == "success":
                    city = data.get("city", "").strip()
                    region = data.get("regionName", "").strip()
                    isp = data.get("isp", "").strip()
                    parts = []
                    if city and region:
                        parts.append(f"{city}, {region}")
                    elif city:
                        parts.append(city)
                    elif region:
                        parts.append(region)

                    loc_str = parts[0] if parts else data.get("country", "")
                    if isp and loc_str:
                        short_isp = isp.replace("Reliance Jio Infocomm Limited", "Jio").replace("Bharat Sanchar Nigam Ltd", "BSNL").replace("BHARTI", "Airtel").replace("Bharti Airtel Limited", "Airtel").replace("Vodafone Idea Limited", "Vi")
                        loc_str += f" ({short_isp})"
                    return loc_str
        except Exception:
            return ""
        return ""

    try:
        loc = await asyncio.to_thread(_fetch_geo)
        if len(ip_geo_cache) > 2000:
            ip_geo_cache.clear()
        if loc:
            ip_geo_cache[clean_ip] = loc
        return loc or ""
    except Exception:
        return ""

async def log_admin_activity(
    action_type: str,
    details: str,
    user_name: str = "System Automated",
    user_id: str = "system",
    role: str = "SYSTEM",
    district: Optional[str] = "All",
    target_officer: Optional[str] = "",
    diff: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = "",
    location: Optional[str] = ""
):
    try:
        ist_now = get_ist_now()
        resolved_diff = diff.copy() if isinstance(diff, dict) else {}
        resolved_loc = location or resolved_diff.get("location", "")
        if resolved_loc and "location" not in resolved_diff:
            resolved_diff["location"] = resolved_loc

        import uuid
        log_id = str(uuid.uuid4())
        diff_str = json.dumps(resolved_diff) if isinstance(resolved_diff, (dict, list)) else str(resolved_diff or "")
        
        entry = {
            "id": log_id,
            "timestamp": ist_now.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp_ist": ist_now.strftime("%d %b %Y, %I:%M:%S %p"),
            "is_ist": True,
            "action_type": action_type,
            "details": details,
            "user_name": user_name,
            "user_id": user_id,
            "role": role,
            "district": district or "All",
            "target_officer": target_officer or "",
            "diff": diff_str,
            "ip_address": ip_address or "",
            "location": resolved_loc
        }

        # Evict admin activity audit cache
        cache.delete_prefix("admin_audit_logs_")
        cache.delete_prefix("admin_audit_summary_")

        def _write_log():
            try:
                pg_entry = {
                    "action_type": action_type,
                    "details": details,
                    "user_id": str(user_id) if user_id else None,
                    "user_name": str(user_name) if user_name else None,
                    "role": str(role) if role else None,
                    "district_name_snapshot": str(district) if district else "All",
                    "target_officer": str(target_officer) if target_officer else None,
                    "diff": resolved_diff if isinstance(resolved_diff, dict) else {},
                    "ip_address": ip_address if ip_address else None,
                    "location": resolved_loc or None,
                    "occurred_at": ist_now.isoformat(),
                    "legacy_doc_id": log_id,
                }
                pg_upsert_row("admin_audit_logs", pg_entry, conflict_columns=["legacy_doc_id"])
            except Exception as w_err:
                print(f"Audit log PG write notice: {w_err}")

            try:
                active_db = get_active_db()
                if active_db and hasattr(active_db, "collection"):
                    active_db.collection("admin_audit_logs").document(log_id).set(entry)
            except Exception:
                pass

        await asyncio.to_thread(_write_log)
    except Exception as e:
        print(f"Audit log background notice: {e}")

