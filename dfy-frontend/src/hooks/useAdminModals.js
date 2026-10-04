import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { downloadOrShareCanvas } from '../canvasShare';
import { feedCategoriesConfig, formatAuditTimestamp, TOP_PERFORMER_MESSAGES, canonicalizeDistrict, isOfficerNameMatch } from '../utils/districtHelpers';
import { getPreviousMonth } from '../utils/operationalMonth';

export function useAdminModals({
  month,
  currentUser,
  districts = [],
  targetModalDistricts = [],
  availableKpiDistricts = [],
  staffDirectory = {},
  setStaffDirectory,
  targetsData = [],
  setTargetsData,
  rawRecords = [],
  setRawRecords,
  staffList = [],
  setStaffList,
  fetchStaffList,
  fetchDirectory,
  loadTargets,
  selectedDistrict = 'All',
  activeBroadcasts = [],
  setActiveBroadcasts,
  fetchActiveBroadcasts,
  officialDistrictTarget = 0,
  setOfficialDistrictTarget,
  tempOfficialTargets = {},
  setTempOfficialTargets,
  topPerformersPeriod = 'weekly',
  setTopPerformersPeriod,
  adminTargetViewMode = 'official',
  topPerformersData,
  loadingTopPerformers = false,
  topPerformerRandomMsg = '',
  setTopPerformerRandomMsg,
  fetchTopPerformers,
  attendance,
  chronicDefaulters = [],
  attendanceDistrictFilter = 'All',
  setAttendanceDistrictFilter,
  attendanceTimeFilter = 'all',
  setAttendanceTimeFilter,
  attendanceSearchQuery = '',
  setAttendanceSearchQuery,
  inactiveStaffNamesSet = new Set(),
  attendanceDate,
  setAttendanceDate,
  fetchAttendance,
  isAttendanceLoading = false,
  activeAttendanceTab = 'missing',
  setActiveAttendanceTab,
  leaveActionModal,
  setLeaveActionModal,
  handleExecuteMarkLeave,
  handleExecuteUnmarkLeave,
  attendanceRemarkModal,
  setAttendanceRemarkModal,
  handleExecuteAttendanceRemark,
  isSavingAttendanceRemark = false,
  getSubmissionTimeClassification,
  reportsDistrict = '',
  setReportsDistrict,
  selectedKpiDistricts = [],
  handleToggleKpiDistrict,
  handleSelectAllKpiDistricts,
  handleClearKpiDistricts,
  isDownloadingKpi = false,
  handleDownloadKpi,
  canDownloadBulkZip = false,
  handleDownloadScopedZip,
  handleDownloadSequentialQueue,
  kpiQueueProgress,
  selectedMedDistricts = [],
  handleToggleMedDistrict,
  handleSelectAllMedDistricts,
  handleClearMedDistricts,
  isDownloadingMedicineReport = false,
  handleDownloadMedicineReport,
  handleDownloadMedicineReportScopedZip,
  handleDownloadMedicineReportQueue,
  medQueueProgress,
  selectedAttendanceDistricts = [],
  handleToggleAttendanceDistrict,
  handleSelectAllAttendanceDistricts,
  handleClearAttendanceDistricts,
  isDownloadingAttendance = false,
  handleDownloadAttendanceSingleOrScoped,
  handleDownloadStaffAttendanceQueue,
  attendanceQueueProgress,
  copyWhatsAppBulletin,
  liveWhatsAppBulletin,
  authFetch,
  getAdminToken,
  showToast,
  fetchData,
  setPassword
}) {
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // 1. Security Settings
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [changeCurrentPw, setChangeCurrentPw] = useState("");
  const [changeNewPw, setChangeNewPw] = useState("");
  const [securityStatusMsg, setSecurityStatusMsg] = useState("");
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  // 2. Cascade Alerts
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [cascadeData, setCascadeData] = useState({ summary: {}, alerts: [] });
  const [cascadeFilterDist, setCascadeFilterDist] = useState("All");
  const [cascadeRiskFilter, setCascadeRiskFilter] = useState("All");
  const [loadingCascade, setLoadingCascade] = useState(false);

  // 3. Recent ID Edits
  const [showRecentIdEditsModal, setShowRecentIdEditsModal] = useState(false);
  const [recentIdEdits, setRecentIdEdits] = useState([]);
  const [recentIdEditsLoading, setRecentIdEditsLoading] = useState(false);
  const [recentIdEditsFilterAction, setRecentIdEditsFilterAction] = useState('All');
  const [recentIdEditsSearch, setRecentIdEditsSearch] = useState('');

  // 4. Changelog
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  // 5. Patient Journey
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [journeyPatientId, setJourneyPatientId] = useState('');
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyResult, setJourneyResult] = useState(null);
  const [journeyError, setJourneyError] = useState('');

  // 6. Automated Backup
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupTriggerLoading, setBackupTriggerLoading] = useState(false);
  const [backupActionMsg, setBackupActionMsg] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreTargetFile, setRestoreTargetFile] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // 7. Top Performers Studio
  const [showTopPerformersModal, setShowTopPerformersModal] = useState(false);
  const topPerformersCanvasRef = useRef(null);

  // 8. Admin Users
  const [showAdminUsersModal, setShowAdminUsersModal] = useState(false);
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [userFormModal, setUserFormModal] = useState(null);

  // 9. Audit Trail
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilterAction, setAuditFilterAction] = useState('All');
  const [auditFilterAdmin, setAuditFilterAdmin] = useState('All');
  const [auditFilterTarget, setAuditFilterTarget] = useState('All');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [isPruningAudit, setIsPruningAudit] = useState(false);

  // 10. Broadcast Studio & Unread Popup
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [unreadBroadcastPopup, setUnreadBroadcastPopup] = useState(null);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);
  const [newBroadcastModal, setNewBroadcastModal] = useState(null);
  const [deleteBroadcastModal, setDeleteBroadcastModal] = useState(null);

  // 11. Notif Tray
  const [showNotifTrayModal, setShowNotifTrayModal] = useState(false);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [notifTrayFilterDistrict, setNotifTrayFilterDistrict] = useState('All');
  const [notifTraySearchQuery, setNotifTraySearchQuery] = useState('');
  const [notifTrayCategoryFilter, setNotifTrayCategoryFilter] = useState('all');
  const [isExportingNotifTray, setIsExportingNotifTray] = useState(false);
  const [notifTrayCopiedNotice, setNotifTrayCopiedNotice] = useState(false);
  const [notifTrayDistricts, setNotifTrayDistricts] = useState([]);

  // 12. App Guide SOP
  const [showAppGuideModal, setShowAppGuideModal] = useState(false);
  const [appGuideActiveTopic, setAppGuideActiveTopic] = useState('getting_started');
  const [appGuideSearchQuery, setAppGuideSearchQuery] = useState('');

  // 13. Nikshay Reconciler
  const [showNikshayModal, setShowNikshayModal] = useState(false);
  const [nikshayFile, setNikshayFile] = useState(null);
  const [nikshayResult, setNikshayResult] = useState(null);
  const [nikshayError, setNikshayError] = useState('');
  const [nikshayLoading, setNikshayLoading] = useState(false);
  const [nikshaySyncing, setNikshaySyncing] = useState(false);
  const [nikshayDistrict, setNikshayDistrict] = useState('All');
  const [nikshayMonth, setNikshayMonth] = useState(month || new Date().toISOString().slice(0, 7));
  const [nikshayActiveTab, setNikshayActiveTab] = useState('summary');
  const [ledgerViewMode, setLedgerViewMode] = useState('table');
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerDistrict, setLedgerDistrict] = useState('All');
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerExporting, setLedgerExporting] = useState(false);
  const [reviewExporting, setReviewExporting] = useState(false);
  const [nikshaySyncStatus, setNikshaySyncStatus] = useState(null);

  // 14. Admin Backdated Feeding
  const [showAdminFeedModal, setShowAdminFeedModal] = useState(false);
  const [feedDistrict, setFeedDistrict] = useState('');
  const [feedFoName, setFeedFoName] = useState('');
  const [feedDate, setFeedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedCategoryInputs, setFeedCategoryInputs] = useState({});
  const [feedVisitedNames, setFeedVisitedNames] = useState('');
  const [feedRemarks, setFeedRemarks] = useState('');
  const [feedTravelExpense, setFeedTravelExpense] = useState('');
  const [feedMorningKm, setFeedMorningKm] = useState('');
  const [feedEveningKm, setFeedEveningKm] = useState('');
  const [feedIsNextDay, setFeedIsNextDay] = useState(false);
  const [feedSubmissionCount, setFeedSubmissionCount] = useState(1);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedSuccess, setFeedSuccess] = useState('');
  const [feedShowAllCategories, setFeedShowAllCategories] = useState(false);

  // 15. Target Setting
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetModalMonth, setTargetModalMonth] = useState(month || new Date().toISOString().slice(0, 7));
  const [targetModalDistrict, setTargetModalDistrict] = useState('All');
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [bulkTargetValue, setBulkTargetValue] = useState("");
  const [isSavingDistrictTarget, setIsSavingDistrictTarget] = useState(false);
  const [isSavingBulkDistrictTargets, setIsSavingBulkDistrictTargets] = useState(false);
  const [targetModalTab, setTargetModalTab] = useState('official');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');

  // 16. Duplicate Radar
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [duplicateScanData, setDuplicateScanData] = useState(null);
  const [duplicateScanLoading, setDuplicateScanLoading] = useState(false);
  const [repairingDocId, setRepairingDocId] = useState(null);
  const [duplicateRadarTab, setDuplicateRadarTab] = useState("collisions");
  const [compareDistA, setCompareDistA] = useState("Jamui");
  const [compareDistB, setCompareDistB] = useState("Bhojpur");

  // 17. FO Inspector
  const [inspectingFO, setInspectingFO] = useState(null);
  const [foSearchId, setFoSearchId] = useState("");

  // 18. Staff Management Suite
  const [showStaffSuite, setShowStaffSuite] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffFilterDistrict, setStaffFilterDistrict] = useState("All");
  const [staffStatusFilter, setStaffStatusFilter] = useState('all');
  const [staffToggleModal, setStaffToggleModal] = useState(null);
  const [isTogglingStaff, setIsTogglingStaff] = useState(false);
  const [showPinMap, setShowPinMap] = useState({});
  const [pinChangeModal, setPinChangeModal] = useState(null);
  const [addStaffModal, setAddStaffModal] = useState(null);
  const [deleteStaffModal, setDeleteStaffModal] = useState(null);

  // 19. Admin Day Report Edits/Deletes
  const [adminEditModal, setAdminEditModal] = useState(null);
  const [deleteDayModal, setDeleteDayModal] = useState(null);
  const [editDayModal, setEditDayModal] = useState(null);

  // 20. Reports Studio
  const [showReportsStudio, setShowReportsStudio] = useState(false);
  const [reportsStudioTab, setReportsStudioTab] = useState("kpi_workbooks");

  // ==========================================
  // HANDLERS FOR ALL 24 ADMIN MODALS
  // ==========================================

  const availableFosForFeed = useMemo(() => {
    if (!feedDistrict) return [];
    const fromDir = staffDirectory[feedDistrict] || [];
    if (fromDir.length > 0) return fromDir;
    const fromRecs = Array.from(new Set((rawRecords || []).filter(r => r.working_place === feedDistrict).map(r => r.fo_name))).filter(Boolean).sort();
    return fromRecs;
  }, [staffDirectory, feedDistrict, rawRecords]);

  // 1. Security / Password Update
  const handleUpdatePassword = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSecurityStatusMsg('');
    if (!changeCurrentPw || !changeNewPw) {
      setSecurityStatusMsg('Please enter both current and new password.');
      return;
    }
    setIsSavingSecurity(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/auth/update-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: changeCurrentPw, new_password: changeNewPw })
      });
      const data = await res.json();
      if (res.ok) {
        if (typeof setPassword === 'function') setPassword(changeNewPw);
        setSecurityStatusMsg('✓ Password updated successfully!');
        setChangeCurrentPw('');
        setChangeNewPw('');
        if (showToast) showToast('✓ Password updated successfully!', 'success');
      } else {
        setSecurityStatusMsg(`Error: ${data.detail || 'Failed to update'}`);
      }
    } catch (err) {
      setSecurityStatusMsg('Failed to connect to server.');
    } finally {
      setIsSavingSecurity(false);
    }
  };

  // 2. Cascade Alerts Fetcher
  const fetchCascadeAlerts = useCallback(async () => {
    setLoadingCascade(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/admin/cascade-alerts${q}`);
      if (res.ok) {
        const data = await res.json();
        const unwrap = (data && data.data) ? data.data : (data || { summary: {}, alerts: [] });
        setCascadeData(unwrap);
      }
    } catch (e) {
      console.error("Cascade alerts fetch error", e);
    } finally {
      setLoadingCascade(false);
    }
  }, [month, authFetch, currentUser]);

  // 3. Recent ID Edits Fetcher
  const fetchRecentIdEdits = useCallback(async () => {
    setRecentIdEditsLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/recent-id-edits?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setRecentIdEdits(data.edits || []);
      }
    } catch (e) {
      console.error("Recent ID edits fetch error", e);
    } finally {
      setRecentIdEditsLoading(false);
    }
  }, [month, authFetch]);

  // 5. Patient Journey Fetcher
  const handleFetchJourney = useCallback(async (patientIdToFetch) => {
    const pId = patientIdToFetch || journeyPatientId;
    if (!pId || !pId.trim()) return;
    setJourneyLoading(true);
    setJourneyError('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/api/nikshay/patient-journey?patient_id=${encodeURIComponent(pId.trim())}`);
      const data = await res.json();
      if (res.ok) {
        setJourneyResult(data);
      } else {
        setJourneyError(data.detail || "Patient journey not found");
      }
    } catch (e) {
      setJourneyError("Failed to connect to server");
    } finally {
      setJourneyLoading(false);
    }
  }, [journeyPatientId, authFetch]);

  // 6. Automated Backup Handlers
  const fetchBackupStatus = useCallback(async () => {
    setBackupLoading(true);
    setBackupActionMsg('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/backup/status`);
      if (res.ok) {
        const data = await res.json();
        setBackupStatus(data);
      }
    } catch (err) {
      setBackupActionMsg(`⚠️ ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  }, [authFetch]);

  const handleTriggerBackupNow = async () => {
    setBackupTriggerLoading(true);
    setBackupActionMsg('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/backup/trigger-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Backup generation failed");
      if (showToast) showToast(`✓ Cloud Backup created: ${data.filename} (${data.size_kb} KB)`, "success");
      setBackupActionMsg(`✓ Snapshot saved to Cloud Storage: ${data.filename}`);
      fetchBackupStatus();
    } catch (err) {
      setBackupActionMsg(`⚠️ Error: ${err.message}`);
    } finally {
      setBackupTriggerLoading(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      if (showToast) showToast(`📥 Downloading ${filename}...`, "info");
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem('dfy_admin_token') || '');
      const url = `${API_BASE_URL}/admin/backup/download/${encodeURIComponent(filename)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const res = await fetch(url, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Download request failed");
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (showToast) showToast(`✓ Downloaded ${filename} successfully!`, "success");
    } catch (err) {
      if (showToast) showToast(`⚠️ Download failed: ${err.message}`, "error");
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreTargetFile) return;
    if (restoreConfirmText.trim() !== 'RESTORE-CONFIRM') {
      alert("Please type RESTORE-CONFIRM exactly into the confirmation box to proceed.");
      return;
    }
    if (!window.confirm(`⚠️ CAUTION: Restore database from ${restoreTargetFile}?`)) return;
    setRestoreLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/backup/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: restoreTargetFile, confirmation_code: restoreConfirmText.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Restore operation failed");
      alert(`✓ Database restore successful! ${data.restored_documents || 0} documents restored.`);
      setRestoreTargetFile(null);
      setRestoreConfirmText('');
      if (typeof fetchData === 'function') fetchData(true);
    } catch (err) {
      alert(`⚠️ Restore Error: ${err.message}`);
    } finally {
      setRestoreLoading(false);
    }
  };

  // 8. Admin Users Handlers
  const fetchAdminUsers = useCallback(async () => {
    setAdminUsersLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/users/list`);
      if (res.ok) {
        const data = await res.json();
        setAdminUsersList(data.users || []);
      }
    } catch (e) {
      console.error("Failed to load admin users", e);
    } finally {
      setAdminUsersLoading(false);
    }
  }, [authFetch]);

  const saveAdminUser = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!userFormModal) return;
    setUserFormModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const endpoint = userFormModal.mode === 'create' ? "/admin/users/create" : "/admin/users/update";
      const payload = userFormModal.mode === 'create' ? {
        username: userFormModal.username,
        name: userFormModal.name,
        password: userFormModal.password,
        role: userFormModal.role,
        allowed_districts: userFormModal.allowed_districts,
        permissions: userFormModal.permissions,
        status: "ACTIVE",
        created_by: currentUser?.name || "Super Admin"
      } : {
        user_id: userFormModal.user_id,
        name: userFormModal.name,
        password: userFormModal.password || undefined,
        role: userFormModal.role,
        allowed_districts: userFormModal.allowed_districts,
        permissions: userFormModal.permissions,
        status: "ACTIVE"
      };

      const res = await authFetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save user");
      setUserFormModal(null);
      fetchAdminUsers();
      if (showToast) showToast(userFormModal.mode === 'create' ? "New Admin User created!" : "Admin User updated!", "success");
    } catch (err) {
      setUserFormModal(prev => ({ ...prev, error: err.message, loading: false }));
    }
  };

  const deleteAdminUser = async (userId) => {
    if (!window.confirm(`Are you sure you want to delete admin user "${userId}"?`)) return;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/users/delete?user_id=${encodeURIComponent(userId)}`, { method: "POST" });
      if (res.ok) {
        fetchAdminUsers();
        if (showToast) showToast(`User ${userId} deleted successfully.`, "success");
      } else {
        const d = await res.json();
        if (showToast) showToast(d.detail || "Error deleting user.", "error");
      }
    } catch (err) {
      if (showToast) showToast("Network error while deleting user.", "error");
    }
  };

  // 9. Audit Trail Handlers
  const fetchAuditLogs = useCallback(async (overrideAction, overrideDist, overrideUser, overrideSearch) => {
    setAuditLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const effectiveAction = overrideAction !== undefined ? overrideAction : auditFilterAction;
      const effectiveDist = overrideDist !== undefined ? overrideDist : auditFilterTarget;
      const effectiveUser = overrideUser !== undefined ? overrideUser : auditFilterAdmin;
      const effectiveSearch = overrideSearch !== undefined ? overrideSearch : auditSearchQuery;

      const res = await authFetch(`${API_BASE_URL}/admin/audit-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: effectiveAction,
          action_filter: effectiveAction,
          district: effectiveDist,
          district_filter: effectiveDist,
          user_id: effectiveUser,
          user_filter: effectiveUser,
          search: effectiveSearch,
          limit: 300
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setAuditLoading(false);
    }
  }, [auditFilterAction, auditFilterTarget, auditFilterAdmin, auditSearchQuery, authFetch]);

  const exportAuditLogsExcel = () => {
    if (!auditLogs || auditLogs.length === 0) {
      if (showToast) showToast("No audit logs to export.", "info");
      return;
    }
    const headers = ["Timestamp", "Actor", "Role", "Action", "Target", "Details", "IP Address"];
    const rows = auditLogs.map(l => [
      formatAuditTimestamp(l.timestamp),
      l.actor_username || "Unknown",
      l.actor_role || "—",
      l.action || "—",
      l.target_identifier || "—",
      JSON.stringify(l.details || {}),
      l.ip_address || "—"
    ]);
    const tsvContent = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
    const blob = new Blob([tsvContent], { type: "text/tab-separated-values;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.tsv`;
    link.click();
    if (showToast) showToast("✓ Audit logs exported successfully!", "success");
  };

  const handleManualPruneAuditLogs = async () => {
    if (!window.confirm("Purge audit logs older than 90 days?")) return;
    setIsPruningAudit(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/audit-logs/prune`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (showToast) showToast(`✓ ${data.pruned_count || 0} old audit logs pruned.`, "success");
        fetchAuditLogs();
      } else {
        if (showToast) showToast(data.detail || "Failed to prune audit logs.", "error");
      }
    } catch (err) {
      if (showToast) showToast("Network error during audit log pruning.", "error");
    } finally {
      setIsPruningAudit(false);
    }
  };

  // 10. Broadcast Bulletin Handlers
  const dismissBroadcastPopup = (id) => {
    try {
      const seenIds = JSON.parse(localStorage.getItem('dfy_seen_broadcasts') || '[]');
      if (!seenIds.includes(id)) {
        seenIds.push(id);
        localStorage.setItem('dfy_seen_broadcasts', JSON.stringify(seenIds));
      }
    } catch (e) {}
    setUnreadBroadcastPopup(null);
  };

  const fetchAllBroadcasts = useCallback(async () => {
    try {
      setBroadcastLoading(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let distParam = '';
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        distParam = `?districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/api/broadcasts/all${distParam}`);
      if (res.ok) {
        const data = await res.json();
        setBroadcastHistory(data.broadcasts || []);
      }
    } catch (e) {
      console.error("Failed to fetch all broadcasts", e);
    } finally {
      setBroadcastLoading(false);
    }
  }, [currentUser, authFetch]);

  const handleCreateBroadcast = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!newBroadcastModal) return;
    const { title, message, priority, target_audience, target_districts } = newBroadcastModal;
    if (!title || !title.trim()) {
      setNewBroadcastModal(prev => ({ ...prev, error: "Please enter announcement title." }));
      return;
    }
    if (!message || !message.trim()) {
      setNewBroadcastModal(prev => ({ ...prev, error: "Please enter announcement message body." }));
      return;
    }
    if (!target_districts || target_districts.length === 0) {
      setNewBroadcastModal(prev => ({ ...prev, error: "Please select at least one district." }));
      return;
    }

    setNewBroadcastModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/api/broadcasts/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          priority: priority || "MEDIUM",
          target_audience: target_audience || "ALL",
          target_districts,
          created_by_user: currentUser?.name || currentUser?.username || "Admin",
          created_by_role: currentUser?.role || "SUPER_ADMIN",
          allowed_districts: currentUser?.allowed_districts || ["All"]
        })
      });
      if (res.ok) {
        setNewBroadcastModal(null);
        fetchAllBroadcasts();
        if (typeof fetchActiveBroadcasts === 'function') fetchActiveBroadcasts();
      } else {
        const data = await res.json();
        setNewBroadcastModal(prev => ({ ...prev, error: data.detail || "Failed to create broadcast.", loading: false }));
      }
    } catch (err) {
      setNewBroadcastModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleDeleteBroadcast = async (broadcast_id) => {
    if (!window.confirm("Delete this broadcast alert?")) return;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/api/broadcasts/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          broadcast_id,
          requested_by_user: currentUser?.username || "admin",
          requested_by_role: currentUser?.role || "SUPER_ADMIN",
          allowed_districts: currentUser?.allowed_districts || ["All"]
        })
      });
      if (res.ok) {
        setBroadcastHistory(prev => prev.filter(b => b.id !== broadcast_id));
        if (unreadBroadcastPopup && unreadBroadcastPopup.id === broadcast_id) {
          setUnreadBroadcastPopup(null);
        }
      }
    } catch (e) {
      alert("Network error while deleting broadcast.");
    }
  };

  // 11. Notif Tray Helpers
  const copyToClipboardWithFallback = async (text, successMsg) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setNotifTrayCopiedNotice(true);
      setTimeout(() => setNotifTrayCopiedNotice(false), 3000);
      if (showToast) showToast(successMsg || "Copied to clipboard!", "success");
    } catch (e) {
      if (showToast) showToast("Failed to copy", "error");
    }
  };

  const NOTIF_TRAY_24_HEADERS = [
    "Sl No", "FO Name", "Date of Reporting (DD-MM-YYYY)", "District",
    "TBU Name", "Mapped PHI Name", "Patient's Name", "ID",
    "Vill", "Panchayat", "Block", "District",
    "Land Mark", "Mob No", "X-ray Done (Y/N)", "Sample Collection (Y/N)",
    "Report Delivered (Y/N)", "DM (Y/N)", "HIV (Y/N)", "Drug Source (NTEP/Private)",
    "Others", "Address", "Diagnosis Date", "Enrollment Date"
  ];

  const build24ColTsv = (items) => {
    const headerLine = NOTIF_TRAY_24_HEADERS.join('\t');
    const rowLines = (items || []).map((item, idx) => {
      const row = new Array(24).fill('');
      row[0] = String(idx + 1);                       // Sl No
      row[1] = item.fo_name || '';                    // FO Name
      row[2] = item.date_formatted || '';             // Date of Reporting (DD-MM-YYYY)
      row[3] = item.district || '';                   // District
      row[7] = item.id || '';                         // ID (Episode ID)
      return row.join('\t');
    });
    return [headerLine, ...rowLines].join('\n');
  };

  const handleClearNotifDistricts = () => setNotifTrayDistricts([]);
  const handleSelectAllNotifDistricts = () => setNotifTrayDistricts(availableKpiDistricts || districts || []);
  const handleToggleNotifDistrict = (d) => {
    setNotifTrayDistricts(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  };

  const notifTrayData = useMemo(() => {
    const list = [];
    const now = new Date();

    const filteredRecords = (rawRecords || []).filter(r => {
      const dist = canonicalizeDistrict(r.working_place || r.district || '');
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
        if (!allowed.includes(dist)) return false;
      }
      if (notifTrayDistricts && notifTrayDistricts.length > 0 && !notifTrayDistricts.includes('All')) {
        const canonicalNotifDistricts = notifTrayDistricts.map(canonicalizeDistrict);
        if (!canonicalNotifDistricts.includes(dist)) return false;
      }
      return true;
    });

    filteredRecords.forEach(r => {
      const dist = canonicalizeDistrict(r.working_place || r.district || '');
      const fo = r.fo_name || r.officer_name || 'Field Officer';
      const rawDate = r.date_of_reporting || r.date || '';
      const ids = Array.isArray(r.notification_ids) ? r.notification_ids : [];

      let daysElapsed = 0;
      let ddmmyyyy = rawDate;
      if (rawDate && rawDate.length >= 10) {
        try {
          const parts = rawDate.slice(0, 10).split('-');
          if (parts.length === 3) {
            ddmmyyyy = `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
            const repDt = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
            daysElapsed = Math.max(0, Math.floor((now - repDt) / (1000 * 60 * 60 * 24)));
          }
        } catch (e) {}
      }

      ids.forEach(idStr => {
        const cleanId = String(idStr).trim();
        if (cleanId) {
          list.push({
            id: cleanId,
            fo_name: fo,
            date_raw: rawDate.slice(0, 10),
            date_formatted: ddmmyyyy,
            district: dist,
            days_elapsed: daysElapsed,
            presumptive: r.presumptive || 0,
            sample_tested: r.sample_tested || 0,
            notifications: r.notifications || 0,
            dbt: r.dbt || 0,
            hiv_dm: r.hiv_dm || 0,
            fdc_provided: r.fdc_provided || 0,
            follow_ups: r.follow_ups || r.follow_up || 0,
            home_visits: r.home_visits || r.home_visit || 0,
            contact_tracing: r.contact_tracing || 0,
            differentiated_tb: r.differentiated_tb || 0,
            documents: r.documents || 0,
            kit_consumption: r.kit_consumption || 0,
            tpt_treatment_start: r.tpt_treatment_start || 0,
            tpt_presumptive: r.tpt_presumptive || 0,
            adhar_face_auth: r.adhar_face_auth || r.adhar_face_authentication || 0,
            consent_with_id: r.consent_with_id || 0,
            culture_dst: r.culture_dst || 0
          });
        }
      });
    });

    // Sort descending by date_raw (latest dates first), then fo_name
    list.sort((a, b) => {
      const dateCmp = (b.date_raw || '').localeCompare(a.date_raw || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.fo_name || '').localeCompare(b.fo_name || '');
    });

    const latestDateRaw = list.length > 0 ? list[0].date_raw : null;
    const latestDateFormatted = list.length > 0 ? list[0].date_formatted : null;

    const lastDayItems = latestDateRaw ? list.filter(item => item.date_raw === latestDateRaw) : [];
    const lastDayIds = Array.from(new Set(lastDayItems.map(i => i.id)));
    const allIds = Array.from(new Set(list.map(i => i.id)));
    const uniqueFOs = Array.from(new Set(list.map(i => i.fo_name)));

    return {
      allItems: list,
      lastDayItems,
      lastDayIds,
      allIds,
      latestDateRaw,
      latestDateFormatted,
      uniqueFOCount: uniqueFOs.length
    };
  }, [rawRecords, notifTrayDistricts, currentUser]);

  // 13. Nikshay Reconciler Handlers
  const fetchCumulativeLedger = useCallback(async (page = 1, search = '', dist = ledgerDistrict) => {
    setLedgerLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const q = `?page=${page}&limit=50&district=${encodeURIComponent(dist || 'All')}&search=${encodeURIComponent(search)}`;
      const res = await authFetch(`${API_BASE_URL}/admin/nikshay/cumulative-ledger${q}`);
      if (res.ok) {
        const data = await res.json();
        setLedgerData(data || { patients: [], metrics: {}, total_records: 0, total_pages: 1 });
      }
    } catch (e) {
      console.error("Cumulative ledger fetch error", e);
    } finally {
      setLedgerLoading(false);
    }
  }, [ledgerDistrict, authFetch]);

  const fetchNikshaySyncStatus = useCallback(async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem('dfy_admin_token') || '');
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/sync-status`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setNikshaySyncStatus(data);
      }
    } catch (e) {
      console.warn("Failed to fetch nikshay sync status", e);
    }
  }, [getAdminToken]);

  const handleReconcileNikshay = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!nikshayFile) {
      setNikshayError('Please select a Nikshay Excel file first.');
      return;
    }
    setNikshayLoading(true);
    setNikshayError('');
    try {
      const formData = new FormData();
      formData.append('file', nikshayFile);
      formData.append('month', nikshayMonth || month);
      formData.append('district', nikshayDistrict);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem('dfy_admin_token') || '');
      const res = await fetch(`${API_BASE_URL}/admin/reconcile-nikshay`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Reconciliation failed');
      }
      const data = await res.json();
      setNikshayResult(data);
      fetchCumulativeLedger(1, '', nikshayDistrict);
      fetchNikshaySyncStatus();
    } catch (err) {
      setNikshayError(err.message || 'Error running reconciliation');
    } finally {
      setNikshayLoading(false);
    }
  };

  const handleDownloadReviewSheet = async () => {
    setReviewExporting(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem('dfy_admin_token') || '');
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/download-review-sheet?district=${encodeURIComponent(nikshayDistrict || 'All')}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Failed to download review sheet');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DFY_Field_Review_Sheet_${nikshayDistrict || 'All'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Failed to download review sheet: ' + err.message);
    } finally {
      setReviewExporting(false);
    }
  };

  const handleExportCumulativeLedger = async () => {
    setLedgerExporting(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem('dfy_admin_token') || '');
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/cumulative-ledger/export?district=${encodeURIComponent(ledgerDistrict || 'All')}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Ledger export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Nikshay_Cumulative_Ledger_${ledgerDistrict || 'All'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Failed to export cumulative ledger: ' + err.message);
    } finally {
      setLedgerExporting(false);
    }
  };

  // 14. Admin Backdated Feeding Handler
  const handleAdminFeedSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFeedError('');
    setFeedSuccess('');
    if (!feedDistrict || feedDistrict === 'All') {
      setFeedError('Please select a specific District.');
      return;
    }
    if (!feedFoName || !feedFoName.trim()) {
      setFeedError('Please select or specify a Field Officer name.');
      return;
    }
    if (!feedDate || !/^\d{4}-\d{2}-\d{2}$/.test(feedDate)) {
      setFeedError('Please enter a valid reporting date (YYYY-MM-DD).');
      return;
    }

    const payload = {
      district: feedDistrict.trim(),
      fo_name: feedFoName.trim(),
      date_of_reporting: feedDate.trim(),
      remark: feedRemarks ? feedRemarks.trim() : `Admin feed by ${currentUser?.name || 'Admin'}`
    };

    let totalIdsCount = 0;
    const invalidTokens = [];
    const idKeys = [
      'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_tested_ids',
      'sample_collection_ids', 'contact_tracing_ids', 'differentiated_tb_ids',
      'outcome_assigned_ids', 'home_visit_ids', 'follow_up_ids',
      'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
      'kit_consumption_ids', 'tpt_treatment_start_ids', 'tpt_presumptive_ids',
      'adhar_face_authentication_ids', 'consent_with_id_ids', 'culture_dst_ids'
    ];

    idKeys.forEach(k => {
      const rawText = feedCategoryInputs[k] || '';
      if (rawText && rawText.trim()) {
        const tokens = rawText.split(/[\s,;\n\r\t]+/).map(t => t.trim()).filter(Boolean);
        const is8or9 = (k === 'fdc_provided_ids' || k === 'outcome_assigned_ids');
        const tokenRegex = is8or9 ? /^\d{8,9}$/ : /^\d{9}$/;
        const validList = [];
        tokens.forEach(tok => {
          if (tokenRegex.test(tok)) validList.push(tok);
          else invalidTokens.push(tok);
        });
        const uniqueList = Array.from(new Set(validList));
        payload[k] = uniqueList;
        totalIdsCount += uniqueList.length;
      } else {
        payload[k] = [];
      }
    });

    if (totalIdsCount === 0) {
      setFeedError('Please enter at least one valid Patient ID in any category.');
      return;
    }
    if (invalidTokens.length > 0) {
      setFeedError(`The following item(s) are NOT valid 9-digit numeric IDs: ${invalidTokens.slice(0, 5).join(', ')}`);
      return;
    }

    setFeedLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/feed-officer-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setFeedSuccess(`✓ Saved successfully for ${feedFoName} on ${feedDate}!`);
        setFeedCategoryInputs({});
        setFeedRemarks('');
        if (typeof fetchData === 'function') fetchData(true);
        if (showToast) showToast("✓ Admin feed saved successfully!", "success");
      } else {
        const data = await res.json();
        setFeedError(data.detail || "Failed to submit feed data.");
      }
    } catch (err) {
      setFeedError("Network error while submitting feed data.");
    } finally {
      setFeedLoading(false);
    }
  };

  // 15. Target Setting Handlers
  const frontlineAllocated = useMemo(() => {
    return (targetsData || []).reduce((acc, t) => acc + (Number(t.target) || 0), 0);
  }, [targetsData]);

  const handleTargetChange = (districtName, foName, value) => {
    if (typeof setTargetsData !== 'function') return;
    setTargetsData(prev => {
      const cDist = canonicalizeDistrict(districtName);
      const parsed = value === '' ? '' : Number(value);
      const idx = (prev || []).findIndex(t => 
        canonicalizeDistrict(t.district) === cDist && 
        isOfficerNameMatch(t.fo_name, foName, cDist)
      );
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], target: parsed };
        return updated;
      } else {
        return [...(prev || []), { fo_name: foName, district: districtName, target: parsed }];
      }
    });
  };

  const handleCopyFromLastMonth = async () => {
    const prevM = getPreviousMonth(targetModalMonth);
    if (!prevM) return;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${prevM}`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      if (showToast) showToast(`Loading targets from ${prevM}...`, 'info');
      const res = await authFetch(`${API_BASE_URL}/admin/targets${q}`);
      const data = await res.json();
      if (data && Array.isArray(data.targets) && typeof setTargetsData === 'function') {
        const copied = data.targets.map(t => ({ ...t, month: targetModalMonth }));
        setTargetsData(copied);
        if (showToast) showToast(`✓ Copied targets from ${prevM}!`, 'success');
      }
    } catch (e) {
      if (showToast) showToast('Failed to copy targets from last month', 'error');
    }
  };

  const handleSaveSingleDistrictTarget = useCallback(async (distName, targetVal) => {
    if (!distName) return;
    const val = Number(targetVal);
    if (isNaN(val) || val < 0) {
      if (showToast) showToast('Target must be a non-negative number', 'error');
      return;
    }
    setIsSavingDistrictTarget(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("dfy_admin_token") || currentUser?.token);
      const targetMonth = targetModalMonth || month;
      const res = await fetch(`${API_BASE_URL}/update-district-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ month: targetMonth, district: distName, official_target: val })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(`Official target for ${distName} saved (${val})!`, 'success');
        if (targetModalDistrict === distName && setOfficialDistrictTarget) {
          setOfficialDistrictTarget(val);
        }
        if (typeof loadTargets === 'function') {
          await loadTargets(selectedDistrict || 'All', targetMonth);
        }
        if (typeof fetchData === 'function') {
          await fetchData(false);
        }
      } else {
        if (showToast) showToast(data.detail || `Failed to save target for ${distName}`, 'error');
      }
    } catch (err) {
      if (showToast) showToast('Network error saving district target', 'error');
    } finally {
      setIsSavingDistrictTarget(false);
    }
  }, [getAdminToken, currentUser, targetModalMonth, month, selectedDistrict, loadTargets, fetchData, showToast, targetModalDistrict, setOfficialDistrictTarget]);

  const handleSaveBulkDistrictTargets = useCallback(async () => {
    setIsSavingBulkDistrictTargets(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("dfy_admin_token") || currentUser?.token);
      const targetMonth = targetModalMonth || month;
      const payloadTargets = (targetModalDistricts || []).map(dist => ({
        district: dist,
        official_target: Math.max(0, Number(tempOfficialTargets?.[dist] ?? officialDistrictTarget ?? 0))
      }));
      const res = await fetch(`${API_BASE_URL}/update-district-targets-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ month: targetMonth, targets: payloadTargets })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast(`✓ All ${payloadTargets.length} district official targets saved!`, 'success');
        if (typeof loadTargets === 'function') {
          await loadTargets(selectedDistrict || 'All', targetMonth);
        }
        if (typeof fetchData === 'function') {
          await fetchData(false);
        }
      } else {
        if (showToast) showToast(data.detail || 'Failed to bulk save district targets', 'error');
      }
    } catch (err) {
      if (showToast) showToast('Network error saving bulk targets', 'error');
    } finally {
      setIsSavingBulkDistrictTargets(false);
    }
  }, [getAdminToken, currentUser, targetModalDistricts, tempOfficialTargets, officialDistrictTarget, targetModalMonth, month, selectedDistrict, loadTargets, fetchData, showToast]);

  const saveAllTargets = useCallback(async () => {
    setIsSavingTargets(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("dfy_admin_token") || currentUser?.token);
      const targetMonth = targetModalMonth || month;
      const res = await fetch(`${API_BASE_URL}/update-targets-bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ month: targetMonth, targets: targetsData })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (showToast) showToast('✓ Frontline targets saved successfully!', 'success');
        if (typeof loadTargets === 'function') {
          await loadTargets(selectedDistrict || 'All', targetMonth);
        }
        if (typeof fetchData === 'function') {
          await fetchData(false);
        }
      }
    } catch (err) {
      console.error("saveAllTargets error", err);
    } finally {
      setIsSavingTargets(false);
    }
  }, [getAdminToken, currentUser, targetModalMonth, month, targetsData, selectedDistrict, loadTargets, fetchData, showToast]);

  const handleSaveAllTargetsCombined = useCallback(async () => {
    await handleSaveBulkDistrictTargets();
    await saveAllTargets();
    const targetMonth = targetModalMonth || month;
    if (typeof loadTargets === 'function') {
      await loadTargets(selectedDistrict || 'All', targetMonth);
    }
    if (typeof fetchData === 'function') {
      await fetchData(false);
    }
    if (showToast) showToast('✓ All Official Targets & Frontline Allocations Saved!', 'success');
  }, [handleSaveBulkDistrictTargets, saveAllTargets, selectedDistrict, targetModalMonth, month, loadTargets, fetchData, showToast]);

  const handleExecuteTargetSave = useCallback(async (districtOrPayload, foNameArg, targetValArg, monthArg) => {
    let district, fo_name, target, targetMonth;
    if (districtOrPayload && typeof districtOrPayload === 'object' && !districtOrPayload.preventDefault) {
      district = districtOrPayload.district;
      fo_name = districtOrPayload.fo_name || districtOrPayload.officer_name || districtOrPayload.name;
      target = districtOrPayload.target;
      targetMonth = districtOrPayload.month || targetModalMonth || month;
    } else {
      district = districtOrPayload;
      fo_name = foNameArg;
      target = targetValArg;
      targetMonth = monthArg || targetModalMonth || month;
    }

    if (!district || !fo_name) {
      if (showToast) showToast("District and Field Officer name are required to set target.", "error");
      return false;
    }

    const numTarget = Number(target);
    if (isNaN(numTarget) || numTarget < 0) {
      if (showToast) showToast("Target must be a non-negative number", "error");
      return false;
    }

    setIsSavingTargets(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("dfy_admin_token") || currentUser?.token);
      const payload = {
        district,
        fo_name,
        target: numTarget,
        month: targetMonth
      };

      const res = await fetch(`${API_BASE_URL}/update-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && (data.success || data.message || !data.detail)) {
        if (showToast) showToast(`✓ Target for ${fo_name} (${district}) updated successfully!`, "success");
        if (typeof loadTargets === 'function') {
          await loadTargets(selectedDistrict || 'All', targetMonth);
        }
        if (typeof fetchData === 'function') {
          await fetchData(false);
        }
        return true;
      } else {
        if (showToast) showToast(data.detail || `Failed to update target for ${fo_name}`, "error");
        return false;
      }
    } catch (err) {
      console.error("Error updating target:", err);
      if (showToast) showToast("Network error updating target", "error");
      return false;
    } finally {
      setIsSavingTargets(false);
    }
  }, [getAdminToken, currentUser, targetModalMonth, month, selectedDistrict, loadTargets, fetchData, showToast]);

  // 16. Duplicate Radar Handlers
  const fetchDuplicateAudit = useCallback(async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/duplicate-audit?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateAudit(data);
      }
    } catch (e) {
      console.error("Duplicate audit fetch error", e);
    }
  }, [month, authFetch]);

  const fetchDuplicateScan = useCallback(async (force = false) => {
    setDuplicateScanLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const url = `${API_BASE_URL}/admin/duplicate-scan?month=${month}${force ? '&force=true' : ''}`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setDuplicateScanData(data);
      }
    } catch (e) {
      console.error("Duplicate scan fetch error", e);
    } finally {
      setDuplicateScanLoading(false);
    }
  }, [month, authFetch]);

  const handleRepairDuplicate = async (instance) => {
    if (!instance || !instance.repeat_doc_id || repairingDocId) return;
    setRepairingDocId(instance.repeat_doc_id);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const targetMonth = duplicateScanData?.month || month;
      const res = await authFetch(`${API_BASE_URL}/admin/repair-duplicate-notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: targetMonth,
          district: instance.district,
          instance_doc_id: instance.repeat_doc_id,
          duplicate_ids: instance.duplicate_ids
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        const removed = data.removed_count || instance.duplicate_ids?.length || 0;
        if (showToast) showToast(`✓ Removed ${removed} duplicate notification ID(s)!`, 'success');
        await Promise.all([
          fetchDuplicateScan(true),
          fetchDuplicateAudit(),
          typeof fetchData === 'function' ? fetchData(true) : Promise.resolve()
        ]);
      } else {
        if (showToast) showToast(data.detail || "Failed to repair duplicates.", "error");
      }
    } catch (err) {
      if (showToast) showToast("Network error during repair.", "error");
    } finally {
      setRepairingDocId(null);
    }
  };

  // 18. Staff Management Handlers
  const handleExecuteUpdatePin = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!pinChangeModal) return;
    const { name, district, newPin, designation, target } = pinChangeModal;
    if (!newPin || newPin.trim().length !== 4 || !/^\d+$/.test(newPin.trim())) {
      setPinChangeModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits." }));
      return;
    }
    setPinChangeModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const payload = {
        district,
        name,
        new_pin: newPin.trim(),
        designation: designation || "Field Officer"
      };
      if (target !== undefined && target !== null && !isNaN(Number(target))) {
        payload.target = Number(target);
      }
      const res = await authFetch(`${API_BASE_URL}/admin/staff/update-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve()
        ]);
        setPinChangeModal(null);
        if (showToast) showToast("✓ Staff details updated successfully!", "success");
      } else {
        const data = await res.json();
        setPinChangeModal(prev => ({ ...prev, error: data.detail || "Failed to update staff.", loading: false }));
      }
    } catch (err) {
      setPinChangeModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleExecuteAddStaff = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!addStaffModal) return;
    const { district, name, pin, designation, target } = addStaffModal;
    if (!name || !name.trim()) {
      setAddStaffModal(prev => ({ ...prev, error: "Officer Name is required." }));
      return;
    }
    if (!pin || pin.trim().length !== 4 || !/^\d+$/.test(pin.trim())) {
      setAddStaffModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits." }));
      return;
    }

    const cleanDist = district || 'Jamui';
    const cleanName = name.trim();
    const cleanPin = pin.trim();
    const cleanDesig = designation || 'Field Officer';
    const numTarget = Number(target) || 50;

    // ⚡ Optimistic UI Update (0ms perceived latency)
    const newOfficer = {
      district: cleanDist,
      name: cleanName,
      pin: cleanPin,
      designation: cleanDesig,
      target: numTarget,
      status: 'active',
      is_active: true
    };

    if (typeof setStaffList === 'function') {
      setStaffList(prev => [...(prev || []).filter(s => !(s.name === cleanName && s.district === cleanDist)), newOfficer]);
    }
    if (typeof setStaffDirectory === 'function') {
      setStaffDirectory(prev => {
        const distOfficers = prev?.[cleanDist] ? [...prev[cleanDist]] : [];
        if (!distOfficers.includes(cleanName)) distOfficers.push(cleanName);
        return { ...(prev || {}), [cleanDist]: distOfficers.sort() };
      });
    }

    setAddStaffModal(null);
    if (showToast) showToast("✓ New staff officer registered!", "success");

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: cleanDist,
          name: cleanName,
          pin: cleanPin,
          designation: cleanDesig,
          target: numTarget
        })
      });
      if (res.ok) {
        Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve(),
          typeof fetchTopPerformers === 'function' ? fetchTopPerformers(topPerformersPeriod) : Promise.resolve()
        ]).catch(e => console.warn("Background staff refresh error:", e));
      } else {
        const data = await res.json();
        if (showToast) showToast(data.detail || "Failed to add officer on server.", "error");
        if (typeof fetchStaffList === 'function') fetchStaffList();
        if (typeof fetchDirectory === 'function') fetchDirectory();
      }
    } catch (err) {
      if (showToast) showToast("Network error registering staff.", "error");
      if (typeof fetchStaffList === 'function') fetchStaffList();
      if (typeof fetchDirectory === 'function') fetchDirectory();
    }
  };

  const handleExecuteDeleteStaff = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!deleteStaffModal) return;
    const { name, district } = deleteStaffModal;

    // ⚡ Optimistic UI Update (0ms latency)
    if (typeof setStaffList === 'function') {
      setStaffList(prev => (prev || []).filter(s => !(s.name === name && s.district === district)));
    }
    if (typeof setStaffDirectory === 'function') {
      setStaffDirectory(prev => {
        const distOfficers = (prev?.[district] || []).filter(n => n !== name);
        return { ...(prev || {}), [district]: distOfficers };
      });
    }

    setDeleteStaffModal(null);
    if (showToast) showToast(`✓ Officer ${name} removed from registry.`, "success");

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, name })
      });
      if (res.ok) {
        Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve()
        ]).catch(e => console.warn("Background staff delete refresh error:", e));
      } else {
        const data = await res.json();
        if (showToast) showToast(data.detail || "Failed to delete on server.", "error");
        if (typeof fetchStaffList === 'function') fetchStaffList();
        if (typeof fetchDirectory === 'function') fetchDirectory();
      }
    } catch (err) {
      if (showToast) showToast("Network error deleting staff.", "error");
      if (typeof fetchStaffList === 'function') fetchStaffList();
      if (typeof fetchDirectory === 'function') fetchDirectory();
    }
  };

  const handleExecuteToggleStaffStatus = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!staffToggleModal || !staffToggleModal.officer) return;
    const { officer, targetStatus, effectiveDate } = staffToggleModal;
    const isAct = targetStatus === 'active';

    // ⚡ Optimistic UI Update (0ms latency)
    if (typeof setStaffList === 'function') {
      setStaffList(prev => (prev || []).map(s => {
        if (s.name === officer.name && s.district === officer.district) {
          return { ...s, status: targetStatus, is_active: isAct };
        }
        return s;
      }));
    }

    setStaffToggleModal(null);
    if (showToast) showToast(`✓ Officer status set to ${targetStatus}!`, "success");

    setIsTogglingStaff(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const effDate = targetStatus === 'inactive' ? (effectiveDate || new Date().toISOString().slice(0, 10)) : undefined;
      const res = await authFetch(`${API_BASE_URL}/admin/staff/toggle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: officer.district,
          fo_name: officer.name,
          status: targetStatus,
          ...(effDate ? { effective_date: effDate } : {})
        })
      });
      if (res.ok) {
        Promise.all([
          typeof fetchStaffList === 'function' ? fetchStaffList() : Promise.resolve(),
          typeof fetchDirectory === 'function' ? fetchDirectory() : Promise.resolve(),
          typeof loadTargets === 'function' ? loadTargets(selectedDistrict || 'All', month) : Promise.resolve(),
          typeof fetchAttendance === 'function' ? fetchAttendance(true) : Promise.resolve()
        ]).catch(e => console.warn("Background toggle refresh error:", e));
      } else {
        if (typeof fetchStaffList === 'function') fetchStaffList();
      }
    } catch (err) {
      if (showToast) showToast("Error toggling staff status", "error");
      if (typeof fetchStaffList === 'function') fetchStaffList();
    } finally {
      setIsTogglingStaff(false);
    }
  };

  // 19. Admin Day Report Edits / Deletes Handlers
  const handleAdminExecuteIdEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!adminEditModal) return;
    const { fo_name, district, date, category, action, oldId, newId } = adminEditModal;
    if (action !== 'delete' && (!newId || newId.trim().length !== 9 || !/^\d+$/.test(newId.trim()))) {
      setAdminEditModal(prev => ({ ...prev, error: "Patient ID must be exactly 9 digits." }));
      return;
    }
    setAdminEditModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/api/reports/edit-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          working_place: district,
          fo_name,
          date,
          category,
          action,
          old_id: oldId,
          new_id: newId ? newId.trim() : "",
          edited_by: currentUser?.name || "Admin"
        })
      });
      if (res.ok) {
        setAdminEditModal(null);
        if (showToast) showToast("✓ Patient ID updated successfully!", "success");
        if (typeof fetchData === 'function') fetchData(true);
      } else {
        const data = await res.json();
        setAdminEditModal(prev => ({ ...prev, error: data.detail || "Failed to update ID", loading: false }));
      }
    } catch (err) {
      setAdminEditModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleExecuteDeleteDay = async () => {
    if (!deleteDayModal) return;
    const { district, fo_name, date } = deleteDayModal;
    setDeleteDayModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/reports/delete-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, fo_name, date })
      });
      if (res.ok) {
        if (typeof setRawRecords === 'function') {
          setRawRecords(prev => prev.filter(r => {
            const matchFo = (r.fo_name || '').trim().toLowerCase() === fo_name.trim().toLowerCase();
            const matchDist = canonicalizeDistrict(r.working_place || '') === canonicalizeDistrict(district);
            const matchDate = (r.date_of_reporting || r.date) === date;
            return !(matchFo && matchDist && matchDate);
          }));
        }
        setDeleteDayModal(null);
        if (showToast) showToast(`✓ Report for ${fo_name} on ${date} deleted.`, "success");
        if (typeof fetchAttendance === 'function') fetchAttendance();
      } else {
        const data = await res.json();
        setDeleteDayModal(prev => ({ ...prev, error: data.detail || "Failed to delete report.", loading: false }));
      }
    } catch (err) {
      setDeleteDayModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleOpenEditDay = useCallback((rec, foDistParam = '', foNameParam = '') => {
    const foDist = rec.working_place || foDistParam || '';
    const foName = foNameParam || rec.fo_name || '';
    const dateStr = rec.date || rec.date_of_reporting || '';

    const initialInputs = {};
    (feedCategoriesConfig || []).forEach(cat => {
      const ids = rec[cat.key] || [];
      initialInputs[cat.key] = Array.isArray(ids) ? ids.join('\n') : '';
    });

    const mKm = rec.morning_km !== undefined && rec.morning_km !== null ? rec.morning_km : 0;
    const eKm = rec.evening_km !== undefined && rec.evening_km !== null ? rec.evening_km : 0;
    const tKm = rec.total_km || rec.travel_expenses || (eKm && mKm ? Math.max(0, eKm - mKm) : 0);

    setEditDayModal({
      isOpen: true,
      district: foDist,
      fo_name: foName,
      date: dateStr,
      morning_km: mKm,
      evening_km: eKm,
      travel_expenses: tKm,
      visited_names: Array.isArray(rec.visited_names) ? rec.visited_names.join(', ') : (rec.visited_names || ''),
      remark: rec.remark || '',
      category_inputs: initialInputs,
      isSubmitting: false,
      error: ''
    });
  }, [feedCategoriesConfig]);

  const handleExecuteEditDay = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editDayModal) return;
    setEditDayModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const { district, fo_name, date, morning_km, evening_km, travel_expenses, visited_names, remark, category_inputs } = editDayModal;
      const category_ids = {};
      Object.keys(category_inputs || {}).forEach(catKey => {
        const raw = category_inputs[catKey] || '';
        const is8or9 = (catKey === 'fdc_provided_ids' || catKey === 'outcome_assigned_ids');
        const parsed = raw.split(/[\n,]+/).map(s => s.trim()).filter(s => {
          const validLen = is8or9 ? (s.length === 8 || s.length === 9) : (s.length === 9);
          return validLen && /^\d+$/.test(s);
        });
        category_ids[catKey] = Array.from(new Set(parsed));
      });

      const cleanVisited = visited_names ? visited_names.split(',').map(s => s.trim()).filter(Boolean) : [];
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/reports/edit-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          fo_name,
          date,
          morning_km: Number(morning_km) || 0,
          evening_km: Number(evening_km) || 0,
          travel_expenses: Number(travel_expenses) || 0,
          visited_names: cleanVisited,
          remark: remark || '',
          category_ids
        })
      });
      if (res.ok) {
        if (typeof setRawRecords === 'function') {
          setRawRecords(prev => prev.map(r => {
            const matchFo = (r.fo_name || '').trim().toLowerCase() === fo_name.trim().toLowerCase();
            const matchDist = canonicalizeDistrict(r.working_place || '') === canonicalizeDistrict(district);
            const matchDate = (r.date_of_reporting || r.date) === date;
            if (matchFo && matchDist && matchDate) {
              return {
                ...r,
                morning_km: Number(morning_km) || 0,
                evening_km: Number(evening_km) || 0,
                travel_expenses: Number(travel_expenses) || 0,
                visited_names: cleanVisited,
                remark: remark || ''
              };
            }
            return r;
          }));
        }
        setEditDayModal(null);
        if (showToast) showToast(`✓ Report for ${fo_name} updated!`, "success");
      } else {
        const data = await res.json();
        setEditDayModal(prev => ({ ...prev, error: data.detail || "Failed to edit report.", loading: false }));
      }
    } catch (err) {
      setEditDayModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  // Top Performers Canvas Generation Engine
  const generateTopPerformersPosterCanvas = useCallback(async () => {
    const canvas = topPerformersCanvasRef.current;
    if (!canvas || !topPerformersData) return;
    const ctx = canvas.getContext('2d');
    const width = 1200;
    const height = 1960;
    canvas.width = width;
    canvas.height = height;

    // Background Gradient (Deep Navy/Indigo to Teal)
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#0f172a');
    bgGradient.addColorStop(0.5, '#1e1b4b');
    bgGradient.addColorStop(1, '#042f2e');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Glow accents
    ctx.save();
    ctx.filter = 'blur(60px)';
    ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
    ctx.beginPath();
    ctx.arc(200, 200, 180, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 184, 166, 0.2)';
    ctx.beginPath();
    ctx.arc(1000, 400, 200, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw DFY Logo at top-left if available (robust async loader)
    const loadLogo = () => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = '/dfy-logo.png';
      if (img.complete && img.naturalWidth > 0) {
        resolve(img);
      } else {
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      }
    });

    const logoImg = await loadLogo();
    if (logoImg) {
      try {
        ctx.save();
        ctx.drawImage(logoImg, 50, 45, 95, 95);
        ctx.restore();
      } catch (e) {}
    }

    // Top Header Banner
    ctx.fillStyle = '#14b8a6';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DOCTORS FOR YOU • BIHAR TB ELIMINATION MISSION', width / 2, 70);

    // Main Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px system-ui, -apple-system, sans-serif';
    ctx.fillText('🏆 STATEWIDE TOP PERFORMERS', width / 2, 125);

    // Period Pill
    const periodLabel = topPerformersPeriod === 'weekly' 
      ? '📅 WEEKLY SPRINT (LAST 7 DAYS)' 
      : topPerformersPeriod === 'fortnightly' 
      ? '📅 15-DAY PERFORMANCE DRIVE' 
      : `📅 MONTHLY LEADERBOARD (${month})`;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    const pillWidth = 420;
    ctx.beginPath();
    ctx.roundRect((width - pillWidth) / 2, 150, pillWidth, 38, 19);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(periodLabel, width / 2, 175);

    // 6 Bento Panels in 3x2 Grid
    const pWidth = 535;
    const pHeight = 515;
    const col1X = 50;
    const col2X = 615;
    const row1Y = 215;
    const row2Y = 750;
    const row3Y = 1285;

    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    const rankColors = ['#f59e0b', '#94a3b8', '#d97706', '#64748b', '#64748b'];

    const drawQuadrant = (x, y, title, subtitle, icon, headerColor, items, renderItem) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, pWidth, pHeight, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = headerColor;
      ctx.font = '900 20px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${icon} ${title}`, x + 20, y + 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(subtitle, x + 20, y + 56);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 68);
      ctx.lineTo(x + pWidth - 20, y + 68);
      ctx.stroke();

      if (!items || items.length === 0) {
        ctx.fillStyle = '#64748b';
        ctx.font = 'italic 14px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data recorded for this period', x + pWidth / 2, y + 270);
        return;
      }

      items.slice(0, 5).forEach((item, idx) => {
        const itemY = y + 80 + (idx * 83);
        ctx.fillStyle = idx === 0 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)';
        ctx.strokeStyle = idx === 0 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.07)';
        ctx.beginPath();
        ctx.roundRect(x + 14, itemY, pWidth - 28, 73, 14);
        ctx.fill();
        ctx.stroke();

        ctx.font = idx < 3 ? '26px system-ui' : 'bold 20px system-ui';
        ctx.fillStyle = rankColors[idx];
        ctx.textAlign = 'center';
        ctx.fillText(medals[idx], x + 44, itemY + (idx < 3 ? 44 : 40));

        renderItem(item, x + 76, itemY, pWidth - 95);
      });
    };

    // 1. Q1: Top 5 Districts
    const distSub = adminTargetViewMode === 'frontline' ? 'Frontline Stretch & Volume' : 'Official Quota & Volume';
    drawQuadrant(col1X, row1Y, 'TOP 5 DISTRICTS', distSub, '🏛️', '#38bdf8', topPerformersData.top_districts || [], (d, startX, startY) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
      ctx.fillText(d.district, startX, startY + 28);

      const modeTag = adminTargetViewMode === 'frontline' ? 'Frontline' : 'Official';
      const pctText = `${d.percentage}% ${modeTag} Target (${d.target || 0})`;
      ctx.fillStyle = d.percentage >= 100 ? '#10b981' : '#f59e0b';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(pctText, startX, startY + 54);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${d.notifications}`, startX + pWidth - 110, startY + 36);
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('notifs', startX + pWidth - 110, startY + 54);
    });

    // 2. Q2: Top 5 FO & Hub Agents
    const foItems = topPerformersData.top_fo || topPerformersData.top_staff || [];
    drawQuadrant(col2X, row1Y, 'TOP 5 FO & HUB AGENTS', 'Clinical TB Notifications', '📋', '#a78bfa', foItems, (s, startX, startY) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.fo_name, startX, startY + 26);

      const isHub = s.designation === 'Hub Agent' || String(s.designation || '').toUpperCase().includes('HUB');
      ctx.fillStyle = isHub ? '#fbbf24' : '#94a3b8';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${isHub ? '⭐ HUB AGENT • ' : ''}${s.district}`, startX, startY + 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#a78bfa';
      ctx.font = '900 22px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${s.notifications}`, startX + pWidth - 110, startY + 36);
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('notifs', startX + pWidth - 110, startY + 54);
    });

    // 3. Q3: Top 5 Treatment Coordinators
    drawQuadrant(col1X, row2Y, 'TOP 5 TREATMENT COORDINATORS', 'Home Visits & Patient Tracking', '🏠', '#f59e0b', topPerformersData.top_tc || [], (s, startX, startY) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.fo_name, startX, startY + 26);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(`📍 ${s.district} • TC Agent`, startX, startY + 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#f59e0b';
      ctx.font = '900 22px system-ui, -apple-system, sans-serif';
      const visitsCount = s.home_visits ?? s.metric_value ?? 0;
      ctx.fillText(`${visitsCount}`, startX + pWidth - 110, startY + 36);
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('visits', startX + pWidth - 110, startY + 54);
    });

    // 4. Q4: Top 5 Lab Technicians
    drawQuadrant(col2X, row2Y, 'TOP 5 LAB TECHNICIANS', 'Diagnostic Tests Performed', '🔬', '#34d399', topPerformersData.top_lt || [], (s, startX, startY) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.fo_name, startX, startY + 26);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(`📍 ${s.district} • Lab Tech`, startX, startY + 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#34d399';
      ctx.font = '900 22px system-ui, -apple-system, sans-serif';
      const testsCount = s.tests || s.metric_value || 0;
      ctx.fillText(`${testsCount}`, startX + pWidth - 110, startY + 36);
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('tests', startX + pWidth - 110, startY + 54);
    });

    // 5. Q5: Top 5 SCT Agents
    drawQuadrant(col1X, row3Y, 'TOP 5 SCT AGENTS', 'Sputum Samples Collected', '🧪', '#f43f5e', topPerformersData.top_sct || [], (s, startX, startY) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.fo_name, startX, startY + 26);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText(`📍 ${s.district} • SCT Agent`, startX, startY + 52);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#f43f5e';
      ctx.font = '900 22px system-ui, -apple-system, sans-serif';
      const samplesCount = s.samples_collected || s.metric_value || 0;
      ctx.fillText(`${samplesCount}`, startX + pWidth - 110, startY + 36);
      ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('samples', startX + pWidth - 110, startY + 54);
    });

    // 6. Q6: Statewide TB Mission Highlights & Clinical Summary
    {
      const x = col2X;
      const y = row3Y;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, pWidth, pHeight, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 20px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('✨ BIHAR MISSION IMPACT', x + 20, y + 36);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      ctx.fillText('Clinical Overview & Healthcare Reach', x + 20, y + 56);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 68);
      ctx.lineTo(x + pWidth - 20, y + 68);
      ctx.stroke();

      const totalNotifs = (topPerformersData?.top_districts || []).reduce((acc, d) => acc + (d.notifications || 0), 0);
      const activeDistCount = (topPerformersData?.top_districts || []).length;
      const totalVisits = (topPerformersData?.top_tc || []).reduce((acc, s) => acc + (s.home_visits || s.metric_value || 0), 0);
      const totalTests = (topPerformersData?.top_lt || []).reduce((acc, s) => acc + (s.tests || s.metric_value || 0), 0);
      const totalSamples = (topPerformersData?.top_sct || []).reduce((acc, s) => acc + (s.samples_collected || s.metric_value || 0), 0);

      const impactMetrics = [
        { label: 'Districts Monitored', value: `${activeDistCount} Districts`, icon: '🏛️', color: '#38bdf8', sub: 'Active statewide coverage' },
        { label: 'Champion TB Notifs', value: `${totalNotifs}`, icon: '📋', color: '#a78bfa', sub: 'Clinical TB notifications' },
        { label: 'TC Patient Home Visits', value: `${totalVisits}`, icon: '🏠', color: '#f59e0b', sub: 'Direct household visits' },
        { label: 'Diagnostic Tests & Sputum', value: `${totalTests + totalSamples}`, icon: '🔬', color: '#34d399', sub: 'Lab tests & sputum collections' },
      ];

      impactMetrics.forEach((m, idx) => {
        const cardY = y + 80 + (idx * 83);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
        ctx.beginPath();
        ctx.roundRect(x + 14, cardY, pWidth - 28, 73, 14);
        ctx.fill();
        ctx.stroke();

        ctx.font = '26px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(m.icon, x + 44, cardY + 44);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
        ctx.fillText(m.label, x + 76, cardY + 28);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText(m.sub, x + 76, cardY + 50);

        ctx.textAlign = 'right';
        ctx.fillStyle = m.color;
        ctx.font = '900 20px system-ui, -apple-system, sans-serif';
        ctx.fillText(m.value, x + pWidth - 30, cardY + 40);
      });

      // Bottom mission tag
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = 'italic 11px system-ui, -apple-system, sans-serif';
      ctx.fillText('Doctors For You • Dedicated to a TB-Free Bihar by 2026', x + pWidth / 2, y + pHeight - 14);
    }

    // Commendation & Tribute Banner for Champions (Randomized Inspiring Message)
    const bannerX = 50;
    const bannerY = 1820;
    const bannerW = 1100;
    const bannerH = 86;

    const bannerGrad = ctx.createLinearGradient(bannerX, bannerY, bannerX + bannerW, bannerY + bannerH);
    bannerGrad.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
    bannerGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.22)');
    bannerGrad.addColorStop(1, 'rgba(20, 184, 166, 0.18)');

    ctx.fillStyle = bannerGrad;
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bannerX, bannerY, bannerW, bannerH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('✨ SPECIAL COMMENDATION & TRIBUTE TO BIHAR TB WARRIORS ✨', width / 2, bannerY + 28);

    const randomMsg = topPerformerRandomMsg || TOP_PERFORMER_MESSAGES[0];
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'italic bold 15px system-ui, -apple-system, sans-serif';
    ctx.fillText(`"${randomMsg}"`, width / 2, bannerY + 58);

    // Footer
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Generated on ${nowStr} (IST) • Doctors For You State Monitoring Operations`, width / 2, 1935);
  }, [topPerformersData, topPerformersPeriod, month, topPerformerRandomMsg, adminTargetViewMode]);

  const handleDownloadTopPerformersPoster = useCallback(async () => {
    try {
      // Pick a fresh random congratulatory message on each export
      const nextMsg = TOP_PERFORMER_MESSAGES[Math.floor(Math.random() * TOP_PERFORMER_MESSAGES.length)];
      setTopPerformerRandomMsg(nextMsg);
      await generateTopPerformersPosterCanvas();
      const canvas = topPerformersCanvasRef.current;
      if (!canvas) return;
      const filename = `DFY_Top_Performers_${topPerformersPeriod}_${month}.png`;
      const result = await downloadOrShareCanvas(canvas, filename, `DFY Bihar Statewide Top Performers - ${topPerformersPeriod} (${month})`);
      if (result.success) {
        showToast(result.method === 'share' ? '✓ Poster ready in Apple Share Sheet!' : '✓ Poster downloaded successfully!', 'success');
      }
    } catch (err) {
      console.error('Download poster failed', err);
      showToast('Failed to download poster', 'error');
    }
  }, [generateTopPerformersPosterCanvas, topPerformersPeriod, month, showToast]);

  const handleShareTopPerformersWhatsApp = useCallback(() => {
    const periodName = topPerformersPeriod === 'weekly' ? 'Weekly Sprint (Last 7 Days)' : topPerformersPeriod === 'fortnightly' ? '15-Day Drive' : `Monthly (${month})`;
    const modeLabel = adminTargetViewMode === 'frontline' ? 'FRONTLINE STRETCH' : 'OFFICIAL QUOTA';
    let text = `*🏆 DOCTORS FOR YOU — BIHAR TB MISSION*\n`;
    text += `*🌟 STATEWIDE TOP PERFORMERS LEADERBOARD (${periodName} • ${modeLabel})*\n\n`;

    const activeTribute = topPerformerRandomMsg || TOP_PERFORMER_MESSAGES[0];
    text += `*✨ STATEWIDE LEADERSHIP TRIBUTE:*\n_"${activeTribute}"_\n\n`;

    // 1. Top 5 Districts
    text += `*🏛️ TOP 5 DISTRICTS (${modeLabel} & VOLUME):*\n`;
    const dists = topPerformersData?.top_districts || [];
    if (dists.length === 0) {
      text += `_No district data recorded_\n`;
    } else {
      dists.slice(0, 5).forEach((d, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const targetLabel = adminTargetViewMode === 'frontline' ? 'Frontline' : 'Official';
        text += `${medal} *${d.district}*: ${d.notifications} Notifs (${d.percentage}% ${targetLabel}: ${d.target || 0})\n`;
      });
    }

    // 2. Top 5 FO & Hub Agents
    text += `\n*📋 TOP 5 FIELD OFFICERS & HUB AGENTS:*\n`;
    const foList = topPerformersData?.top_fo || topPerformersData?.top_staff || [];
    if (foList.length === 0) {
      text += `_No FO/Hub records recorded_\n`;
    } else {
      foList.slice(0, 5).forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        const badge = (s.designation === 'Hub Agent' || String(s.designation || '').toUpperCase().includes('HUB')) ? ' [HUB AGENT]' : '';
        text += `${medal} *${s.fo_name}* (${s.district})${badge}: ${s.notifications} Notifs\n`;
      });
    }

    // 3. Top 5 Treatment Coordinators
    text += `\n*🏠 TOP 5 TREATMENT COORDINATORS (TC HOME VISITS):*\n`;
    const tcList = topPerformersData?.top_tc || [];
    if (tcList.length === 0) {
      text += `_No TC home visit records recorded_\n`;
    } else {
      tcList.slice(0, 5).forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        text += `${medal} *${s.fo_name}* (${s.district}): ${s.home_visits ?? s.metric_value ?? 0} Home Visits\n`;
      });
    }

    // 4. Top 5 Lab Technicians
    text += `\n*🔬 TOP 5 LAB TECHNICIANS (LT TESTS):*\n`;
    const ltList = topPerformersData?.top_lt || [];
    if (ltList.length === 0) {
      text += `_No LT test records recorded_\n`;
    } else {
      ltList.slice(0, 5).forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        text += `${medal} *${s.fo_name}* (${s.district}): ${s.tests || s.metric_value || 0} Tests\n`;
      });
    }

    // 4. Top 5 SCT Agents
    text += `\n*🧪 TOP 5 SCT AGENTS (SPUTUM COLLECTIONS):*\n`;
    const sctList = topPerformersData?.top_sct || [];
    if (sctList.length === 0) {
      text += `_No SCT collection records recorded_\n`;
    } else {
      sctList.slice(0, 5).forEach((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        text += `${medal} *${s.fo_name}* (${s.district}): ${s.samples_collected || s.metric_value || 0} Collections\n`;
      });
    }

    text += `\n_Congratulations to all clinical champions leading Bihar's TB elimination drive! 🏥_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }, [topPerformersData, topPerformersPeriod, month, topPerformerRandomMsg, adminTargetViewMode]);

  // Trigger useEffects (Strict TDZ Order: placed after all useCallbacks and before return)
  useEffect(() => {
    if (showNikshayModal) {
      fetchNikshaySyncStatus();
    }
  }, [showNikshayModal, fetchNikshaySyncStatus]);

  return {
    // 1. Security
    showSecurityModal, setShowSecurityModal,
    changeCurrentPw, setChangeCurrentPw,
    changeNewPw, setChangeNewPw,
    securityStatusMsg, setSecurityStatusMsg,
    isSavingSecurity, handleUpdatePassword,

    // 2. Cascade Alerts
    showCascadeModal, setShowCascadeModal,
    cascadeData, loadingCascade,
    cascadeFilterDist, setCascadeFilterDist,
    cascadeRiskFilter, setCascadeRiskFilter, setRiskFilter: setCascadeRiskFilter,
    fetchCascadeAlerts,

    // 3. Recent ID Edits
    showRecentIdEditsModal, setShowRecentIdEditsModal,
    recentIdEdits, recentIdEditsLoading,
    recentIdEditsFilterAction, setRecentIdEditsFilterAction,
    recentIdEditsSearch, setRecentIdEditsSearch,
    fetchRecentIdEdits,

    // 4. Changelog
    showChangelogModal, setShowChangelogModal,

    // 5. Patient Journey
    showJourneyModal, setShowJourneyModal,
    journeyPatientId, setJourneyPatientId,
    journeySearchId: journeyPatientId,
    setJourneySearchId: setJourneyPatientId,
    journeyLoading, journeyResult, journeyError,
    handleFetchJourney,

    // 6. Automated Backup
    showBackupModal, setShowBackupModal,
    backupStatus, backupLoading, backupTriggerLoading, backupActionMsg, setBackupActionMsg,
    restoreConfirmText, setRestoreConfirmText,
    restoreTargetFile, setRestoreTargetFile,
    restoreLoading, fetchBackupStatus,
    handleTriggerBackupNow, handleDownloadBackup, handleExecuteRestore,

    // 7. Top Performers Studio
    showTopPerformersModal, setShowTopPerformersModal,
    adminTargetViewMode, topPerformersPeriod, setTopPerformersPeriod,
    fetchTopPerformers, month, topPerformersData, loadingTopPerformers,
    topPerformerRandomMsg, setTopPerformerRandomMsg,
    topPerformersCanvasRef, handleShareTopPerformersWhatsApp, handleDownloadTopPerformersPoster,

    // 8. Admin Users
    showAdminUsersModal, setShowAdminUsersModal,
    adminUsersList, adminUsersLoading, currentUser,
    loadingAdminUsers: adminUsersLoading,
    userFormModal, setUserFormModal,
    fetchAdminUsers, saveAdminUser, deleteAdminUser,

    // 9. Audit Trail
    showAuditModal, setShowAuditModal,
    auditLogs, auditLoading,
    loadingAuditLogs: auditLoading,
    auditFilterAction, setAuditFilterAction,
    auditFilterTarget, setAuditFilterTarget,
    auditFilterDistrict: auditFilterTarget, setAuditFilterDistrict: setAuditFilterTarget,
    auditFilterAdmin, setAuditFilterAdmin,
    auditFilterUser: auditFilterAdmin, setAuditFilterUser: setAuditFilterAdmin,
    auditSearchQuery, setAuditSearchQuery,
    auditLogsList: auditLogs,
    formatAuditTimestamp, isPruningAudit,
    fetchAuditLogs, exportAuditLogsExcel, handleManualPruneAuditLogs,

    // 10. Broadcast Studio & Unread Popup
    unreadBroadcastPopup, setUnreadBroadcastPopup,
    dismissBroadcastPopup,
    showBroadcastModal, setShowBroadcastModal,
    activeBroadcasts, broadcastHistory, broadcastLoading, isSendingBroadcast,
    broadcastsList: broadcastHistory,
    loadingBroadcasts: broadcastLoading,
    newBroadcastModal, setNewBroadcastModal,
    deleteBroadcastModal, setDeleteBroadcastModal,
    fetchAllBroadcasts, handleCreateBroadcast, handleDeleteBroadcast,

    // 11. Notif Tray
    showNotifTrayModal, setShowNotifTrayModal,
    notifTrayFilterDistrict, setNotifTrayFilterDistrict,
    notifTraySearchQuery, setNotifTraySearchQuery,
    notifTraySearch: notifTraySearchQuery, setNotifTraySearch: setNotifTraySearchQuery,
    notifTrayCategoryFilter, setCategoryFilter: setNotifTrayCategoryFilter,
    isExportingNotifTray, notifTrayCopiedNotice, notifTrayDistricts,
    notifTrayData, copyToClipboardWithFallback, build24ColTsv, NOTIF_TRAY_24_HEADERS,
    handleClearNotifDistricts, handleSelectAllNotifDistricts, handleToggleNotifDistrict,

    // 12. App Guide SOP
    showAppGuideModal, setShowAppGuideModal,
    appGuideActiveTopic, setAppGuideActiveTopic,
    appGuideSearchQuery, setAppGuideSearchQuery,
    appGuideSearch: appGuideSearchQuery, setAppGuideSearch: setAppGuideSearchQuery,

    // 13. Nikshay Reconciler
    showNikshayModal, setShowNikshayModal,
    nikshayFile, setNikshayFile,
    nikshayResult, setNikshayResult,
    nikshayError, setNikshayError,
    nikshayLoading, nikshaySyncing,
    nikshayDistrict, setNikshayDistrict,
    nikshayMonth, setNikshayMonth,
    nikshayActiveTab, setNikshayActiveTab,
    ledgerViewMode, setLedgerViewMode,
    ledgerData, ledgerSearch, setLedgerSearch,
    ledgerDistrict, setLedgerDistrict,
    ledgerLoading, ledgerExporting, reviewExporting,
    nikshaySyncStatus, fetchNikshaySyncStatus, handleReconcileNikshay,
    handleDownloadReviewSheet, handleExportCumulativeLedger,
    fetchCumulativeLedger,
    isSubAdmin: currentUser?.role === 'SUB_ADMIN',

    // 14. Admin Backdated Feeding
    showAdminFeedModal, setShowAdminFeedModal,
    feedDistrict, setFeedDistrict,
    feedFoName, setFeedFoName,
    feedDate, setFeedDate,
    feedCategoryInputs, setFeedCategoryInputs,
    feedVisitedNames, setFeedVisitedNames,
    feedRemarks, setFeedRemarks,
    feedTravelExpense, setFeedTravelExpense,
    feedMorningKm, setFeedMorningKm,
    feedEveningKm, setFeedEveningKm,
    feedIsNextDay, setFeedIsNextDay,
    feedSubmissionCount, setFeedSubmissionCount,
    feedLoading, feedError, setFeedError,
    feedSuccess, setFeedSuccess,
    feedShowAllCategories, setFeedShowAllCategories,
    availableDistrictsForFeed: availableKpiDistricts,
    availableFosForFeed,
    feedCategoriesConfig, handleAdminFeedSubmit,

    // 15. Target Setting
    showTargetModal, setShowTargetModal,
    targetModalMonth, setTargetModalMonth,
    targetModalDistrict, setTargetModalDistrict,
    targetModalTab, setTargetModalTab,
    targetSearchQuery, setTargetSearchQuery,
    targetModalDistricts, officialDistrictTarget, setOfficialDistrictTarget,
    tempOfficialTargets, setTempOfficialTargets,
    officialTargetsByDistrict: tempOfficialTargets,
    targets: tempOfficialTargets,
    targetsData, isSavingTargets,
    isSavingDistrictTarget, isSavingBulkDistrictTargets,
    bulkTargetValue, setBulkTargetValue,
    handleSaveSingleDistrictTarget,
    handleSaveBulkDistrictTargets,
    saveAllTargets,
    handleSaveAllTargetsCombined,
    handleExecuteTargetSave,
    handleTargetChange, handleCopyFromLastMonth, frontlineAllocated,

    // 16. Attendance Radar
    showAttendanceModal, setShowAttendanceModal,
    attendance, chronicDefaulters,
    attendanceDistrictFilter, setAttendanceDistrictFilter,
    attendanceTimeFilter, setAttendanceTimeFilter,
    attendanceSearchQuery, setAttendanceSearchQuery,
    inactiveStaffNamesSet, attendanceDate, setAttendanceDate,
    fetchAttendance, isAttendanceLoading,
    activeAttendanceTab, setActiveAttendanceTab,
    leaveActionModal, setLeaveActionModal,
    handleExecuteMarkLeave, handleExecuteUnmarkLeave,
    attendanceRemarkModal, setAttendanceRemarkModal,
    handleExecuteAttendanceRemark, isSavingAttendanceRemark,
    getSubmissionTimeClassification,

    // 17. Duplicate Radar
    showDuplicateModal, setShowDuplicateModal,
    duplicateRadarTab, setDuplicateRadarTab,
    duplicateAudit, duplicateScanData, duplicateScanLoading,
    repairingDocId, fetchDuplicateAudit, fetchDuplicateScan,
    duplicateRepairing: repairingDocId,
    handleRepairDuplicate,
    handleRepairDuplicates: handleRepairDuplicate,
    compareDistA, setCompareDistA,
    compareDistB, setCompareDistB,

    // 18. FO Inspector
    inspectingFO, setInspectingFO,
    rawRecords, staffDirectory, foSearchId, setFoSearchId,

    // 19. Staff Management Suite
    showStaffSuite, setShowStaffSuite,
    staffList, staffSearchQuery, setStaffSearchQuery,
    staffFilterDistrict, setStaffFilterDistrict,
    staffStatusFilter, setStaffStatusFilter,
    pinChangeModal, setPinChangeModal,
    addStaffModal, setAddStaffModal,
    deleteStaffModal, setDeleteStaffModal,
    staffToggleModal, setStaffToggleModal,
    isTogglingStaff, showPinMap, setShowPinMap,
    handleExecuteUpdatePin, handleExecuteAddStaff,
    handleExecuteDeleteStaff, handleExecuteToggleStaffStatus,
    fetchStaffList,

    // 20. Admin Edit ID
    adminEditModal, setAdminEditModal,
    handleAdminExecuteIdEdit,

    // 21. Delete Day Report
    deleteDayModal, setDeleteDayModal,
    handleExecuteDeleteDay,

    // 22. Edit Day Report
    editDayModal, setEditDayModal,
    handleOpenEditDay,
    handleExecuteEditDay,

    // 23. Reports Studio
    showReportsStudio, setShowReportsStudio,
    reportsStudioTab, setReportsStudioTab,
    reportsDistrict, setReportsDistrict,
    availableKpiDistricts, selectedKpiDistricts,
    handleToggleKpiDistrict, handleSelectAllKpiDistricts,
    handleClearKpiDistricts, isDownloadingKpi, handleDownloadKpi,
    canDownloadBulkZip, handleDownloadScopedZip,
    handleDownloadSequentialQueue, kpiQueueProgress,
    selectedMedDistricts, handleToggleMedDistrict,
    handleSelectAllMedDistricts, handleClearMedDistricts,
    isDownloadingMedicineReport, handleDownloadMedicineReport,
    handleDownloadMedicineReportScopedZip, handleDownloadMedicineReportQueue,
    handleDownloadSequentialMedQueue: handleDownloadMedicineReportQueue,
    medQueueProgress, selectedAttendanceDistricts,
    handleToggleAttendanceDistrict, handleSelectAllAttendanceDistricts,
    handleClearAttendanceDistricts, isDownloadingAttendance,
    handleDownloadAttendanceSingleOrScoped, handleDownloadStaffAttendanceQueue,
    attendanceQueueProgress, copyWhatsAppBulletin, liveWhatsAppBulletin,
    availableAttendanceDistricts: availableKpiDistricts,
    totals: {},

    // Shared & Context
    districts, authFetch, getAdminToken, showToast,
    isSuperAdmin: currentUser?.role === 'SUPER_ADMIN'
  };
}
