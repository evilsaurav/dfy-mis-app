#!/usr/bin/env python3
"""
Supabase PostgreSQL & Connection Diagnostic Tool for DFY TB MIS App
-------------------------------------------------------------------
Diagnoses:
1. Environment variables (DATABASE_URL, SUPABASE_URL, SUPABASE_KEY, etc.)
2. DNS resolution (IPv4 vs IPv6 - critical for Render deployments)
3. Direct psycopg2 connection & SSL mode verification
4. Supabase REST API connectivity
5. Schema, tables, columns, row counts, and RLS (Row Level Security)
6. App helper execution (pg_execute_raw, pg_query_table, fetch_admin_user)
"""

import os
import sys
import socket
import traceback
from urllib.parse import urlparse, parse_qs
from pathlib import Path

# Ensure repo root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load dotenv if present
try:
    import dotenv
    env_paths = [
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / "backend" / ".env",
        PROJECT_ROOT / "dfy-frontend" / ".env.local",
        PROJECT_ROOT / "dfy-frontend" / ".env.production"
    ]
    for p in env_paths:
        if p.exists():
            dotenv.load_dotenv(p)
            print(f"[Dotenv] Loaded environment from: {p.resolve()}")
            break
except ImportError:
    pass

# Allow CLI override: python scripts/diagnose_supabase.py "postgresql://..."
if len(sys.argv) > 1 and sys.argv[1].startswith(("postgres://", "postgresql://", "https://")):
    cli_arg = sys.argv[1]
    if cli_arg.startswith("https://"):
        os.environ["SUPABASE_URL"] = cli_arg
        print(f"[CLI Arg] Overriding SUPABASE_URL with CLI argument: {cli_arg}")
    else:
        os.environ["DATABASE_URL"] = cli_arg
        print(f"[CLI Arg] Overriding DATABASE_URL with CLI argument: {cli_arg[:25]}...")

print("=" * 80)
print("DFY TB MIS - SUPABASE POSTGRESQL DIAGNOSTIC SUITE")
print("=" * 80)

# ----------------------------------------------------------------------------
# 1. Inspect Environment Variables
# ----------------------------------------------------------------------------
print("\n[STEP 1] Environment Variables Inspection:")
env_vars_to_check = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "SUPABASE_DB_URL",
    "POSTGRESQL_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_KEY",
    "SUPABASE_ANON_KEY",
]

found_env = {}
for var in env_vars_to_check:
    val = os.environ.get(var)
    if val:
        found_env[var] = val
        if len(val) > 20:
            masked = f"{val[:8]}...{val[-6:]} (length: {len(val)})"
        else:
            masked = f"{val[:3]}*** (length: {len(val)})"
        print(f"  [OK] {var:28} = {masked}")
    else:
        print(f"  [--] {var:28} = NOT SET")

active_db_url = (
    os.environ.get("DATABASE_URL")
    or os.environ.get("POSTGRES_URL")
    or os.environ.get("SUPABASE_DB_URL")
    or os.environ.get("POSTGRESQL_URL")
)

active_supabase_url = os.environ.get("SUPABASE_URL")
active_supabase_key = (
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
)

if not active_db_url and not (active_supabase_url and active_supabase_key):
    print("\n[CRITICAL WARNING] Neither DATABASE_URL nor SUPABASE_URL + SUPABASE_KEY is set!")
    print("  -> The backend will fail all connections and return empty arrays [] for all endpoints.")
    print("  -> Provide DATABASE_URL or SUPABASE credentials as environment variables or in a .env file.")

