import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from main import calculate_reporting_streak, is_exempt_day


# Helper to build mock daily_history
def make_day(submitted=True, is_leave=False, status=None, reason_type=None):
    rec = {
        "submitted": submitted,
        "is_leave": is_leave,
    }
    if status:
        rec["status"] = status
    if reason_type:
        rec["reason_type"] = reason_type
    return rec


# Calendar reference:
# 2026-09-21: Monday
# 2026-09-22: Tuesday
# 2026-09-23: Wednesday
# 2026-09-24: Thursday
# 2026-09-25: Friday
# 2026-09-26: Saturday
# 2026-09-27: Sunday (weekday == 6)
# 2026-09-28: Monday (weekday == 0)
# 2026-09-29: Tuesday


def test_consecutive_reporting_increments_streak():
    """Consecutive reporting on normal weekdays increments streak."""
    history = {
        "2026-09-23": make_day(submitted=True),
        "2026-09-24": make_day(submitted=True),
        "2026-09-25": make_day(submitted=True),
    }
    today = date(2026, 9, 25)  # Friday (submitted)
    assert calculate_reporting_streak(history, today=today) == 3


def test_streak_bridges_across_sunday_weekly_off():
    """Streak bridges across Sunday weekly off without resetting to 0."""
    history = {
        "2026-09-24": make_day(submitted=True),  # Thursday
        "2026-09-25": make_day(submitted=True),  # Friday
        "2026-09-26": make_day(submitted=True),  # Saturday
        "2026-09-27": make_day(submitted=False), # Sunday (weekly off)
        "2026-09-28": make_day(submitted=True),  # Monday (submitted)
    }
    today = date(2026, 9, 28)  # Monday
    # Streak should bridge Sunday and count Thu, Fri, Sat, Mon = 4 days
    assert calculate_reporting_streak(history, today=today) == 4


def test_streak_bridges_across_approved_leaves():
    """Streak bridges across Casual, Medical, Official Duty leaves and Declared Holidays."""
    # 1. Casual Leave bridging
    history_casual = {
        "2026-09-21": make_day(submitted=True),  # Monday
        "2026-09-22": make_day(submitted=False, is_leave=True, reason_type="Casual", status="leave"), # Tuesday (Leave)
        "2026-09-23": make_day(submitted=True),  # Wednesday
    }
    assert calculate_reporting_streak(history_casual, today=date(2026, 9, 23)) == 2

    # 2. Medical Leave bridging
    history_med = {
        "2026-09-21": make_day(submitted=True),
        "2026-09-22": make_day(submitted=False, is_leave=True, reason_type="Medical", status="leave"),
        "2026-09-23": make_day(submitted=False, is_leave=True, reason_type="Medical", status="leave"),
        "2026-09-24": make_day(submitted=True),
    }
    assert calculate_reporting_streak(history_med, today=date(2026, 9, 24)) == 2

    # 3. Official Duty bridging
    history_duty = {
        "2026-09-23": make_day(submitted=True),
        "2026-09-24": make_day(submitted=False, is_leave=True, reason_type="Official Duty", status="leave"),
        "2026-09-25": make_day(submitted=True),
    }
    assert calculate_reporting_streak(history_duty, today=date(2026, 9, 25)) == 2

    # 4. Declared Holiday bridging
    history_holiday = {
        "2026-09-25": make_day(submitted=True), # Friday
        "2026-09-26": make_day(submitted=False, is_leave=True, reason_type="Declared Holiday", status="holiday"), # Saturday (Holiday)
        "2026-09-27": make_day(submitted=False), # Sunday (Weekly off)
        "2026-09-28": make_day(submitted=True),  # Monday
    }
    assert calculate_reporting_streak(history_holiday, today=date(2026, 9, 28)) == 2


def test_unexcused_absence_breaks_streak():
    """Unexcused absence breaks the streak."""
    # Scenario A: Missed yesterday (Thursday), today (Friday) submitted
    history = {
        "2026-09-22": make_day(submitted=True),  # Tuesday
        "2026-09-23": make_day(submitted=True),  # Wednesday
        "2026-09-24": make_day(submitted=False, is_leave=False), # Thursday (unexcused)
        "2026-09-25": make_day(submitted=True),  # Friday (submitted)
    }
    today = date(2026, 9, 25)
    # Streak should only count today (Friday) = 1, since Thursday was unexcused
    assert calculate_reporting_streak(history, today=today) == 1

    # Scenario B: Missed yesterday (Thursday), today (Friday) not submitted yet
    today_unsubmitted = date(2026, 9, 25)
    history_unsub = {
        "2026-09-22": make_day(submitted=True),
        "2026-09-23": make_day(submitted=True),
        "2026-09-24": make_day(submitted=False, is_leave=False), # Thursday (unexcused)
        "2026-09-25": make_day(submitted=False),
    }
    # Latest mandatory day was Thursday, which was unexcused. Streak must be 0!
    assert calculate_reporting_streak(history_unsub, today=today_unsubmitted) == 0


