import pytest
from pathlib import Path
import sys
from unittest.mock import patch, MagicMock

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.routers.staff import (
    add_staff_member,
    delete_staff_member,
    toggle_staff_status,
    update_staff_pin,
    update_staff_details,
    AddStaffReq,
    DeleteStaffReq,
    ToggleStaffStatusReq,
    UpdatePinReq,
    UpdateStaffDetailsReq
)

@pytest.fixture(autouse=True)
def mock_snapshot_file():
    with patch("backend.routers.staff.os.path.exists", return_value=False):
        yield

@pytest.mark.asyncio
async def test_add_staff_invalidates_all_critical_cache_prefixes():
    with patch("backend.routers.staff.cache") as mock_cache, \
         patch("backend.routers.staff.invalidate_staff_directory_cache") as mock_inval_dir, \
         patch("backend.routers.staff.db") as mock_db, \
         patch("backend.routers.staff.log_admin_activity") as mock_log:
        
        mock_doc = MagicMock()
        mock_doc.get.return_value = MagicMock(exists=False)
        mock_db.collection.return_value.document.return_value = mock_doc
        
        admin = {"role": "SUPER_ADMIN", "username": "admin", "name": "Super Admin"}
        req = AddStaffReq(district="Patna", name="Test Officer", pin="1234", designation="Field Officer", target=50)
        
        await add_staff_member(req, admin)
        
        mock_cache.delete_prefix.assert_any_call("staff_list_")
        mock_cache.delete_prefix.assert_any_call("targets_")
        mock_cache.delete_prefix.assert_any_call("staff_targets_raw_")
        mock_cache.delete_prefix.assert_any_call("attendance_")
        mock_cache.delete_prefix.assert_any_call("statewide_top_")
        assert mock_inval_dir.called

@pytest.mark.asyncio
async def test_delete_staff_invalidates_staff_list_and_targets():
    with patch("backend.routers.staff.cache") as mock_cache, \
         patch("backend.routers.staff.invalidate_staff_directory_cache") as mock_inval_dir, \
         patch("backend.routers.staff.db") as mock_db, \
         patch("backend.routers.staff.log_admin_activity") as mock_log:
        
        mock_doc = MagicMock()
        mock_doc.get.return_value = MagicMock(exists=True)
        mock_db.collection.return_value.document.return_value = mock_doc
        
        admin = {"role": "SUPER_ADMIN", "username": "admin", "name": "Super Admin"}
        req = DeleteStaffReq(district="Patna", name="Test Officer")
        
        await delete_staff_member(req, admin)
        
        mock_cache.delete_prefix.assert_any_call("staff_list_")
        mock_cache.delete_prefix.assert_any_call("targets_")
        mock_cache.delete_prefix.assert_any_call("staff_targets_raw_")
        mock_cache.delete_prefix.assert_any_call("attendance_")
        mock_cache.delete_prefix.assert_any_call("statewide_top_")
        assert mock_inval_dir.called

@pytest.mark.asyncio
async def test_toggle_staff_status_invalidates_staff_list_and_targets():
    with patch("backend.routers.staff.cache") as mock_cache, \
         patch("backend.routers.staff.invalidate_staff_directory_cache") as mock_inval_dir, \
         patch("backend.routers.staff.db") as mock_db, \
         patch("backend.routers.staff.log_admin_activity") as mock_log:
        
        mock_doc = MagicMock()
        mock_doc.get.return_value = MagicMock(exists=True, to_dict=lambda: {"is_active": True})
        mock_db.collection.return_value.document.return_value = mock_doc
        
        admin = {"role": "SUPER_ADMIN", "username": "admin", "name": "Super Admin"}
        req = ToggleStaffStatusReq(district="Patna", fo_name="Test Officer", status="inactive")
        
        await toggle_staff_status(req, admin)
        
        mock_cache.delete_prefix.assert_any_call("staff_list_")
        mock_cache.delete_prefix.assert_any_call("targets_")
        mock_cache.delete_prefix.assert_any_call("staff_targets_raw_")
        mock_cache.delete_prefix.assert_any_call("attendance_")
        mock_cache.delete_prefix.assert_any_call("statewide_top_")
        assert mock_inval_dir.called

@pytest.mark.asyncio
async def test_update_staff_pin_invalidates_staff_list_and_targets():
    with patch("backend.routers.staff.cache") as mock_cache, \
         patch("backend.routers.staff.invalidate_staff_directory_cache") as mock_inval_dir, \
         patch("backend.routers.staff.db") as mock_db, \
         patch("backend.routers.staff.log_admin_activity") as mock_log:
        
        mock_doc = MagicMock()
        mock_doc.get.return_value = MagicMock(exists=True)
        mock_db.collection.return_value.document.return_value = mock_doc
        
        admin = {"role": "SUPER_ADMIN", "username": "admin", "name": "Super Admin"}
        req = UpdatePinReq(district="Patna", name="Test Officer", new_pin="9999")
        
        await update_staff_pin(req, admin)
        
        mock_cache.delete_prefix.assert_any_call("staff_list_")
        mock_cache.delete_prefix.assert_any_call("targets_")
        mock_cache.delete_prefix.assert_any_call("staff_targets_raw_")
        mock_cache.delete_prefix.assert_any_call("attendance_")
        mock_cache.delete_prefix.assert_any_call("statewide_top_")
        assert mock_inval_dir.called

@pytest.mark.asyncio
async def test_update_staff_details_invalidates_staff_list_and_targets():
    with patch("backend.routers.staff.cache") as mock_cache, \
         patch("backend.routers.staff.invalidate_staff_directory_cache") as mock_inval_dir, \
         patch("backend.routers.staff.db") as mock_db, \
         patch("backend.routers.staff.log_admin_activity") as mock_log:
        
        mock_doc = MagicMock()
        mock_doc.get.return_value = MagicMock(
            exists=True,
            to_dict=lambda: {"name": "Test Officer", "pin": "1234", "designation": "Field Officer"}
        )
        mock_db.collection.return_value.document.return_value = mock_doc
        
        admin = {"role": "SUPER_ADMIN", "username": "admin", "name": "Super Admin"}
        req = UpdateStaffDetailsReq(
            district="Patna",
            name="Test Officer",
            new_pin="1234",
            designation="Field Officer",
            target=75
        )
        
        await update_staff_details(req, admin)
        
        mock_cache.delete_prefix.assert_any_call("staff_list_")
        mock_cache.delete_prefix.assert_any_call("targets_")
        mock_cache.delete_prefix.assert_any_call("staff_targets_raw_")
        mock_cache.delete_prefix.assert_any_call("attendance_")
        mock_cache.delete_prefix.assert_any_call("statewide_top_")
        assert mock_inval_dir.called