# ----------------------------------------------------------------------------
# 2. Parse Database URL & Host DNS Resolution
# ----------------------------------------------------------------------------
parsed_db = None
if active_db_url:
    print("\n[STEP 2] DATABASE_URL Structure & DNS Inspection:")
    clean_url = active_db_url
    if clean_url.startswith("postgres://"):
        clean_url = clean_url.replace("postgres://", "postgresql://", 1)

    try:
        parsed_db = urlparse(clean_url)
        print(f"  Scheme:   {parsed_db.scheme}")
        print(f"  User:     {parsed_db.username}")
        print(f"  Password: {'[PRESENT]' if parsed_db.password else '[MISSING]'}")
        print(f"  Host:     {parsed_db.hostname}")
        print(f"  Port:     {parsed_db.port or 5432}")
        print(f"  Database: {parsed_db.path.lstrip('/')}")
        query_params = parse_qs(parsed_db.query)
        print(f"  Query params: {query_params}")

        # Check for special characters in raw password
        if parsed_db.password and any(c in parsed_db.password for c in ['@', ':', '/', '?', '#', '[', ']']):
            print("  [WARN] Password contains unencoded special characters! If not URL-encoded, connection may fail.")

        # DNS resolution check
        host = parsed_db.hostname
        if host:
            print(f"\n  Checking DNS resolution for host: '{host}'...")
            try:
                addr_info = socket.getaddrinfo(host, parsed_db.port or 5432, socket.AF_UNSPEC, socket.SOCK_STREAM)
                ipv4_addrs = set()
                ipv6_addrs = set()
                for family, _, _, _, sockaddr in addr_info:
                    if family == socket.AF_INET:
                        ipv4_addrs.add(sockaddr[0])
                    elif family == socket.AF_INET6:
                        ipv6_addrs.add(sockaddr[0])

                if ipv4_addrs:
                    print(f"  [OK] IPv4 addresses found: {', '.join(ipv4_addrs)}")
                if ipv6_addrs:
                    print(f"  [INFO] IPv6 addresses found: {', '.join(ipv6_addrs)}")

                # Check for the classic Render / Supabase IPv6 trap
                if not ipv4_addrs and ipv6_addrs:
                    print("\n  [CRITICAL RENDER TRAP DETECTED] Host has ONLY IPv6 addresses!")
                    print("  -> Render web services (Free/Starter) DO NOT SUPPORT OUTBOUND IPv6.")
                    print("  -> Direct host 'db.<project-ref>.supabase.co' will FAIL to connect on Render.")
                    print("  -> FIX: Use the Supabase Connection Pooler URL instead:")
                    print("     Host: aws-0-[region].pooler.supabase.com")
                    print("     Port: 6543 (transaction) or 5432 (session)")
                    print("     User: postgres.[project-ref]")
                elif "pooler.supabase.com" in host:
                    print("  [OK] Host is using Supabase Pooler (IPv4 compatible).")
            except Exception as de:
                print(f"  [FAIL] DNS resolution failed for '{host}': {de}")
    except Exception as ue:
        print(f"  [FAIL] Failed to parse DATABASE_URL: {ue}")

# ----------------------------------------------------------------------------
# 3. Direct psycopg2 Connection Test
# ----------------------------------------------------------------------------
psycopg2_conn = None
if active_db_url:
    print("\n[STEP 3] Direct PostgreSQL Connection Test via psycopg2:")
    try:
        import psycopg2
        import psycopg2.extras

        # Prepare normalized url
        test_url = active_db_url
        if test_url.startswith("postgres://"):
            test_url = test_url.replace("postgres://", "postgresql://", 1)

        # First attempt: default connect with connect_timeout=10
        print("  Attempting connection (timeout=10s)...")
        try:
            # Check if sslmode is in url
            if "sslmode" not in test_url:
                print("  Note: Adding sslmode='require' for Supabase compatibility...")
                psycopg2_conn = psycopg2.connect(test_url, sslmode="require", connect_timeout=10)
            else:
                psycopg2_conn = psycopg2.connect(test_url, connect_timeout=10)
            print("  [SUCCESS] Successfully connected to PostgreSQL!")
        except Exception as conn_err:
            print(f"  [FAIL] Connection attempt failed: {conn_err}")
            print(f"         Exception class: {conn_err.__class__.__name__}")
            traceback.print_exc()

            # Retry with explicit sslmode=require if not already tried
            if "sslmode" not in test_url:
                print("\n  Retrying without explicit sslmode parameter...")
                try:
                    psycopg2_conn = psycopg2.connect(test_url, connect_timeout=10)
                    print("  [SUCCESS] Connected without explicit sslmode!")
                except Exception as retry_err:
                    print(f"  [FAIL] Retry also failed: {retry_err}")

        if psycopg2_conn:
            with psycopg2_conn.cursor() as cur:
                cur.execute("SELECT version();")
                ver = cur.fetchone()[0]
                print(f"  PostgreSQL Server: {ver[:60]}...")

                cur.execute("SELECT current_database(), current_user, current_schema();")
                db_info = cur.fetchone()
                print(f"  Current DB: '{db_info[0]}', User: '{db_info[1]}', Schema: '{db_info[2]}'")
    except ImportError:
        print("  [FAIL] psycopg2 is not installed in the current environment!")
    except Exception as e:
        print(f"  [FAIL] psycopg2 check encountered error: {e}")

# ----------------------------------------------------------------------------
# 4. Supabase REST Client Test
# ----------------------------------------------------------------------------
sb_client = None
print("\n[STEP 4] Supabase REST Client Test:")
if active_supabase_url and active_supabase_key:
    try:
        from supabase import create_client
        print(f"  Connecting to Supabase REST endpoint: {active_supabase_url}...")
        sb_client = create_client(active_supabase_url, active_supabase_key)
        print("  [SUCCESS] Supabase REST client created successfully.")

        # Test querying admin_users
        try:
            res = sb_client.table("admin_users").select("count", count="exact").execute()
            print(f"  [OK] REST query to 'admin_users' succeeded. Count: {res.count}")
        except Exception as re_err:
            print(f"  [NOTICE] REST query to 'admin_users' returned: {re_err}")
    except Exception as sbe:
        print(f"  [FAIL] Supabase REST initialization failed: {sbe}")
else:
    print("  [--] SUPABASE_URL and/or SUPABASE_KEY not provided. Skipping REST test.")