def test_monday_morning_check_unsubmitted_sunday_off_preserves_streak():
    """Monday morning check (today unsubmitted, Sunday off) preserves prior streak from Sat/Fri."""
    history = {
        "2026-09-24": make_day(submitted=True),  # Thursday
        "2026-09-25": make_day(submitted=True),  # Friday
        "2026-09-26": make_day(submitted=True),  # Saturday
        "2026-09-27": make_day(submitted=False), # Sunday (weekly off)
        "2026-09-28": make_day(submitted=False), # Monday (morning, not yet submitted)
    }
    today = date(2026, 9, 28)  # Monday morning
    # Step back past Sunday weekly off, anchors to Saturday, counts Thu, Fri, Sat = 3
    assert calculate_reporting_streak(history, today=today) == 3


def test_monday_morning_check_unsubmitted_saturday_absence_breaks_streak():
    """Monday morning check with Saturday unexcused absence results in streak 0."""
    history = {
        "2026-09-24": make_day(submitted=True),  # Thursday
        "2026-09-25": make_day(submitted=True),  # Friday
        "2026-09-26": make_day(submitted=False, is_leave=False), # Saturday (unexcused)
        "2026-09-27": make_day(submitted=False), # Sunday (weekly off)
        "2026-09-28": make_day(submitted=False), # Monday (morning)
    }
    today = date(2026, 9, 28)
    # Sunday is bridged, but Saturday was unexcused absence, so streak terminates with 0
    assert calculate_reporting_streak(history, today=today) == 0


def test_working_on_sunday_increments_streak():
    """Working on Sunday increments the streak."""
    # Scenario A: Today is Sunday and submitted
    history_sun = {
        "2026-09-25": make_day(submitted=True),  # Friday
        "2026-09-26": make_day(submitted=True),  # Saturday
        "2026-09-27": make_day(submitted=True),  # Sunday (worked!)
    }
    assert calculate_reporting_streak(history_sun, today=date(2026, 9, 27)) == 3

    # Scenario B: Sunday worked + Monday worked
    history_mon = {
        "2026-09-25": make_day(submitted=True),  # Friday
        "2026-09-26": make_day(submitted=True),  # Saturday
        "2026-09-27": make_day(submitted=True),  # Sunday (worked!)
        "2026-09-28": make_day(submitted=True),  # Monday (worked!)
    }
    assert calculate_reporting_streak(history_mon, today=date(2026, 9, 28)) == 4

    # Scenario C: Sunday worked, Monday morning unsubmitted
    history_mon_morn = {
        "2026-09-25": make_day(submitted=True),  # Friday
        "2026-09-26": make_day(submitted=True),  # Saturday
        "2026-09-27": make_day(submitted=True),  # Sunday (worked!)
        "2026-09-28": make_day(submitted=False), # Monday (unsubmitted)
    }
    assert calculate_reporting_streak(history_mon_morn, today=date(2026, 9, 28)) == 3


def test_working_on_leave_day_increments_streak():
    """Working on an approved leave day increments streak."""
    history = {
        "2026-09-21": make_day(submitted=True), # Monday
        "2026-09-22": make_day(submitted=True, is_leave=True, reason_type="Casual", status="leave"), # Tuesday (Leave, but worked & submitted)
        "2026-09-23": make_day(submitted=True), # Wednesday
    }
    assert calculate_reporting_streak(history, today=date(2026, 9, 23)) == 3


def test_multiple_consecutive_exempt_days_bridging():
    """Multiple consecutive exempt days (leaves + Sunday) bridge without breaking streak."""
    history = {
        "2026-09-23": make_day(submitted=True), # Wednesday
        "2026-09-24": make_day(submitted=False, is_leave=True, reason_type="Casual"), # Thu (Leave)
        "2026-09-25": make_day(submitted=False, is_leave=True, reason_type="Casual"), # Fri (Leave)
        "2026-09-26": make_day(submitted=False, is_leave=True, reason_type="Official Duty"), # Sat (Leave)
        "2026-09-27": make_day(submitted=False), # Sun (Sunday off)
        "2026-09-28": make_day(submitted=False, is_leave=True, reason_type="Medical"), # Mon (Leave)
        "2026-09-29": make_day(submitted=True), # Tue (Submitted)
    }
    today = date(2026, 9, 29)
    # Streak: 2026-09-29 (1) + 2026-09-23 (1) = 2
    assert calculate_reporting_streak(history, today=today) == 2


