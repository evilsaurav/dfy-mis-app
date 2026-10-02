"""
DFY TB MIS Application - Modular FastAPI Server
Bihar Field Operations & State Health Monitoring
"""
import os
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Depends, BackgroundTasks, Request, Header, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# --- Core Infrastructure Re-exports (Backwards Compatibility for Tests & Scripts) ---
from backend.core.database import db, project_id, ENABLE_IN_MEMORY_DERIVATION
from backend.core.cache import cache, SimpleTTLCache, ACTIVE_MONTHLY_CACHE_KEYS
from backend.core.security import (
    JWT_SECRET_KEY,
    JWT_ALGORITHM,
    JWT_EXPIRATION_DAYS,
    hash_password,
    verify_password,
    create_access_token,
    get_current_admin,
    require_super_admin,
    get_optional_admin,
    login_rate_limiter,
    pin_rate_limiter
)
from backend.core.helpers import (
    IST_TIMEZONE,
    DEFAULT_BIHAR_DISTRICTS,
    get_ist_now,
    format_to_ist_time,
    parse_to_ist_datetime,
    canonicalize_district,
    normalize_staff_key,
    is_officer_name_match,
    get_previous_month,
    load_baseline_staff_directory,
    canonicalize_fo_name,
    get_profile_cache_key,
    evict_officer_profile_cache,
    get_reporting_cutoff_hour,
    get_active_operational_month,
    extract_client_info,
    get_ip_location,
    log_admin_activity
)
from backend.core.master_ledger import (
    STAFF_CACHE_KEY_RAW,
    get_cached_staff_directory_raw,
    invalidate_staff_directory_cache,
    get_cached_staff_targets_for_month,
    LAST_REPORTS_MODIFIED_TS,
    DELETED_REPORTS_TOMBSTONES,
    get_last_mutation_str,
    upsert_in_memory_report,
    record_report_mutation,
    get_raw_monthly_reports,
    format_dashboard_record,
    is_exempt_day,
    calculate_reporting_streak,
    compute_profile_response,
    get_directory
)
from backend.core.styles import (
    safe_filename,
    ExcelStreamingResponse,
    style_excel_worksheet,
    EXCEL_HEADER_BORDER,
    EXCEL_THIN_BORDER,
    EXCEL_TOTAL_ROW_BORDER,
    EXCEL_CLUSTER_DIVIDER
)

# --- Modular Routers ---
from backend.routers.auth import router as auth_router, AdminLoginReq, AdminChangePasswordReq, PinCheck, verify_pin
from backend.routers.targets import (
    router as targets_router,
    TargetUpdate,
    DistrictTargetUpdate,
    BulkDistrictTargetUpdate,
    BulkStaffTargetUpdate,
    get_targets,
    update_target,
    update_district_target,
    update_district_targets_bulk,
    update_targets_bulk
)
from backend.routers.backup import (
    router as backup_router,
    BackupRestoreReq,
    ensure_daily_backup_scheduled,
    check_and_trigger_daily_backup,
    get_backup_status,
    trigger_manual_backup,
    download_backup_file,
    restore_database_backup
)
from backend.routers.broadcasts import (
    router as broadcasts_router,
    BroadcastCreateReq,
    BroadcastDeleteReq
)
from backend.routers.attendance import (
    router as attendance_router,
    AttendanceRemarkReq,
    MarkLeaveReq,
    UnmarkLeaveReq,
    get_attendance_staff_roster,
    format_attendance_response,
    legacy_get_today_attendance,
    get_today_attendance,
    export_staff_attendance,
    export_summary_metrics,
    mark_leave,
    unmark_leave,
    add_attendance_remark,
    attendance_excel_semaphore
)
from backend.routers.kpi import (
    router as kpi_router,
    EXCEL_KPI_CATEGORIES,
    KPI_EXCEL_SEMAPHORE,
    get_kpi_tab_name,
    generate_district_kpi_bytes,
    generate_district_kpi_bytes_async,
    download_kpi_workbook,
    download_medicine_consumption,
    download_all_kpi_workbooks,
    download_excel
)
from backend.routers.staff import (
    router as staff_router,
    AddStaffReq,
    UpdatePinReq,
    UpdateStaffDetailsReq,
    DeleteStaffReq,
    ToggleStaffStatusReq,
    get_staff_directory,
    get_staff_full_list,
    add_staff_member,
    update_staff_pin,
    update_staff_details,
    delete_staff_member,
    toggle_staff_status,
    export_staff_pins
)
from backend.routers.nikshay import (
    router as nikshay_router,
    sync_nikshay_cumulative_ledger_sync,
    reconcile_nikshay,
    get_nikshay_sync_status,
    download_nikshay_review_sheet,
    get_cumulative_ledger,
    export_cumulative_ledger,
    get_patient_journey
)
from backend.routers.duplicates import (
    router as duplicates_router,
    RepairDuplicateRequest,
    duplicate_audit,
    get_district_notification_registry,
    scan_duplicate_notifications,
    repair_duplicate_notifications
)
from backend.routers.admin_feed import (
    router as admin_feed_router,
    EditIdRequest,
    AdminFeedDataRequest,
    DeleteDayReportReq,
    EditDayReportReq,
    admin_feed_officer_data,
    admin_delete_day_report,
    admin_edit_day_report,
    edit_patient_id,
    get_recent_id_edits
)
from backend.routers.rbac_audit import (
    router as rbac_audit_router,
    AdminUserLoginReq,
    AdminUserCreateReq,
    AdminUserUpdateReq,
    AuditLogQueryReq,
    init_default_super_admin,
    prune_expired_audit_logs,
    manual_prune_audit_logs,
    get_audit_logs,
    export_audit_logs
)
from backend.routers.top_performers import (
    router as top_performers_router,
    get_statewide_top_performers
)
from backend.routers.reports import (
    router as reports_router,
    DashboardRequest,
    DailyActivityReport,
    CheckStatusRequest,
    ProfileStatsRequest,
    PacingSettingsReq,
    DASHBOARD_DATA_SEMAPHORE,
    normalize_timestamp_str,
    get_dashboard_data,
    get_system_version,
    resolve_effective_reporting_date,
    check_today_status,
    fetch_district_notification_registry,
    get_district_90day_notified_ids,
    submit_daily_report,
    legacy_my_profile_stats,
    my_profile_stats,
    export_state_summary,
    compute_cascade_alerts,
    get_cascade_alerts,
    export_cascade_alerts,
    get_pacing_settings,
    update_pacing_settings
)

app = FastAPI(title="DFY TB MIS API", version="2.8.3")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach Modular Routers
app.include_router(auth_router)
app.include_router(targets_router)
app.include_router(backup_router)
app.include_router(broadcasts_router)
app.include_router(attendance_router)
app.include_router(kpi_router)
app.include_router(staff_router)
app.include_router(nikshay_router)
app.include_router(duplicates_router)
app.include_router(admin_feed_router)
app.include_router(rbac_audit_router)
app.include_router(top_performers_router)
app.include_router(reports_router)
# Target cache eviction: cache.delete_prefix("profile_") implemented in backend.routers.targets

@app.get("/")
@app.get("/health")
def health_status():
    return {
        "status": "healthy",
        "active_firebase_project": project_id,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.on_event("startup")
async def on_app_startup_tasks():
    await init_default_super_admin()
    asyncio.create_task(prune_expired_audit_logs(retention_days=30))
    ensure_daily_backup_scheduled()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