# ----------------------------------------------------------------------------
# 5. Schema, Table Inventory, Row Counts & RLS Audit
# ----------------------------------------------------------------------------
EXPECTED_TABLES = [
    "daily_field_reports",
    "daily_staff_leaves",
    "daily_district_rollups",
    "staff_directory",
    "staff_targets",
    "district_targets",
    "nikshay_verified_patients",
    "admin_users",
    "admin_audit_logs",
    "broadcast_alerts",
    "pacing_settings",
    "admin_config",
]

if psycopg2_conn:
    print("\n[STEP 5] Database Schema & Table Inventory Audit:")
    try:
        import psycopg2.extras
        with psycopg2_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # 5.1 List all tables in public schema
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
            """)
            existing_tables = [row["table_name"] for row in cur.fetchall()]
            print(f"  Total tables found in 'public' schema: {len(existing_tables)}")
            print(f"  Tables: {', '.join(existing_tables) if existing_tables else 'NONE'}")

            # 5.2 Check RLS (Row Level Security) status
            cur.execute("""
                SELECT tablename, rowsecurity 
                FROM pg_tables 
                WHERE schemaname = 'public';
            """)
            rls_status = {row["tablename"]: row["rowsecurity"] for row in cur.fetchall()}

            # 5.3 Audit expected tables
            print("\n  [Table Status Breakdown]:")
            print(f"  {'Table Name':30} | {'Status':10} | {'Row Count':10} | {'RLS Enabled'}")
            print("  " + "-" * 70)

            for tbl in EXPECTED_TABLES:
                if tbl in existing_tables:
                    # Count rows
                    try:
                        cur.execute(f'SELECT count(*) as cnt FROM "{tbl}";')
                        cnt = cur.fetchone()["cnt"]
                        rls_flag = "YES (Check policies!)" if rls_status.get(tbl) else "NO"
                        print(f"  {tbl:30} | {'EXISTS':10} | {cnt:10} | {rls_flag}")
                    except Exception as cnt_err:
                        psycopg2_conn.rollback()
                        print(f"  {tbl:30} | {'EXISTS':10} | {'ERROR':10} | {cnt_err}")
                else:
                    print(f"  {tbl:30} | {'MISSING':10} | {'0':10} | N/A")

            # 5.4 Deep-dive on daily_field_reports
            if "daily_field_reports" in existing_tables:
                print("\n  [Deep-Dive: daily_field_reports Columns & Types]:")
                cur.execute("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = 'daily_field_reports'
                    ORDER BY ordinal_position;
                """)
                cols = cur.fetchall()
                for c in cols:
                    print(f"    - {c['column_name']:30} ({c['data_type']}) nullable={c['is_nullable']}")

                # Sample query testing date format
                cur.execute("SELECT date_of_reporting, working_place, fo_name FROM daily_field_reports LIMIT 3;")
                sample_rows = cur.fetchall()
                print("\n  [Sample daily_field_reports Rows]:")
                if sample_rows:
                    for s in sample_rows:
                        print(f"    - date: {s.get('date_of_reporting')}, place: {s.get('working_place')}, fo: {s.get('fo_name')}")
                else:
                    print("    (Table is currently empty - 0 rows found)")

    except Exception as se:
        print(f"  [FAIL] Schema audit encountered error: {se}")
        traceback.print_exc()

# ----------------------------------------------------------------------------
# 6. Test App Helper Functions (Simulate API Endpoints)
# ----------------------------------------------------------------------------
print("\n[STEP 6] Testing Application Helper Functions (backend/core/supabase.py):")
try:
    from backend.core.supabase import (
        get_postgres_connection,
        pg_execute_raw,
        pg_query_table,
        fetch_admin_user,
    )

    print("  Testing get_postgres_connection()...")
    app_conn = get_postgres_connection()
    if app_conn:
        print("  [SUCCESS] backend/core/supabase.py successfully connected to PostgreSQL!")
        app_conn.close()
    else:
        print("  [FAIL] backend/core/supabase.py failed to connect to PostgreSQL (returned None)!")

    print("\n  Testing pg_execute_raw('SELECT 1 as test', fetch=True)...")
    raw_res = pg_execute_raw("SELECT 1 as test", fetch=True)
    print(f"  Result: {raw_res}")

    print("\n  Testing pg_query_table('admin_users', limit=1)...")
    query_res = pg_query_table("admin_users", limit=1)
    print(f"  Result: {len(query_res)} row(s) returned.")

    print("\n  Testing fetch_admin_user('admin')...")
    admin_res = fetch_admin_user("admin")
    if admin_res:
        print(f"  [OK] Admin user found: {admin_res.get('username')} (role: {admin_res.get('role')})")
    else:
        print("  [WARN] Admin user lookup returned None.")

except Exception as he:
    print(f"  [FAIL] Helper test error: {he}")
    traceback.print_exc()

print("\n" + "=" * 80)
print("DIAGNOSTIC SUITE COMPLETE")
print("=" * 80)