def test_defensive_traversal_limit_empty_or_all_leaves():
    """Defensive 60-day limit prevents infinite loops and returns 0 when no submitted days."""
    # 70 days of unsubmitted leaves
    start = date(2026, 7, 1)
    history = {}
    for i in range(70):
        d = start + timedelta(days=i)
        history[d.strftime("%Y-%m-%d")] = make_day(submitted=False, is_leave=True)

    today = start + timedelta(days=70)
    assert calculate_reporting_streak(history, today=today) == 0
    # Empty history
    assert calculate_reporting_streak({}, today=today) == 0


# ---------------------------------------------------------------------------
# End-to-End Endpoint Integration Tests (/my-profile-stats)
# ---------------------------------------------------------------------------
import httpx
from datetime import datetime, timezone
from main import app, cache


class MockDocRef:
    def __init__(self, coll_name: str, doc_id: str, store: dict):
        self.coll_name = coll_name
        self.doc_id = doc_id
        self.store = store

    def get(self):
        snap = MagicMock()
        exists = self.coll_name in self.store and self.doc_id in self.store[self.coll_name]
        snap.exists = exists
        snap.id = self.doc_id
        snap.to_dict.return_value = dict(self.store.get(self.coll_name, {}).get(self.doc_id, {}))
        snap.reference = self
        return snap


class MockCollection:
    def __init__(self, coll_name: str, store: dict, filters=None):
        self.coll_name = coll_name
        self.store = store
        self.filters = filters or []

    def document(self, doc_id: str):
        return MockDocRef(self.coll_name, doc_id, self.store)

    def where(self, field, op, val):
        new_filters = list(self.filters) + [(field, op, val)]
        return MockCollection(self.coll_name, self.store, new_filters)

    def stream(self):
        docs = []
        for doc_id, data in list(self.store.get(self.coll_name, {}).items()):
            match = True
            for field, op, val in self.filters:
                val_doc = data.get(field)
                if op == "==" and val_doc != val:
                    match = False
                    break
                elif op == ">=" and (val_doc is None or val_doc < val):
                    match = False
                    break
                elif op == "<=" and (val_doc is None or val_doc > val):
                    match = False
                    break
                elif op == "in" and val_doc not in val:
                    match = False
                    break
            if match:
                docs.append(MockDocRef(self.coll_name, doc_id, self.store).get())
        return docs


class MockFirestore:
    def __init__(self):
        self.store = {}

    def collection(self, name: str):
        return MockCollection(name, self.store)


@pytest.mark.asyncio
async def test_my_profile_stats_endpoint_streak_preservation_e2e():
    """Verify streak preservation end-to-end via /my-profile-stats HTTP endpoint."""
    cache.delete_prefix("profile_")
    mock_db = MockFirestore()

    # Staff directory for PIN auth
    mock_db.store["staff_directory"] = {
        "patna_rameshkumar": {
            "name": "Ramesh Kumar",
            "district": "Patna",
            "pin": "1234"
        }
    }

    # Reports for Thursday 2026-09-24 and Friday 2026-09-25
    mock_db.store["daily_field_reports"] = {
        "rep_2026-09-24": {
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "date_of_reporting": "2026-09-24",
            "notification_ids": ["N1", "N2"],
            "total_km": 15,
            "submission_count": 1
        },
        "rep_2026-09-25": {
            "fo_name": "Ramesh Kumar",
            "working_place": "Patna",
            "date_of_reporting": "2026-09-25",
            "notification_ids": ["N3"],
            "total_km": 10,
            "submission_count": 1
        }
    }

    # Saturday 2026-09-26 is approved Casual Leave
    mock_db.store["daily_staff_leaves"] = {
        "leave_2026-09-26": {
            "date": "2026-09-26",
            "district": "Patna",
            "fo_name": "Ramesh Kumar",
            "status": "leave",
            "reason_type": "Casual",
            "remark": "Family function",
            "is_override": True
        }
    }

    # Monday morning 2026-09-28 09:00 AM IST
    fake_now = datetime(2026, 9, 28, 9, 0, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))

    with patch("main.db", mock_db), patch("main.get_ist_now", return_value=fake_now):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
            res = await ac.post("/my-profile-stats", json={
                "working_place": "Patna",
                "fo_name": "Ramesh Kumar",
                "pin": "1234",
                "month": "2026-09"
            })
            assert res.status_code == 200, res.text
            data = res.json()
            assert data["success"] is True
            # Monday is unsubmitted; Sunday 09-27 is weekly off; Saturday 09-26 is Casual Leave;
            # Friday 09-25 and Thursday 09-24 are submitted.
            # Streak must bridge Sunday & Saturday, yielding streak_days = 2!
            assert data["streak_days"] == 2

