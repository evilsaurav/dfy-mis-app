import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area, LabelList, Cell } from 'recharts';
import { CHANGELOG_ENTRIES, APP_VERSION, LAST_UPDATED_DATE } from './changelogData';

const feedCategoriesConfig = [
  { key: 'notification_ids', label: 'Notification (TB Diagnosis)', isPrimary: true, icon: '📋' },
  { key: 'hiv_dm_ids', label: 'HIV & DM Screening', isPrimary: true, icon: '🩸' },
  { key: 'dbt_ids', label: 'DBT (Bank Seeding)', isPrimary: true, icon: '💰' },
  { key: 'sample_tested_ids', label: 'Sample Tested', isPrimary: true, icon: '🔬' },
  { key: 'sample_collection_ids', label: 'Sample Collection', isPrimary: true, icon: '🧪' },
  { key: 'contact_tracing_ids', label: 'Contact Tracing', isPrimary: true, icon: '👥' },
  { key: 'differentiated_tb_ids', label: 'Diff TB Care', isPrimary: true, icon: '🏥' },
  { key: 'outcome_assigned_ids', label: 'Treatment Outcome', isPrimary: true, icon: '🎯' },
  { key: 'home_visit_ids', label: 'Home Visit', isPrimary: false, icon: '🏠' },
  { key: 'follow_up_ids', label: 'Follow Up', isPrimary: false, icon: '🔄' },
  { key: 'face_to_face_ids', label: 'Face to Face', isPrimary: false, icon: '🗣️' },
  { key: 'presumptive_ids', label: 'Presumptive TB', isPrimary: false, icon: '🩺' },
  { key: 'documents_ids', label: 'Documents Collected', isPrimary: false, icon: '📁' },
  { key: 'fdc_provided_ids', label: 'FDC Provided', isPrimary: false, icon: '💊' },
  { key: 'kit_consumption_ids', label: 'Kit Consumption', isPrimary: false, icon: '📦' },
  { key: 'tpt_treatment_start_ids', label: 'TPT Treatment Start', isPrimary: false, icon: '🛡️' },
  { key: 'tpt_presumptive_ids', label: 'TPT Presumptive', isPrimary: false, icon: '🔍' },
  { key: 'adhar_face_authentication_ids', label: 'Aadhaar Face Auth', isPrimary: false, icon: '👤' },
  { key: 'consent_with_id_ids', label: 'Consent with ID', isPrimary: false, icon: '📝' },
  { key: 'culture_dst_ids', label: 'Culture & DST', isPrimary: false, icon: '🧫' }
];

const CANONICAL_DISTRICT_MAP = {
  'aurangabad-bi': 'Aurangabad',
  'aurangabad bi': 'Aurangabad',
  'aurangabad': 'Aurangabad',
  'bhojpur': 'Bhojpur',
  'purba champaran': 'East Champaran',
  'purbi champaran': 'East Champaran',
  'east champaran': 'East Champaran',
  'motihari': 'East Champaran',
};
const canonicalizeDistrict = (d) => {
  if (!d) return '';
  const clean = String(d).trim();
  return CANONICAL_DISTRICT_MAP[clean.toLowerCase()] || clean;
};

const canonicalizeFo = (foName, district = '', directory = null) => {
  if (!foName) return '';
  const clean = String(foName).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const cDist = canonicalizeDistrict(district);
  
  if (directory && typeof directory === 'object') {
    if (cDist && Array.isArray(directory[cDist])) {
      const match = directory[cDist].find(official => official && official.trim().toLowerCase() === clean.toLowerCase());
      if (match) return match.trim();
    }
    for (const dist in directory) {
      if (Array.isArray(directory[dist])) {
        const match = directory[dist].find(official => official && official.trim().toLowerCase() === clean.toLowerCase());
        if (match) return match.trim();
      }
    }
  }
  return clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const normalizeStaffKey = (dist, name) => {
  const d = canonicalizeDistrict(dist || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const n = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.)\1+/g, '$1');
  return `${d}_${n}`;
};

const formatAuditTimestamp = (ts, tsFormatted) => {
  if (tsFormatted && (tsFormatted.includes('AM') || tsFormatted.includes('PM'))) {
    return tsFormatted;
  }
  if (!ts) return '—';
  if (typeof ts === 'string' && (ts.includes('AM') || ts.includes('PM'))) {
    return ts;
  }
  try {
    const cleanTs = String(ts).trim();
    let d;
    if (cleanTs.includes('T') || cleanTs.endsWith('Z')) {
      d = new Date(cleanTs);
    } else {
      const isoStr = cleanTs.replace(' ', 'T') + 'Z';
      d = new Date(isoStr);
    }
    if (isNaN(d.getTime())) d = new Date(cleanTs);
    if (isNaN(d.getTime())) return cleanTs;
    
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  } catch (e) {
    return String(ts);
  }
};

const DEFAULT_BIHAR_DISTRICTS = [
  "Aurangabad", "Begusarai", "Bhojpur", "Buxar", "Darbhanga",
  "East Champaran", "Gaya", "Jamui", "Jehanabad", "Kaimur",
  "Khagaria", "Lakhisarai", "Madhubani", "Munger", "Muzaffarpur",
  "Nawada", "Rohtas", "Samastipur", "Sheikhpura", "Sheohar",
  "Sitamarhi", "Vaishali"
];

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return localStorage.getItem('dfy_admin_auth') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rawRecords, setRawRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isColdStarting, setIsColdStarting] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [selectedDistrict, setSelectedDistrict] = useState('All');
  const [selectedFO, setSelectedFO] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'notifications', direction: 'desc' });
  const [masterTableCohortFilter, setMasterTableCohortFilter] = useState('all'); // 'all' | 'current_cohort' | 'backlog'
  
  // Bihar Top Performers Studio States
  const [topPerformersPeriod, setTopPerformersPeriod] = useState('weekly'); // 'weekly' | 'fortnightly' | 'monthly'
  const [topPerformersTab, setTopPerformersTab] = useState('districts'); // 'districts' | 'staff'
  const [topPerformersData, setTopPerformersData] = useState(null);
  const [loadingTopPerformers, setLoadingTopPerformers] = useState(false);
  const [showTopPerformersModal, setShowTopPerformersModal] = useState(false);
  const topPerformersCanvasRef = useRef(null);

  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetModalMonth, setTargetModalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [targetModalDistrict, setTargetModalDistrict] = useState('All');
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [bulkTargetValue, setBulkTargetValue] = useState("");
  const [targetsData, setTargetsData] = useState([]);
  const [activeMetric, setActiveMetric] = useState('notifications');
  const [performanceViewMode, setPerformanceViewMode] = useState('chart'); // 'chart' | 'cards'
  const [performanceMetricFilter, setPerformanceMetricFilter] = useState('notif_only'); // 'notif_only' | 'target_vs_notif' | 'pct_achieve'
  const [inspectingFO, setInspectingFO] = useState(null);
  const [foSearchId, setFoSearchId] = useState("");
  const [copiedFoCategory, setCopiedFoCategory] = useState(null);
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [duplicateScanData, setDuplicateScanData] = useState(null);
  const [duplicateScanLoading, setDuplicateScanLoading] = useState(false);
  const [repairingDocId, setRepairingDocId] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [compareDistA, setCompareDistA] = useState("Jamui");
  const [compareDistB, setCompareDistB] = useState("Bhojpur");

  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [changeCurrentPw, setChangeCurrentPw] = useState("");
  const [changeNewPw, setChangeNewPw] = useState("");
  const [securityStatusMsg, setSecurityStatusMsg] = useState("");
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [showReportsStudio, setShowReportsStudio] = useState(false);
  const [reportsStudioTab, setReportsStudioTab] = useState("kpi_workbooks"); // kpi_workbooks, state_matrix, staff_attendance, cascade_funnel, whatsapp_bulletin
  const [duplicateRadarTab, setDuplicateRadarTab] = useState("collisions"); // collisions, journeys
  const [copiedBulletin, setCopiedBulletin] = useState(false);
  const [reportsDistrict, setReportsDistrict] = useState("");
  const [selectedKpiDistricts, setSelectedKpiDistricts] = useState([]);
  const [selectedMedDistricts, setSelectedMedDistricts] = useState([]);
  const [selectedAttendanceDistricts, setSelectedAttendanceDistricts] = useState([]);
  const [isDownloadingKpi, setIsDownloadingKpi] = useState(false);
  const [isDownloadingMedicineReport, setIsDownloadingMedicineReport] = useState(false);
  const [isDownloadingAttendance, setIsDownloadingAttendance] = useState(false);
  const [kpiQueueProgress, setKpiQueueProgress] = useState(null); // { current, total, district, percent, status }
  const [medQueueProgress, setMedQueueProgress] = useState(null); // { current, total, district, percent, status }
  const [attendanceQueueProgress, setAttendanceQueueProgress] = useState(null); // { current, total, district, percent, status }
  const [adminEditModal, setAdminEditModal] = useState(null);
  const [deleteDayModal, setDeleteDayModal] = useState(null); // { isOpen, district, fo_name, date, dayIdsCount, km, loading, error }
  const [editDayModal, setEditDayModal] = useState(null); // { isOpen, district, fo_name, date, morning_km, evening_km, travel_expenses, visited_names, remark, category_inputs, loading, error }
  const [showRecentIdEditsModal, setShowRecentIdEditsModal] = useState(false);
  const [recentIdEdits, setRecentIdEdits] = useState([]);
  const [recentIdEditsLoading, setRecentIdEditsLoading] = useState(false);
  const [recentIdEditsFilterAction, setRecentIdEditsFilterAction] = useState('All');
  const [recentIdEditsSearch, setRecentIdEditsSearch] = useState('');
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [hasSeenLatestChangelog, setHasSeenLatestChangelog] = useState(() => {
    try {
      return localStorage.getItem('dfy_last_seen_changelog') === APP_VERSION;
    } catch (e) {
      return false;
    }
  });
  const [showStaffSuite, setShowStaffSuite] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffFilterDistrict, setStaffFilterDistrict] = useState("All");
  const [staffStatusFilter, setStaffStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [staffToggleModal, setStaffToggleModal] = useState(null); // { officer, targetStatus, effectiveDate, error }
  const [isTogglingStaff, setIsTogglingStaff] = useState(false);
  const [showPinMap, setShowPinMap] = useState({});
  const [pinChangeModal, setPinChangeModal] = useState(null); // { name, district, newPin, error, loading }
  const [addStaffModal, setAddStaffModal] = useState(null); // { district, name, pin, designation, target, error, loading }
  const [deleteStaffModal, setDeleteStaffModal] = useState(null);
  const [showCascadeModal, setShowCascadeModal] = useState(false);
  const [cascadeData, setCascadeData] = useState({ summary: {}, alerts: [] });
  const [cascadeFilterDist, setCascadeFilterDist] = useState("All");
  const [cascadeRiskFilter, setCascadeRiskFilter] = useState("All");
  const [loadingCascade, setLoadingCascade] = useState(false); // { name, district, error, loading } // { fo_name, district, date, category, action, oldId, newId, error, loading }
  const [staffDirectory, setStaffDirectory] = useState({});
  const [attendance, setAttendance] = useState(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [copiedAttendance, setCopiedAttendance] = useState(false);
  const [activeAttendanceTab, setActiveAttendanceTab] = useState('missing'); // 'missing' | 'submitted' | 'on_leave' | 'defaulters'
  const [leaveActionModal, setLeaveActionModal] = useState(null); // { district, fo_name, date, status: 'leave', reason_type: 'Casual', remark: '' }
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [attendanceRemarkModal, setAttendanceRemarkModal] = useState(null); // { district, fo_name, date, action: 'remark' | 'override_leave', remark: '', status: 'leave', reason_type: 'Casual' }
  const [isSavingAttendanceRemark, setIsSavingAttendanceRemark] = useState(false);
  const attendanceActiveTab = activeAttendanceTab;
  const setAttendanceActiveTab = setActiveAttendanceTab;
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [attendanceDistrictFilter, setAttendanceDistrictFilter] = useState('All');
  const [attendanceTimeFilter, setAttendanceTimeFilter] = useState('all'); // 'all' | 'on_time' | 'late' | 'delayed' | 'early'
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lastSyncedTime, setLastSyncedTime] = useState('');
  const [syncStatus, setSyncStatus] = useState('LIVE'); // 'LIVE' | 'SYNCING' | 'UP_TO_DATE'
  const lastFocusSyncRef = useRef(Date.now());

  // Toast Notification System
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Automated Daily Cloud Backup (Option A) State
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupTriggerLoading, setBackupTriggerLoading] = useState(false);
  const [backupActionMsg, setBackupActionMsg] = useState('');
  const [restoreConfirmText, setRestoreConfirmText] = useState('');
  const [restoreTargetFile, setRestoreTargetFile] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // --- Daily Notification Verification Tray State ---
  const [showNotifTrayModal, setShowNotifTrayModal] = useState(false);
  const [notifTrayDistricts, setNotifTrayDistricts] = useState([]);
  const [notifTrayDistrict, setNotifTrayDistrict] = useState('All');
  const [notifTraySearch, setNotifTraySearch] = useState('');
  const [notifTrayCopiedNotice, setNotifTrayCopiedNotice] = useState(null);

  // --- Centralized Admin Help & SOP Manual State ---
  const [showAppGuideModal, setShowAppGuideModal] = useState(false);
  const [appGuideActiveTopic, setAppGuideActiveTopic] = useState('notif_tray');
  const [appGuideSearch, setAppGuideSearch] = useState('');

  // --- Admin/Sub-Admin Data Feeding Modal State ---
  const [showAdminFeedModal, setShowAdminFeedModal] = useState(false);
  const [feedDistrict, setFeedDistrict] = useState("");
  const [feedFoName, setFeedFoName] = useState("");
  const [feedDate, setFeedDate] = useState(new Date().toISOString().slice(0, 10));
  const [feedCategoryInputs, setFeedCategoryInputs] = useState({});
  const [feedRemarks, setFeedRemarks] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedSuccess, setFeedSuccess] = useState("");
  const [feedShowAllCategories, setFeedShowAllCategories] = useState(false);

  // --- Multi-Admin RBAC & Audit Trail State ---
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = localStorage.getItem('dfy_admin_user');
      if (u) return JSON.parse(u);
      if (localStorage.getItem('dfy_admin_auth') === 'true') {
        return {
          username: 'admin',
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          allowed_districts: ['All'],
          permissions: {
            can_edit_targets: true,
            can_manage_staff: true,
            can_edit_patient_ids: true,
            can_export_reports: true,
            can_view_audit_logs: true
          }
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  const [loginUsername, setLoginUsername] = useState('admin');

  // Admin Users & Roles Modal State
  const [showAdminUsersModal, setShowAdminUsersModal] = useState(false);
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [userFormModal, setUserFormModal] = useState(null); // { mode: 'create' | 'edit', user_id, username, name, password, role, allowed_districts, permissions, error, loading }

  // Activity Audit Trail Modal State
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogsList, setAuditLogsList] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [auditFilterAction, setAuditFilterAction] = useState("All");
  const [auditFilterDistrict, setAuditFilterDistrict] = useState("All");
  const [auditFilterUser, setAuditFilterUser] = useState("All");
  const [auditSearchQuery, setAuditSearchQuery] = useState("");

  // Broadcast & Urgent Announcements State
  const [showBroadcastStudio, setShowBroadcastStudio] = useState(false);
  const [broadcastsList, setBroadcastsList] = useState([]);
  const [activeAdminBroadcasts, setActiveAdminBroadcasts] = useState([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);
  const [unreadBroadcastPopup, setUnreadBroadcastPopup] = useState(null);
  const [newBroadcastModal, setNewBroadcastModal] = useState(null); // { title, message, priority, target_audience, target_districts, loading, error }

  // Staff Pacing, Forecasting & Peer Comparison Studio State
  const [activeMainTab, setActiveMainTab] = useState('overview'); // 'overview', 'staff_pacing', 'district_benchmarks'
  const [pacingHolidaysCount, setPacingHolidaysCount] = useState(1);
  const [comparatorOfficerA, setComparatorOfficerA] = useState('');
  const [comparatorOfficerB, setComparatorOfficerB] = useState('');
  const [pacingFilterStatus, setPacingFilterStatus] = useState('ALL'); // 'ALL', 'ON_TRACK', 'WATCHLIST', 'CRITICAL'
  const [pacingSearchQuery, setPacingSearchQuery] = useState('');
  const [pacingSortConfig, setPacingSortConfig] = useState({ key: 'pacingPct', direction: 'desc' });
  const [pacingViewMode, setPacingViewMode] = useState('matrix'); // 'matrix', 'cards'
  const [copiedCoachingOfficer, setCopiedCoachingOfficer] = useState(null);
  const [isTickerPaused, setIsTickerPaused] = useState(false);
  const [isPruningAudit, setIsPruningAudit] = useState(false);

  // Phase 3: Nikshay Reconciler & Patient Journey State
  const [showNikshayModal, setShowNikshayModal] = useState(false);
  const [nikshayFile, setNikshayFile] = useState(null);
  const [nikshayMonth, setNikshayMonth] = useState(() => month);
  const [nikshayDistrict, setNikshayDistrict] = useState('All');
  const [nikshayLoading, setNikshayLoading] = useState(false);
  const [nikshayResult, setNikshayResult] = useState(null);
  const [nikshayError, setNikshayError] = useState('');
  const [nikshayActiveTab, setNikshayActiveTab] = useState('flagged_review');
  const [reviewExporting, setReviewExporting] = useState(false);

  // Permanent Cumulative Verification Ledger State
  const [ledgerViewMode, setLedgerViewMode] = useState('reconcile'); // 'reconcile' | 'ledger'
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerDistrict, setLedgerDistrict] = useState('All');
  const [ledgerExporting, setLedgerExporting] = useState(false);

  const fetchCumulativeLedger = useCallback(async (page = 1, search = '', dist = ledgerDistrict) => {
    setLedgerLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = localStorage.getItem('dfy_admin_token') || '';
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        district: dist || 'All'
      });
      if (search && search.trim()) {
        params.append('search', search.trim());
      }
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/cumulative-ledger?${params.toString()}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setLedgerData(data);
      }
    } catch (err) {
      console.error('Failed to fetch cumulative ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  }, [ledgerDistrict]);

  const [nikshaySyncStatus, setNikshaySyncStatus] = useState(null);

  const fetchNikshaySyncStatus = useCallback(async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = localStorage.getItem('dfy_admin_token') || '';
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/sync-status`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setNikshaySyncStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Nikshay sync status:', err);
    }
  }, []);

  useEffect(() => {
    fetchNikshaySyncStatus();
  }, [fetchNikshaySyncStatus]);

  useEffect(() => {
    if (showNikshayModal) {
      fetchNikshaySyncStatus();
    }
  }, [showNikshayModal, fetchNikshaySyncStatus]);

  const handleExportCumulativeLedger = async () => {
    setLedgerExporting(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = localStorage.getItem('dfy_admin_token') || '';
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/cumulative-ledger/export?district=${encodeURIComponent(ledgerDistrict || 'All')}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Ledger export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Nikshay_Cumulative_Ledger_${ledgerDistrict || 'All'}_${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Failed to export cumulative ledger: ' + err.message);
    } finally {
      setLedgerExporting(false);
    }
  };

  const handleDownloadReviewSheet = async () => {
    setReviewExporting(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = localStorage.getItem('dfy_admin_token') || '';
      const res = await fetch(`${API_BASE_URL}/admin/nikshay/download-review-sheet?district=${encodeURIComponent(nikshayDistrict || 'All')}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to download review sheet');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DFY_Field_Review_Sheet_${nikshayDistrict || 'All'}_${nikshayMonth || new Date().toISOString().slice(0,7)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      alert('Failed to download review sheet: ' + err.message);
    } finally {
      setReviewExporting(false);
    }
  };

  // --- Daily Notification Verification Tray Computation & Copy Engine ---
  useEffect(() => {
    if (selectedDistrict && selectedDistrict !== 'All') {
      setNotifTrayDistricts([selectedDistrict]);
      setNotifTrayDistrict(selectedDistrict);
    } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
      if (allowed.length > 0) {
        setNotifTrayDistricts([allowed[0]]);
        setNotifTrayDistrict(allowed[0]);
      }
    }
  }, [selectedDistrict, currentUser]);

  const copyToClipboardWithFallback = async (text, successMsg) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setNotifTrayCopiedNotice(successMsg);
      setTimeout(() => setNotifTrayCopiedNotice(null), 4000);
      showToast(successMsg, 'success');
    } catch (err) {
      console.error('Copy failed:', err);
      alert('Could not copy to clipboard. Please copy manually.');
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
    const rowLines = items.map((item, idx) => {
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

  const notifTrayData = useMemo(() => {
    const list = [];
    const now = new Date();
    
    const filteredRecords = rawRecords.filter(r => {
      const dist = canonicalizeDistrict(r.working_place || r.district || '');
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
        if (!allowed.includes(dist)) return false;
      }
      if (notifTrayDistricts && notifTrayDistricts.length > 0 && !notifTrayDistricts.includes('All')) {
        const canonicalSelected = notifTrayDistricts.map(canonicalizeDistrict);
        if (!canonicalSelected.includes(dist)) return false;
      } else if (notifTrayDistrict && notifTrayDistrict !== 'All' && dist !== notifTrayDistrict) {
        return false;
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
            days_elapsed: daysElapsed
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
  }, [rawRecords, notifTrayDistricts, notifTrayDistrict, currentUser]);

  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [journeySearchId, setJourneySearchId] = useState('');
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyResult, setJourneyResult] = useState(null);
  const [journeyError, setJourneyError] = useState('');

  const handleReconcileNikshay = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!nikshayFile) {
      setNikshayError('Please select an official Nikshay .xlsx or .csv file first.');
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
      const token = localStorage.getItem('dfy_admin_token') || '';
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
      if (data.summary?.flagged_review_count > 0) {
        setNikshayActiveTab('flagged_review');
      } else if (data.summary?.ready_for_portal_count > 0) {
        setNikshayActiveTab('ready_for_portal');
      } else {
        setNikshayActiveTab('missing_in_dfy');
      }
      // Auto-refresh ledger cache and sync status banner in background
      fetchCumulativeLedger(1, '', nikshayDistrict);
      fetchNikshaySyncStatus();
    } catch (err) {
      setNikshayError(err.message || 'Error running reconciliation');
    } finally {
      setNikshayLoading(false);
    }
  };

  const handleFetchJourney = async (patientIdToFetch) => {
    const pid = (patientIdToFetch || journeySearchId || '').trim();
    if (!pid) return;
    setJourneyLoading(true);
    setJourneyError('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/reports/patient-journey/${encodeURIComponent(pid)}`);
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail || 'Patient not found');
      }
      const data = await res.json();
      setJourneyResult(data);
    } catch (err) {
      setJourneyError(err.message || 'Error fetching patient timeline');
    } finally {
      setJourneyLoading(false);
    }
  };


  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canEditTargets = isSuperAdmin || currentUser?.permissions?.can_edit_targets !== false;
  const canManageStaff = isSuperAdmin || currentUser?.permissions?.can_manage_staff !== false;
  const canEditPatientIds = isSuperAdmin || currentUser?.permissions?.can_edit_patient_ids !== false;
  const canExportReports = isSuperAdmin || currentUser?.permissions?.can_export_reports !== false;

  const getAdminToken = useCallback(() => {
    return encodeURIComponent(localStorage.getItem('dfy_admin_token') || '');
  }, []);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('dfy_admin_token') || '';
    const headers = {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('dfy_admin_auth');
      localStorage.removeItem('dfy_admin_user');
      localStorage.removeItem('dfy_admin_token');
      setIsAuthenticated(false);
      setError('Your admin session has expired. Please log in again.');
    }
    return res;
  }, []);


  const fetchActiveBroadcasts = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const roleParam = currentUser?.role === 'SUPER_ADMIN' ? '' : '&role=SUB_ADMIN';
      let distParam = '';
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        distParam = `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/api/broadcasts/active?${roleParam}${distParam}`);
      if (res.ok) {
        const data = await res.json();
        const active = data.broadcasts || [];
        setActiveAdminBroadcasts(active);

        // Check if there is an unread high-priority or un-dismissed broadcast
        try {
          const seenIds = JSON.parse(localStorage.getItem('dfy_seen_broadcasts') || '[]');
          const unread = active.find(b => !seenIds.includes(b.id));
          if (unread && !unreadBroadcastPopup) {
            setUnreadBroadcastPopup(unread);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error("Failed to fetch active broadcasts", e);
    }
  };

  const fetchAllBroadcasts = async () => {
    try {
      setLoadingBroadcasts(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let distParam = '';
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        distParam = `?districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/api/broadcasts/all${distParam}`);
      if (res.ok) {
        const data = await res.json();
        setBroadcastsList(data.broadcasts || []);
      }
    } catch (e) {
      console.error("Failed to fetch all broadcasts", e);
    } finally {
      setLoadingBroadcasts(false);
    }
  };

  const handleCreateBroadcast = async (e) => {
    e.preventDefault();
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
          target_districts: target_districts,
          created_by_user: currentUser?.name || currentUser?.username || "Admin",
          created_by_role: currentUser?.role || "SUPER_ADMIN",
          allowed_districts: currentUser?.allowed_districts || ["All"]
        })
      });
      const data = await res.json();
      if (res.ok) {
        setNewBroadcastModal(null);
        fetchAllBroadcasts();
        fetchActiveBroadcasts();
      } else {
        setNewBroadcastModal(prev => ({ ...prev, error: data.detail || "Failed to create broadcast.", loading: false }));
      }
    } catch (err) {
      setNewBroadcastModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
    }
  };

  const handleDeleteBroadcast = async (broadcast_id) => {
    if (!window.confirm("Kya aap sach me yeh broadcast alert delete karna chahte hain? Sabhi staff aur sub-admins ke portal se turant hat jayega.")) return;
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
        setBroadcastsList(prev => prev.filter(b => b.id !== broadcast_id));
        setActiveAdminBroadcasts(prev => prev.filter(b => b.id !== broadcast_id));
        if (unreadBroadcastPopup && unreadBroadcastPopup.id === broadcast_id) {
          setUnreadBroadcastPopup(null);
        }
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to delete broadcast");
      }
    } catch (e) {
      alert("Network error while deleting broadcast.");
    }
  };

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

  // Zero-Firestore In-Memory Derivation: Instantly computes attendance from loaded rawRecords (0 reads, 0 Render load)
  const deriveAttendanceFromRecords = (targetDate) => {
    if (!staffDirectory || Object.keys(staffDirectory).length === 0 || !rawRecords) return null;

    const allowedDistSet = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? new Set(currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase()))
      : null;

    // Fast lookup for inactive_since / lifecycle status from staffList
    const staffMetaMap = {};
    (staffList || []).forEach(s => {
      const d = canonicalizeDistrict(s.district || '').toLowerCase();
      const cleanFo = (s.name || s.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      staffMetaMap[`${d}_${cleanFo}`] = s;
    });

    const staffRoster = [];
    Object.entries(staffDirectory).forEach(([rawDist, names]) => {
      const cDist = canonicalizeDistrict(rawDist);
      if (allowedDistSet && !allowedDistSet.has(cDist.toLowerCase())) return;
      (names || []).forEach(name => {
        if (name && String(name).trim()) {
          const foName = String(name).trim();
          const cleanFo = foName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const meta = staffMetaMap[`${cDist.toLowerCase()}_${cleanFo}`];

          // Filter out any staff whose inactive_since is on or before targetDate
          if (meta) {
            const isInactive = meta.is_active === false || meta.status === 'inactive';
            const inactiveSince = (meta.inactive_since || '').slice(0, 10);
            if (isInactive) {
              if (!inactiveSince || targetDate >= inactiveSince) return;
            } else {
              if (inactiveSince && targetDate >= inactiveSince) return;
            }
          }

          staffRoster.push({
            district: cDist,
            fo_name: foName,
            designation: (meta && meta.designation) || "Field Officer"
          });
        }
      });
    });

    // Also include any active staff from staffList not in static staffDirectory
    const existingRosterKeys = new Set(staffRoster.map(s => `${canonicalizeDistrict(s.district).toLowerCase()}_${s.fo_name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`));
    (staffList || []).forEach(s => {
      const cDist = canonicalizeDistrict(s.district || '');
      if (allowedDistSet && !allowedDistSet.has(cDist.toLowerCase())) return;
      const foName = (s.name || s.fo_name || '').trim();
      if (!foName) return;
      const cleanFo = foName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `${cDist.toLowerCase()}_${cleanFo}`;
      if (existingRosterKeys.has(key)) return;

      const isInactive = s.is_active === false || s.status === 'inactive';
      const inactiveSince = (s.inactive_since || '').slice(0, 10);
      if (isInactive) {
        if (!inactiveSince || targetDate >= inactiveSince) return;
      } else {
        if (inactiveSince && targetDate >= inactiveSince) return;
      }

      staffRoster.push({
        district: cDist,
        fo_name: foName,
        designation: s.designation || "Field Officer"
      });
    });

    const dateReports = rawRecords.filter(r => {
      const rDate = String(r.date_of_reporting || r.date || '').split('T')[0];
      return rDate === targetDate;
    });

    const reportsMap = {};
    dateReports.forEach(r => {
      const dist = canonicalizeDistrict(r.working_place || '');
      if (allowedDistSet && !allowedDistSet.has(dist.toLowerCase())) return;
      const cleanFo = (r.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `${dist}_${cleanFo}`.replace(/\s+/g, '').toLowerCase();

      const rawTs = r.timestamp_completed || r.timestamp || r.submitted_at || r.timestamp_raw || '';
      let submittedTime = r.submitted_time || "Submitted";
      if ((!submittedTime || submittedTime === "Submitted") && rawTs) {
        try {
          const cleanTs = String(rawTs).includes('T') ? rawTs : String(rawTs).replace(' ', 'T');
          const d = new Date(cleanTs);
          if (!isNaN(d.getTime())) {
            submittedTime = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
          }
        } catch (e) {}
      }

      // Stealth 10 AM Cutoff Segregation for in-memory derivation:
      const isNextDay = Boolean(r.is_next_day_submission || r.is_next_day);
      const morningTime = r.submitted_morning_time || (isNextDay ? submittedTime : '');
      const submittedLabel = r.morning_submission_label || r.submitted_label || (isNextDay ? `Next day morning ${morningTime}` : (submittedTime || 'Submitted'));

      // Total IDs: use r.total_ids if present (computed across all _ids lists), else sum available numeric categories
      const computedTotalIds = r.total_ids !== undefined
        ? r.total_ids
        : ((r.notifications || 0) + (r.tests || 0) + (r.presumptive || 0) + (r.hiv_dm || 0) + (r.dbt || 0) + (r.differentiated_tb || 0) + (r.tpt_treatment_start || 0) + (r.sample_collection || 0) + (r.contact_tracing || 0) + (r.face_to_face || 0) + (r.documents || 0));

      reportsMap[key] = {
        district: dist,
        fo_name: (r.fo_name || '').trim(),
        submission_count: r.submission_count || 1,
        total_ids: computedTotalIds,
        submitted_time: submittedTime,
        timestamp_raw: rawTs,
        total_km: r.total_km || 0,
        is_next_day: isNextDay,
        submitted_morning_time: morningTime,
        submitted_label: submittedLabel
      };
    });

    // Existing leaves for this date (from state if same targetDate)
    const leavesMap = {};
    if (attendance && (attendance.date === targetDate || !attendance.date) && attendance.on_leave_fos) {
      attendance.on_leave_fos.forEach(l => {
        const dist = canonicalizeDistrict(l.district || '');
        const cleanFo = (l.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        leavesMap[`${dist}_${cleanFo}`.toLowerCase()] = l;
      });
    }

    const submittedFull = [];
    const submittedPartial = [];
    const onLeaveFos = [];
    const missingFos = [];
    const matchedKeys = new Set();

    staffRoster.forEach(s => {
      const cleanFo = s.fo_name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `${s.district}_${cleanFo}`.replace(/\s+/g, '').toLowerCase();
      if (reportsMap[key]) {
        matchedKeys.add(key);
        const rep = reportsMap[key];
        const info = { ...s, ...rep };
        if (rep.submission_count >= 2) submittedFull.push(info);
        else submittedPartial.push(info);
      } else if (leavesMap[key]) {
        onLeaveFos.push({ ...s, ...leavesMap[key] });
      } else {
        missingFos.push(s);
      }
    });

    Object.entries(reportsMap).forEach(([rkey, rinfo]) => {
      if (!matchedKeys.has(rkey)) {
        submittedPartial.push({ ...rinfo, designation: "Field Officer" });
      }
    });

    const submittedFos = [...submittedFull, ...submittedPartial].sort((a, b) => (b.timestamp_raw || '').localeCompare(a.timestamp_raw || ''));
    missingFos.sort((a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name));
    onLeaveFos.sort((a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name));

    return {
      date: targetDate,
      total_staff: staffRoster.length,
      submitted_count: submittedFos.length,
      submitted_full_count: submittedFull.length,
      submitted_partial_count: submittedPartial.length,
      on_leave_count: onLeaveFos.length,
      missing_count: missingFos.length,
      submitted_fos: submittedFos,
      submitted_full: submittedFull,
      submitted_partial: submittedPartial,
      on_leave_fos: onLeaveFos,
      missing_fos: missingFos,
      is_derived: true
    };
  };

  const fetchAttendance = async (force = false, targetDate = attendanceDate) => {
    const isWithinLoadedMonth = targetDate && targetDate.slice(0, 7) === month;
    const todayStr = new Date().toISOString().slice(0, 10);
    const isPastDateInMonth = isWithinLoadedMonth && targetDate !== todayStr;

    // Instant Zero-Read Derivation for loaded month dates (0 reads, 0 Render load)
    if (!force && isWithinLoadedMonth && rawRecords && rawRecords.length > 0) {
      const derived = deriveAttendanceFromRecords(targetDate);
      if (derived) {
        setAttendance(derived);
        // Only return early if we have valid timestamps in derived data (guards against stale pre-cached records)
        const hasTimestamps = derived.submitted_fos.length === 0 || derived.submitted_fos.some(fo => fo.submitted_time && fo.submitted_time !== 'Submitted');
        if (isPastDateInMonth && hasTimestamps) {
          return; // Past date in loaded month is 100% complete in rawRecords with timestamps! No network request needed!
        }
      }
    }

    setIsAttendanceLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const params = new URLSearchParams();
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        params.set('districts', currentUser.allowed_districts.join(','));
      }
      if (targetDate) {
        params.set('date', targetDate);
      }
      if (force) {
        params.set('force_refresh', 'true');
        params.set('_t', Date.now().toString());
      }
      const q = params.toString() ? `?${params.toString()}` : '';
      const res = await authFetch(`${API_BASE_URL}/admin/today-attendance${q}`);
      if (res.ok) {
        const data = await res.json();
        setAttendance(data);
      }
    } catch (e) {
      console.error("Attendance fetch error", e);
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  const fetchBackupStatus = async () => {
    setBackupLoading(true);
    setBackupActionMsg('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/backup/status`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load backup status");
      }
      const data = await res.json();
      setBackupStatus(data);
    } catch (err) {
      console.error("Backup status error:", err);
      setBackupActionMsg(`⚠️ ${err.message}`);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleTriggerBackupNow = async () => {
    setBackupTriggerLoading(true);
    setBackupActionMsg('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/backup/trigger-now`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Backup generation failed");
      showToast(`✓ Cloud Backup created: ${data.filename} (${data.size_kb} KB)`, "success");
      setBackupActionMsg(`✓ Snapshot saved to Google Cloud Storage: ${data.filename} (${data.size_kb} KB, ${data.total_documents} records)`);
      fetchBackupStatus();
    } catch (err) {
      console.error("Backup trigger error:", err);
      setBackupActionMsg(`⚠️ Error: ${err.message}`);
    } finally {
      setBackupTriggerLoading(false);
    }
  };

  const handleDownloadBackup = async (filename) => {
    try {
      showToast(`📥 Downloading ${filename}...`, "info");
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = localStorage.getItem('dfy_admin_token') || '';
      const url = `${API_BASE_URL}/admin/backup/download/${encodeURIComponent(filename)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error("Download request failed");
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(`✓ Downloaded ${filename} successfully!`, "success");
    } catch (err) {
      showToast(`⚠️ Download failed: ${err.message}`, "error");
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreTargetFile) return;
    if (restoreConfirmText.trim() !== 'RESTORE-CONFIRM') {
      alert("Please type RESTORE-CONFIRM exactly into the confirmation box to proceed.");
      return;
    }
    if (!window.confirm(`⚠️ CAUTION: Are you sure you want to restore the entire database from ${restoreTargetFile}?\nExisting records will be updated or added.`)) {
      return;
    }
    setRestoreLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/backup/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: restoreTargetFile,
          confirmation_code: restoreConfirmText.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Restore operation failed");
      alert(`✓ Database restore successful!\n${data.restored_documents} documents restored.\n\nThe dashboard will now refresh.`);
      setRestoreTargetFile(null);
      setRestoreConfirmText('');
      fetchData(true);
    } catch (err) {
      alert(`⚠️ Restore Error: ${err.message}`);
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleExecuteMarkLeave = async () => {
    if (!leaveActionModal) return;
    if (isSavingLeave) return;

    const { district, fo_name, date, status, reason_type, remark } = leaveActionModal;
    if (!district || !fo_name) {
      showToast("⚠️ District and Field Officer name are required.", "error");
      return;
    }

    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      if (!allowed.includes(canonicalizeDistrict(district).toLowerCase())) {
        showToast("⚠️ Permission denied for this district.", "error");
        return;
      }
    }

    setIsSavingLeave(true);
    const targetDate = date || attendanceDate;
    const leaveStatus = status || 'leave';
    const leaveReason = reason_type || 'Casual';
    const leaveRemark = remark || '';

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const payload = {
        district,
        fo_name,
        date: targetDate,
        status: leaveStatus,
        reason_type: leaveReason,
        remark: leaveRemark
      };

      const res = await authFetch(`${API_BASE_URL}/admin/attendance/mark-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to record leave");

      // Optimistic state update: move officer from missing_fos to on_leave_fos
      setAttendance(prev => {
        if (!prev) return prev;
        const cleanFo = fo_name.trim().toLowerCase();
        const cleanDist = canonicalizeDistrict(district).toLowerCase();

        const nextMissing = (prev.missing_fos || []).filter(
          f => !(f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist)
        );

        const newLeaveRecord = {
          district,
          fo_name,
          status: leaveStatus,
          reason_type: leaveReason,
          remark: leaveRemark,
          marked_by_name: currentUser?.name || currentUser?.username || 'Admin',
          marked_at: new Date().toISOString()
        };

        const nextLeaves = [
          ...(prev.on_leave_fos || []).filter(
            f => !(f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist)
          ),
          newLeaveRecord
        ].sort((a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name));

        return {
          ...prev,
          missing_fos: nextMissing,
          missing_count: nextMissing.length,
          on_leave_fos: nextLeaves,
          on_leave_count: nextLeaves.length
        };
      });

      showToast(`✓ Marked ${leaveStatus === 'absent' ? 'absent' : leaveStatus === 'weekly_off' ? 'weekly off' : 'leave'} for ${fo_name}`, "success");
      setLeaveActionModal(null);
      fetchAttendance(true, targetDate);
    } catch (err) {
      console.error("Mark leave error:", err);
      showToast(`⚠️ ${err.message}`, "error");
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleExecuteUnmarkLeave = async (district, fo_name, date) => {
    if (isSavingLeave) return;

    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      if (!allowed.includes(canonicalizeDistrict(district).toLowerCase())) {
        showToast("⚠️ Permission denied for this district.", "error");
        return;
      }
    }

    if (!window.confirm(`Kya aap sure hain ki ${fo_name} (${district}) ka leave revert karna chahte hain?`)) {
      return;
    }

    setIsSavingLeave(true);
    const targetDate = date || attendanceDate;

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/attendance/unmark-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, fo_name, date: targetDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to revert leave");

      // Optimistic state update: move officer back to missing_fos
      setAttendance(prev => {
        if (!prev) return prev;
        const cleanFo = fo_name.trim().toLowerCase();
        const cleanDist = canonicalizeDistrict(district).toLowerCase();

        const nextLeaves = (prev.on_leave_fos || []).filter(
          f => !(f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist)
        );

        const alreadyMissing = (prev.missing_fos || []).some(
          f => f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist
        );

        const nextMissing = alreadyMissing
          ? prev.missing_fos
          : [...(prev.missing_fos || []), { district, fo_name, designation: "Field Officer" }].sort(
              (a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name)
            );

        return {
          ...prev,
          on_leave_fos: nextLeaves,
          on_leave_count: nextLeaves.length,
          missing_fos: nextMissing,
          missing_count: nextMissing.length
        };
      });

      showToast(`✓ Leave reverted for ${fo_name}`, "success");
      fetchAttendance(true, targetDate);
    } catch (err) {
      console.error("Unmark leave error:", err);
      showToast(`⚠️ ${err.message}`, "error");
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleExecuteAttendanceRemark = async () => {
    if (!attendanceRemarkModal || isSavingAttendanceRemark) return;
    const { district, fo_name, date, action, remark, status, reason_type } = attendanceRemarkModal;
    if (!district || !fo_name) {
      showToast("⚠️ District and Field Officer name are required.", "error");
      return;
    }
    if (!remark || !remark.trim()) {
      showToast("⚠️ Please enter a remark.", "error");
      return;
    }
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      if (!allowed.includes(canonicalizeDistrict(district).toLowerCase())) {
        showToast("⚠️ Permission denied for this district.", "error");
        return;
      }
    }

    setIsSavingAttendanceRemark(true);
    const targetDate = date || attendanceDate;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/attendance/add-remark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          fo_name,
          date: targetDate,
          action: action || 'remark',
          remark: remark.trim(),
          status: status || 'leave',
          reason_type: reason_type || 'Casual'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to record remark");

      showToast(action === 'remark' ? "✓ Attendance inspection remark recorded successfully!" : "✓ Leave status overridden successfully!", "success");
      setAttendanceRemarkModal(null);
      fetchAttendance(true, targetDate);
    } catch (err) {
      showToast(`❌ ${err.message}`, "error");
    } finally {
      setIsSavingAttendanceRemark(false);
    }
  };

  const fetchPacingSettings = async (targetMonth = month, targetDistrict = selectedDistrict) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let distParam = "all";
      if (targetDistrict && targetDistrict !== 'All') {
        distParam = canonicalizeDistrict(targetDistrict);
      } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts?.length > 0 && !currentUser.allowed_districts.includes('All')) {
        distParam = canonicalizeDistrict(currentUser.allowed_districts[0]);
      }
      const res = await authFetch(`${API_BASE_URL}/admin/pacing/settings?month=${targetMonth}&district=${distParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.declared_holidays === 'number') {
          setPacingHolidaysCount(data.declared_holidays);
        }
      }
    } catch (err) {
      console.error("Fetch pacing settings error:", err);
    }
  };

  const handleUpdatePacingHolidays = async (delta) => {
    const newCount = Math.max(0, Math.min(15, (Number(pacingHolidaysCount) || 0) + delta));
    setPacingHolidaysCount(newCount);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let distParam = "all";
      if (selectedDistrict && selectedDistrict !== 'All') {
        distParam = canonicalizeDistrict(selectedDistrict);
      } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts?.length > 0 && !currentUser.allowed_districts.includes('All')) {
        distParam = canonicalizeDistrict(currentUser.allowed_districts[0]);
      }

      if (currentUser?.role === 'SUB_ADMIN' && distParam === 'all') {
        showToast("⚠️ Sub-Admins must select their district to configure holidays.", "error");
        return;
      }

      const res = await authFetch(`${API_BASE_URL}/admin/pacing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          district: distParam,
          declared_holidays: newCount
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update declared holidays");
      }
      showToast(`✓ Declared holidays updated to ${newCount}`, "success");
    } catch (err) {
      console.error("Update pacing holidays error:", err);
      showToast(`⚠️ ${err.message}`, "error");
    }
  };

  const copyOnLeaveSummary = () => {
    const list = attendance?.on_leave_fos || [];
    if (!list || list.length === 0) return;
    const byDistrict = {};
    list.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo);
    });

    let msg = `*DFY MIS - Staff On Leave / Absent*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Total On Leave/Absent: ${list.length} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(fo => {
        const statusLabel = fo.status === 'absent' ? '⚠️ Absent' : fo.status === 'weekly_off' ? '📅 Weekly Off' : '🏖️ Leave';
        msg += `  - ${fo.fo_name} (${statusLabel} - ${fo.reason_type || 'Casual'}${fo.remark ? `: ${fo.remark}` : ''})\n`;
      });
      msg += `\n`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast("✓ Leave list copied for WhatsApp!", "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyMissingReminder = () => {
    if (!attendance || !attendance.missing_fos) return;
    const onLeaveSet = new Set(
      (attendance.on_leave_fos || []).map(l => `${canonicalizeDistrict(l.district || '').toLowerCase()}_${(l.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`)
    );
    const byDistrict = {};
    attendance.missing_fos.forEach(fo => {
      const key = `${canonicalizeDistrict(fo.district || '').toLowerCase()}_${(fo.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      if (onLeaveSet.has(key)) return; // Strictly exclude staff on leave
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo.fo_name);
    });

    let msg = `*DFY MIS Reminder - Pending Daily Reports*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Missing: ${attendance.missing_count} of ${attendance.total_staff} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(name => {
        msg += `  - ${name}\n`;
      });
      msg += `\n`;
    }

    if (attendance?.on_leave_count > 0) {
      msg += `ℹ️ (${attendance.on_leave_count} staff on approved leave/absent today)\n\n`;
    }

    msg += `Kripya sabhi sadasya turant apni field report submit karein!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast("✓ Pending reminder copied for WhatsApp!", "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copySubmittedSummary = () => {
    const list = attendance?.submitted_fos || [...(attendance?.submitted_full || []), ...(attendance?.submitted_partial || [])];
    if (!list || list.length === 0) return;
    const byDistrict = {};
    list.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo);
    });

    let msg = `*DFY MIS - Submitted Field Reports*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Submitted: ${list.length} of ${attendance.total_staff} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(fo => {
        const timeNote = fo.is_next_day 
          ? `[⏰ ${fo.submitted_label || ('Next day morning ' + fo.submitted_time)}]`
          : `⏰ ${fo.submitted_time || 'Submitted'}`;
        msg += `  - ${fo.fo_name} (${fo.total_ids || 0} IDs) - ${timeNote}\n`;
      });
      msg += `\n`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  // Punctuality & Time Classification Helper (Standard evening window: 5 PM - 8 PM)
  const getSubmissionTimeClassification = (submittedTimeStr, timestampRaw, isNextDay = false) => {
    if (isNextDay) {
      return {
        bracket: 'next_day',
        label: 'Next Day Morning (< 10 AM)',
        shortLabel: 'Next Day Morning',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
      };
    }
    let hour = null;
    if (submittedTimeStr && typeof submittedTimeStr === 'string') {
      const match = submittedTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const meridiem = (match[3] || '').toUpperCase();
        if (meridiem === 'PM' && h !== 12) h += 12;
        if (meridiem === 'AM' && h === 12) h = 0;
        hour = h;
      }
    }
    if (hour === null && timestampRaw) {
      try {
        const d = new Date(timestampRaw);
        if (!isNaN(d.getTime())) {
          // IST (UTC + 5:30)
          hour = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
        }
      } catch (e) {}
    }
    if (hour === null) {
      return { bracket: 'unknown', label: 'Submitted', shortLabel: 'Submitted', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
    // 1. Standard On-Time: 5:00 PM – 8:00 PM (17:00 – 19:59)
    if (hour >= 17 && hour < 20) {
      return { 
        bracket: 'on_time', 
        label: 'On-Time (5 PM - 8 PM)', 
        shortLabel: 'On-Time', 
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' 
      };
    }
    // 2. Late Evening: 8:00 PM – 10:00 PM (20:00 – 21:59)
    if (hour >= 20 && hour < 22) {
      return { 
        bracket: 'late', 
        label: 'Late Evening (8 PM - 10 PM)', 
        shortLabel: 'Late (8-10 PM)', 
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 font-bold' 
      };
    }
    // 3. Delayed / Night: After 10:00 PM (22:00 – 23:59 or 00:00 - 04:00)
    if (hour >= 22 || hour < 4) {
      return { 
        bracket: 'delayed', 
        label: 'Night Submission (> 10 PM)', 
        shortLabel: 'Night (> 10 PM)', 
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' 
      };
    }
    // 4. Mid-Day / Early: Before 5:00 PM (04:00 – 16:59)
    return { 
      bracket: 'early', 
      label: 'Mid-Day (< 5 PM)', 
      shortLabel: 'Mid-Day (< 5 PM)', 
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' 
    };
  };

  // Set of inactive staff normalized keys from staffList
  const inactiveStaffNamesSet = useMemo(() => {
    const sSet = new Set();
    (staffList || []).forEach(s => {
      if (s.is_active === false || s.status === 'inactive') {
        sSet.add(normalizeStaffKey(s.district, s.name || s.fo_name));
      }
    });
    return sSet;
  }, [staffList]);

  // Chronic Non-Submitter / Absence Streaks (2+ consecutive days without report)
  const chronicDefaulters = useMemo(() => {
    if (!staffDirectory || Object.keys(staffDirectory).length === 0 || !rawRecords) return [];

    const submissionSet = new Set();
    (rawRecords || []).forEach(r => {
      const d = String(r.date_of_reporting || r.date || '').split('T')[0];
      const cDist = canonicalizeDistrict(r.working_place || '').toLowerCase();
      const cleanFo = (r.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (d && cDist && cleanFo) {
        submissionSet.add(`${cDist}_${cleanFo}_${d}`);
      }
    });

    const targetDateObj = new Date(attendanceDate);
    const checkDates = [];
    for (let i = 0; i <= 5; i++) {
      const d = new Date(targetDateObj);
      d.setDate(d.getDate() - i);
      checkDates.push(d.toISOString().slice(0, 10));
    }

    // Set of officers currently on leave or absent today
    const onLeaveSet = new Set(
      (attendance?.on_leave_fos || []).map(l => `${canonicalizeDistrict(l.district || '').toLowerCase()}_${(l.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`)
    );

    // Inactive cutoff lookup from staffList
    const inactiveCutoffMap = {};
    (staffList || []).forEach(s => {
      const d = canonicalizeDistrict(s.district || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const n = (s.name || s.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const normKey = normalizeStaffKey(s.district, s.name || s.fo_name);
      if (s.is_active === false || s.status === 'inactive' || s.inactive_since) {
        const cutoff = (s.inactive_since || '').slice(0, 10);
        inactiveCutoffMap[`${d}_${n}`] = cutoff;
        inactiveCutoffMap[normKey] = cutoff;
      }
    });

    const defaulters = [];
    const allowedDistSet = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? new Set(currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase()))
      : null;

    Object.entries(staffDirectory).forEach(([rawDist, names]) => {
      const cDist = canonicalizeDistrict(rawDist);
      if (allowedDistSet && !allowedDistSet.has(cDist.toLowerCase())) return;

      (names || []).forEach(name => {
        const cleanName = String(name || '').trim();
        if (!cleanName) return;
        const cleanFo = cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const distKey = cDist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const foKey = `${distKey}_${cleanFo}`;
        const normKey = normalizeStaffKey(cDist, cleanName);

        // Exclude staff on leave/absent today
        if (onLeaveSet.has(foKey)) return;

        // Exclude deactivated staff whose cutoff date is on or before attendanceDate
        if (inactiveCutoffMap[foKey] !== undefined) {
          const cutoff = inactiveCutoffMap[foKey];
          if (!cutoff || attendanceDate >= cutoff) return;
        }
        if (inactiveCutoffMap[normKey] !== undefined) {
          const cutoff = inactiveCutoffMap[normKey];
          if (!cutoff || attendanceDate >= cutoff) return;
        }
        if (inactiveStaffNamesSet.has(normKey)) return;

        let consecutiveMissed = 0;
        const missedDates = [];
        for (const cd of checkDates) {
          const dayOfWeek = new Date(cd).getDay();
          if (dayOfWeek === 0) continue; // Skip Sunday field break

          const hasReport = submissionSet.has(`${distKey}_${cleanFo}_${cd}`);
          if (!hasReport) {
            consecutiveMissed++;
            missedDates.push(cd);
          } else {
            break; // Stop at first submitted day
          }
        }

        if (consecutiveMissed >= 2) {
          defaulters.push({
            district: cDist,
            fo_name: cleanName,
            designation: "Field Officer",
            consecutiveDays: consecutiveMissed,
            missedDates,
            severity: consecutiveMissed >= 3 ? 'CRITICAL' : 'WARNING'
          });
        }
      });
    });

    return defaulters.sort((a, b) => b.consecutiveDays - a.consecutiveDays || a.district.localeCompare(b.district));
  }, [staffDirectory, rawRecords, attendanceDate, currentUser, attendance, staffList, inactiveStaffNamesSet]);

  // District-wise attendance scorecard rollup
  const districtAttendanceRollup = useMemo(() => {
    if (!attendance) return [];
    const submittedList = attendance.submitted_fos || [...(attendance.submitted_full || []), ...(attendance.submitted_partial || [])];
    const missingList = attendance.missing_fos || [];

    const map = {};
    Object.entries(staffDirectory || {}).forEach(([dist, names]) => {
      const cDist = canonicalizeDistrict(dist);
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        if (!currentUser.allowed_districts.includes(cDist)) return;
      }
      map[cDist] = { district: cDist, total: (names || []).length, submitted: 0, missing: 0 };
    });

    submittedList.forEach(fo => {
      const d = canonicalizeDistrict(fo.district);
      if (!map[d]) map[d] = { district: d, total: 0, submitted: 0, missing: 0 };
      map[d].submitted++;
      if (map[d].total < map[d].submitted) map[d].total = map[d].submitted;
    });

    missingList.forEach(fo => {
      const d = canonicalizeDistrict(fo.district);
      if (!map[d]) map[d] = { district: d, total: 0, submitted: 0, missing: 0, on_leave: 0 };
      map[d].missing++;
      if (map[d].total < (map[d].submitted + map[d].missing)) map[d].total = map[d].submitted + map[d].missing;
    });

    const onLeaveList = attendance.on_leave_fos || [];
    onLeaveList.forEach(fo => {
      const d = canonicalizeDistrict(fo.district);
      if (!map[d]) map[d] = { district: d, total: 0, submitted: 0, missing: 0, on_leave: 0 };
      map[d].on_leave = (map[d].on_leave || 0) + 1;
      if (map[d].total < (map[d].submitted + map[d].missing + (map[d].on_leave || 0))) {
        map[d].total = map[d].submitted + map[d].missing + (map[d].on_leave || 0);
      }
    });

    return Object.values(map).map(item => ({
      ...item,
      pct: item.total > 0 ? Math.round((item.submitted / item.total) * 100) : 0
    })).sort((a, b) => b.pct - a.pct || a.district.localeCompare(b.district));
  }, [attendance, staffDirectory, currentUser]);

  const copyDefaultersWarning = () => {
    if (!chronicDefaulters || chronicDefaulters.length === 0) return;
    let msg = `*🚨 DFY MIS Alert — Chronic Inactive Field Officers*\n`;
    msg += `As of Date: ${attendanceDate}\n`;
    msg += `Officers with 2+ consecutive days without daily reports:\n\n`;

    const byDistrict = {};
    chronicDefaulters.forEach(d => {
      if (!byDistrict[d.district]) byDistrict[d.district] = [];
      byDistrict[d.district].push(d);
    });

    for (const dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(fo => {
        msg += `  - ${fo.fo_name} (${fo.consecutiveDays} days inactive: ${fo.missedDates.slice(0, 3).join(', ')})\n`;
      });
      msg += `\n`;
    }
    msg += `⚠️ Immediate follow-up required by District Coordinators.`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast("✓ Defaulters alert copied for WhatsApp!", "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyDistrictSpecificSummary = (distName) => {
    if (!attendance) return;
    const submittedList = (attendance.submitted_fos || [...(attendance.submitted_full || []), ...(attendance.submitted_partial || [])])
      .filter(fo => canonicalizeDistrict(fo.district) === distName);
    const missingList = (attendance.missing_fos || [])
      .filter(fo => canonicalizeDistrict(fo.district) === distName);
    const onLeaveList = (attendance.on_leave_fos || [])
      .filter(fo => canonicalizeDistrict(fo.district) === distName);

    const total = submittedList.length + missingList.length + onLeaveList.length;
    const activeTotal = submittedList.length + missingList.length;
    const pct = activeTotal > 0 ? Math.round((submittedList.length / activeTotal) * 100) : 0;

    let msg = `*📊 DFY MIS — ${distName} Attendance Update*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Status: ${submittedList.length} of ${activeTotal} Active FOs Submitted (${pct}%)${onLeaveList.length > 0 ? ` • ${onLeaveList.length} On Leave` : ''}\n\n`;

    if (submittedList.length > 0) {
      msg += `*✅ Submitted (${submittedList.length}):*\n`;
      submittedList.forEach(fo => {
        const timeClass = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
        const timeDisplay = fo.is_next_day
          ? `[⏰ ${fo.submitted_label || ('Next day morning ' + fo.submitted_time)}]`
          : `[⏰ ${fo.submitted_time || 'Submitted'} • ${timeClass.shortLabel}]`;
        msg += `  - ${fo.fo_name} (${fo.total_ids || 0} IDs) ${timeDisplay}\n`;
      });
      msg += `\n`;
    }

    if (missingList.length > 0) {
      msg += `*⚠️ Pending / Not Submitted (${missingList.length}):*\n`;
      missingList.forEach(fo => {
        msg += `  - ${fo.fo_name}\n`;
      });
      msg += `\n`;
    }

    if (onLeaveList.length > 0) {
      msg += `*🏖️ On Leave / Absent (${onLeaveList.length}):*\n`;
      onLeaveList.forEach(fo => {
        const statusLabel = fo.status === 'absent' ? '⚠️ Absent' : fo.status === 'weekly_off' ? '📅 Weekly Off' : '🏖️ Leave';
        msg += `  - ${fo.fo_name} (${statusLabel} - ${fo.reason_type || 'Casual'}${fo.remark ? `: ${fo.remark}` : ''})\n`;
      });
      msg += `\n`;
    }
    msg += `Kripya pending officers se report submit karwayen!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast(`✓ ${distName} WhatsApp report copied!`, "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyStateSummary = () => {
    const today = new Date().toISOString().split('T')[0];
    let msg = `*DFY MIS - State Daily Performance Bulletin*\n`;
    msg += `Date: ${today} | Month: ${month}\n\n`;
    msg += `*State Key Metrics:*\n`;
    msg += `Presumptive TB: ${totals.presumptive}\n`;
    msg += `Notifications: ${totals.notifications}\n`;
    msg += `Samples Tested: ${totals.tests}\n`;
    msg += `DBT Processed: ${totals.dbt}\n`;
    msg += `TPT (Start/Presumptive): ${totals.tpt_treatment_start} / ${totals.tpt_presumptive}\n`;
    msg += `Doctor/Store Visits: ${totals.doctor_visits}\n`;
    msg += `Total Reports: ${rawRecords.length}\n\n`;
    msg += `DFY Tuberculosis Health Mission`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      alert("State Summary copied to clipboard! Ready to paste in WhatsApp.");
    }
  };

  const downloadAllWorkbooks = () => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    let distParam = "";
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      distParam = `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
    }
    window.open(`${API_BASE_URL}/download-all-kpi-workbooks?month=${month}${distParam}&token=${getAdminToken()}`, "_blank");
  };

  const fetchDuplicateAudit = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/admin/duplicate-audit${q}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateAudit(data);
      }
    } catch (e) {
      console.error("Duplicate audit fetch failed", e);
    }
  };

  const fetchDuplicateScan = async (force = false) => {
    setDuplicateScanLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}`;
      if (force) q += `&force_refresh=true`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/admin/scan-duplicate-notifications${q}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateScanData(data);
      } else {
        setDuplicateScanData(prev => prev || { status: 'error', month, total_instances: 0, total_inflated_count: 0, instances: [] });
      }
    } catch (e) {
      console.error("Duplicate scan fetch failed", e);
      setDuplicateScanData(prev => prev || { status: 'error', month, total_instances: 0, total_inflated_count: 0, instances: [] });
    } finally {
      setDuplicateScanLoading(false);
    }
  };

  const fetchDirectory = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/staff-directory`);
      const data = await res.json();
      if (data.status === 'success') {
        setStaffDirectory(data.data);
      }
    } catch (e) {
      console.error("Failed to fetch staff directory", e);
    }
  };

  const loadTargets = async (dist = 'All', monthVal = null) => {
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const targetMonth = monthVal || targetModalMonth || month || new Date().toISOString().slice(0, 7);
          let q = `?month=${targetMonth}`;
          if (dist && dist !== 'All') {
            q += `&district=${encodeURIComponent(dist)}`;
          }
          if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
            q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
          }
          const res = await fetch(`${API_BASE_URL}/get-targets${q}`);
          const data = await res.json();
          if(data.success) {
              setTargetsData(data.targets);
          }
      } catch(err) {
          console.error("loadTargets error", err);
      }
  };

  const handleTargetChange = (district, fo_name, value) => {
      setTargetsData(prev => {
          const exists = prev.find(t => t.fo_name === fo_name && t.district === district);
          if (exists) {
              return prev.map(t => (t.fo_name === fo_name && t.district === district) ? { ...t, target: Number(value) } : t);
          } else {
              return [...prev, { fo_name, district, target: Number(value) }];
          }
      });
  };

  const saveAllTargets = async () => {
      setIsSavingTargets(true);
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const targetMonth = targetModalMonth || month || new Date().toISOString().slice(0, 7);
          const isSubAdmin = currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All');
          for (let t of targetsData) {
              if (t.fo_name && t.district) {
                  if (isSubAdmin && !currentUser.allowed_districts.includes(t.district)) {
                    continue;
                  }
                  await authFetch(API_BASE_URL + "/update-target", {
                      method: "POST", headers:{"Content-Type":"application/json"},
                      body: JSON.stringify({ 
                          fo_name: t.fo_name, 
                          district: t.district, 
                          target: Number(t.target) || 0,
                          month: targetMonth
                      })
                  });
              }
          }
          alert(`Targets for ${targetMonth} saved successfully!`);
          setShowTargetModal(false);
          loadTargets('All', month);
      } catch(err) {
          console.error(err);
          alert("Error saving targets");
      } finally {
          setIsSavingTargets(false);
      }
  };


  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const cleanUser = (loginUsername || 'admin').trim().toLowerCase();
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/auth/user-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUser, password })
      });
      if (res.ok) {
        const data = await res.json();
        const userObj = data.user || {
          username: cleanUser,
          name: cleanUser === 'admin' ? 'Super Admin' : cleanUser,
          role: cleanUser === 'admin' ? 'SUPER_ADMIN' : 'SUB_ADMIN',
          allowed_districts: ['All'],
          permissions: { can_edit_targets: true, can_manage_staff: true, can_edit_patient_ids: true, can_export_reports: true }
        };
        setCurrentUser(userObj);
        setIsAuthenticated(true);
        try {
          localStorage.setItem('dfy_admin_user', JSON.stringify(userObj));
          localStorage.setItem('dfy_admin_auth', 'true');
        if (data.token) localStorage.setItem('dfy_admin_token', data.token);
        } catch (e) {}

        if (userObj.role === 'SUB_ADMIN' && userObj.allowed_districts && !userObj.allowed_districts.includes('All')) {
          setSelectedDistrict(userObj.allowed_districts[0] || 'All');
        }

        fetchData();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || 'Invalid username or password.');
      }
    } catch (err) {
      setError('Login failed. Please check credentials or network connection.');
    }
  };

  const fetchAdminUsers = async () => {
    setLoadingAdminUsers(true);
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
      setLoadingAdminUsers(false);
    }
  };

  const saveAdminUser = async (e) => {
    e.preventDefault();
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
      if (!res.ok) {
        throw new Error(data.detail || "Failed to save user");
      }
      setUserFormModal(null);
      fetchAdminUsers();
      alert(userFormModal.mode === 'create' ? "New Admin User created successfully!" : "Admin User updated successfully!");
    } catch (err) {
      setUserFormModal(prev => ({ ...prev, error: err.message, loading: false }));
    }
  };

  const deleteAdminUser = async (userId) => {
    if (!window.confirm(`Are you sure you want to delete admin user "${userId}"?`)) return;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/users/delete?user_id=${encodeURIComponent(userId)}`, {
        method: "POST"
      });
      if (res.ok) {
        fetchAdminUsers();
        alert(`User ${userId} deleted successfully.`);
      } else {
        const d = await res.json();
        alert(d.detail || "Error deleting user.");
      }
    } catch (err) {
      alert("Network error while deleting user.");
    }
  };

  const fetchAuditLogs = async (overrideAction, overrideDist, overrideUser, overrideSearch) => {
    setLoadingAuditLogs(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/audit-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: overrideAction !== undefined ? overrideAction : auditFilterAction,
          district: overrideDist !== undefined ? overrideDist : auditFilterDistrict,
          user_id: overrideUser !== undefined ? overrideUser : auditFilterUser,
          search: overrideSearch !== undefined ? overrideSearch : auditSearchQuery,
          limit: 300
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogsList(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const exportAuditLogsExcel = () => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    window.open(`${API_BASE_URL}/admin/export-audit-logs?action_type=${auditFilterAction}&district=${auditFilterDistrict}&user_id=${auditFilterUser}&token=${getAdminToken()}`, '_blank');
  };

  const handleManualPruneAuditLogs = async () => {
    if (!window.confirm("Are you sure you want to prune audit logs older than 30 days? Records older than 30 days will be permanently purged from the database.")) {
      return;
    }
    setIsPruningAudit(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/audit-logs/prune?days=30`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message || `Pruned ${data.deleted_count} logs older than 30 days.`);
        fetchAuditLogs();
      } else {
        alert("Failed to prune audit logs.");
      }
    } catch (e) {
      alert("Network error while pruning audit logs.");
    } finally {
      setIsPruningAudit(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
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
        setPassword(changeNewPw);
        setSecurityStatusMsg('✓ Password updated successfully!');
        setChangeCurrentPw('');
        setChangeNewPw('');
      } else {
        setSecurityStatusMsg(`Error: ${data.detail || 'Failed to update'}`);
      }
    } catch (err) {
      setSecurityStatusMsg('Failed to connect to server.');
    } finally {
      setIsSavingSecurity(false);
    }
  };






  const fetchCascadeAlerts = async () => {
    try {
      setLoadingCascade(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}&district=${cascadeFilterDist}`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/api/reports/cascade-alerts${q}`);
      if (res.ok) {
        const json = await res.json();
        setCascadeData(json.data || { summary: {}, alerts: [] });
      }
    } catch (e) {
      console.error("Failed to fetch cascade alerts", e);
    } finally {
      setLoadingCascade(false);
    }
  };

  const fetchStaffList = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const params = new URLSearchParams();
      params.append("status_filter", "all");
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        params.append("districts", currentUser.allowed_districts.join(','));
      }
      const res = await authFetch(`${API_BASE_URL}/admin/staff/list?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.staff || []);
      }
    } catch (e) {
      console.error("Failed to fetch staff list", e);
    }
  };

  const handleExecuteUpdatePin = async (e) => {
    e.preventDefault();
    if (!pinChangeModal) return;
    const { name, district, newPin, designation } = pinChangeModal;
    if (!newPin || newPin.trim().length !== 4 || !/^\d+$/.test(newPin.trim())) {
      setPinChangeModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits (numbers only)." }));
      return;
    }
    setPinChangeModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/update-details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          name,
          new_pin: newPin.trim(),
          designation: designation || "Field Officer"
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStaffList(prev => prev.map(s => (s.name === name && s.district === district ? {
          ...s,
          pin: newPin.trim(),
          designation: designation || s.designation
        } : s)));
        fetchDirectory();
        setPinChangeModal(null);
      } else {
        setPinChangeModal(prev => ({ ...prev, error: data.detail || "Failed to update staff details.", loading: false }));
      }
    } catch (err) {
      setPinChangeModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleExecuteAddStaff = async (e) => {
    e.preventDefault();
    if (!addStaffModal) return;
    const { district, name, pin, designation, target } = addStaffModal;
    if (!name || !name.trim()) {
      setAddStaffModal(prev => ({ ...prev, error: "Please enter Officer Name." }));
      return;
    }
    if (!pin || pin.trim().length !== 4 || !/^\d+$/.test(pin.trim())) {
      setAddStaffModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits." }));
      return;
    }
    setAddStaffModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: district || 'Jamui',
          name: name.trim(),
          pin: pin.trim(),
          designation: designation || 'Field Officer',
          target: Number(target) || 50
        })
      });
      const data = await res.json();
      if (res.ok) {
        fetchStaffList();
        fetchDirectory();
        fetchAttendance(true);
        setAddStaffModal(null);
      } else {
        setAddStaffModal(prev => ({ ...prev, error: data.detail || "Failed to add officer.", loading: false }));
      }
    } catch (err) {
      setAddStaffModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleExecuteDeleteStaff = async (e) => {
    e.preventDefault();
    if (!deleteStaffModal) return;
    const { name, district } = deleteStaffModal;
    setDeleteStaffModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/staff/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, name })
      });
      const data = await res.json();
      if (res.ok) {
        setStaffList(prev => prev.filter(s => !(s.name === name && s.district === district)));
        fetchDirectory();
        fetchAttendance(true);
        setDeleteStaffModal(null);
      } else {
        setDeleteStaffModal(prev => ({ ...prev, error: data.detail || "Failed to delete.", loading: false }));
      }
    } catch (err) {
      setDeleteStaffModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  const handleExecuteToggleStaffStatus = async (e) => {
    if (e) e.preventDefault();
    if (!staffToggleModal || !staffToggleModal.officer) return;
    const { officer, targetStatus, effectiveDate } = staffToggleModal;

    if (!canManageStaff) {
      setStaffToggleModal(prev => ({ ...prev, error: "Permission denied. You do not have staff management permissions." }));
      return;
    }

    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      const targetDist = canonicalizeDistrict(officer.district || '').toLowerCase();
      if (!allowed.includes(targetDist)) {
        setStaffToggleModal(prev => ({ ...prev, error: `Permission denied. You cannot manage staff in district '${officer.district}'.` }));
        return;
      }
    }

    setIsTogglingStaff(true);
    setStaffToggleModal(prev => ({ ...prev, error: "" }));

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const effDate = targetStatus === 'inactive' ? (effectiveDate || new Date().toISOString().slice(0, 10)) : undefined;
      const payload = {
        district: officer.district,
        fo_name: officer.name,
        status: targetStatus,
        ...(effDate ? { effective_date: effDate } : {})
      };

      const res = await authFetch(`${API_BASE_URL}/admin/staff/toggle-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        // Optimistically update staffList
        const resolvedInactiveSince = targetStatus === 'inactive' ? (effDate || new Date().toISOString().slice(0, 10)) : null;
        setStaffList(prev => prev.map(s => {
          const isMatch = (s.id && officer.id && s.id === officer.id) || (s.name === officer.name && s.district === officer.district);
          if (isMatch) {
            return {
              ...s,
              is_active: targetStatus === 'active',
              status: targetStatus,
              inactive_since: resolvedInactiveSince
            };
          }
          return s;
        }));

        fetchDirectory();
        fetchAttendance(true);
        setStaffToggleModal(null);
        showToast(
          targetStatus === 'inactive'
            ? `Officer ${officer.name} marked as Inactive.`
            : `Officer ${officer.name} reactivated successfully!`,
          'success'
        );
      } else {
        setStaffToggleModal(prev => ({ ...prev, error: data.detail || "Failed to update staff status." }));
      }
    } catch (err) {
      setStaffToggleModal(prev => ({ ...prev, error: "Network error. Please try again." }));
    } finally {
      setIsTogglingStaff(false);
    }
  };

  const handleAdminExecuteIdEdit = async (e) => {
    e.preventDefault();
    if (!adminEditModal) return;
    const { fo_name, district, date, category, action, oldId, newId } = adminEditModal;

    if (action !== 'delete' && (!newId || newId.trim().length !== 9 || !/^\d+$/.test(newId.trim()))) {
      setAdminEditModal(prev => ({ ...prev, error: "Patient ID must be exactly 9 digits (numbers only)." }));
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
          fo_name: fo_name,
          date: date,
          category: category,
          action: action,
          old_id: oldId,
          new_id: newId ? newId.trim() : "",
          edited_by: "Admin"
        })
      });
      const data = await res.json();
      if (res.ok) {
        // Update rawRecords in memory
        setRawRecords(prev => prev.map(rec => {
          if (rec.fo_name === fo_name && rec.working_place === district && rec.date === date) {
            const updatedRec = { ...rec };
            updatedRec[category] = data.updated_ids;
            // update scalar count
            const countKey = category.replace('_ids', '');
            if (updatedRec[countKey] !== undefined) {
              updatedRec[countKey] = data.updated_ids.length;
            }
            if (countKey === 'notification') {
              updatedRec.notifications = data.updated_ids.length;
            }
            return updatedRec;
          }
          return rec;
        }));

        try { localStorage.removeItem(`dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`); } catch (e) {}
        if (showDuplicateModal) {
          fetchDuplicateAudit();
          fetchDuplicateScan(true);
        }
        setAdminEditModal(null);
      } else {
        setAdminEditModal(prev => ({ ...prev, error: data.detail || "Failed to update ID.", loading: false }));
      }
    } catch (err) {
      setAdminEditModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
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
      const data = await res.json();
      if (res.ok) {
        // Optimistic State Update: remove record from rawRecords in memory
        setRawRecords(prev => prev.filter(r => {
          const matchFo = (r.fo_name || '').trim().toLowerCase() === fo_name.trim().toLowerCase();
          const matchDist = canonicalizeDistrict(r.working_place || '') === canonicalizeDistrict(district);
          const matchDate = (r.date_of_reporting || r.date) === date;
          return !(matchFo && matchDist && matchDate);
        }));

        setDeleteDayModal(null);
        showToast(`✓ Date ${date} report for ${fo_name} successfully deleted.`, "success");
        try { localStorage.removeItem(`dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`); } catch (e) {}
        if (showDuplicateModal) {
          fetchDuplicateAudit();
          fetchDuplicateScan(true);
        }
        fetchAttendance();
      } else {
        setDeleteDayModal(prev => ({ ...prev, error: data.detail || "Failed to delete day report.", loading: false }));
      }
    } catch (err) {
      setDeleteDayModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
    }
  };

  const handleOpenEditDay = (rec) => {
    const foDist = rec.working_place || inspectingFO?.district || (selectedDistrict !== 'All' ? selectedDistrict : '');
    const foName = inspectingFO?.fo_name || rec.fo_name || '';
    const dateStr = rec.date || rec.date_of_reporting || '';

    const initialInputs = {};
    feedCategoriesConfig.forEach(cat => {
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
      loading: false,
      error: ''
    });
  };

  const handleExecuteEditDay = async (e) => {
    if (e) e.preventDefault();
    if (!editDayModal) return;
    setEditDayModal(prev => ({ ...prev, loading: true, error: "" }));

    try {
      const { district, fo_name, date, morning_km, evening_km, travel_expenses, visited_names, remark, category_inputs } = editDayModal;
      
      const category_ids = {};
      Object.keys(category_inputs || {}).forEach(catKey => {
        const raw = category_inputs[catKey] || '';
        const is8or9 = (catKey === 'fdc_provided_ids' || catKey === 'outcome_assigned_ids');
        const parsed = raw
          .split(/[\n,]+/)
          .map(s => s.trim())
          .filter(s => {
            const validLen = is8or9 ? (s.length === 8 || s.length === 9) : (s.length === 9);
            return validLen && /^\d+$/.test(s);
          });
        category_ids[catKey] = Array.from(new Set(parsed));
      });

      const cleanVisited = visited_names 
        ? visited_names.split(',').map(s => s.trim()).filter(Boolean)
        : [];

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

      const data = await res.json();
      if (res.ok) {
        // Optimistic State Update in rawRecords
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
              total_km: Number(travel_expenses) || 0,
              visited_names: cleanVisited,
              doctor_store_visits_count: cleanVisited.length,
              remark: remark || '',
              ...category_ids
            };
          }
          return r;
        }));

        setEditDayModal(null);
        showToast(`✓ Date ${date} report for ${fo_name} updated successfully!`, "success");
        try { localStorage.removeItem(`dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`); } catch (e) {}
        if (showDuplicateModal) {
          fetchDuplicateAudit();
          fetchDuplicateScan(true);
        }
        fetchAttendance();
      } else {
        setEditDayModal(prev => ({ ...prev, error: data.detail || "Failed to update day report.", loading: false }));
      }
    } catch (err) {
      setEditDayModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
    }
  };

  const fetchRecentIdEdits = async () => {
    setRecentIdEditsLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/reports/recent-id-edits?days=7`);
      if (res.ok) {
        const data = await res.json();
        setRecentIdEdits(data.edits || []);
      }
    } catch (err) {
      console.error("Failed to fetch recent ID edits", err);
    } finally {
      setRecentIdEditsLoading(false);
    }
  };


  const fetchData = async (forceRefresh = false, silent = false) => {
    const cacheKey = `dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`;
    let cachedData = null;
    if (!forceRefresh) {
      try {
        const rawCache = localStorage.getItem(cacheKey);
        if (rawCache) cachedData = JSON.parse(rawCache);
      } catch (e) {
        cachedData = null;
      }
    }

    // Zero-lag instant render: show cached records immediately if available
    if (cachedData && Array.isArray(cachedData.records) && cachedData.records.length > 0 && !forceRefresh) {
      setRawRecords(cachedData.records);
      if (cachedData.synced_at) setLastSyncedTime(cachedData.synced_at);
      if (!silent) setIsLoading(false);
      setSyncStatus('UP_TO_DATE');
    } else {
      if (!silent) setIsLoading(true);
    }

    if (!silent) setError('');

    let coldTimer = null;
    if (!silent) {
      coldTimer = setTimeout(() => {
        setIsColdStarting(true);
      }, 5000);
    }

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const payload = { month_prefix: month, force_refresh: Boolean(forceRefresh) };

      if (!forceRefresh && cachedData && cachedData.synced_at && cachedData.records?.length > 0) {
        payload.since = cachedData.synced_at;
        payload.cached_count = cachedData.records.length;
      }

      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        payload.districts = currentUser.allowed_districts.join(',');
      }

      setSyncStatus('SYNCING');
      const res = await authFetch(`${API_BASE_URL}/admin/dashboard-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server responded with status ${res.status}`);
      }
      const data = await res.json();
      lastFocusSyncRef.current = Date.now();

      if (data.mode === 'NO_CHANGE') {
        // Data has not changed since last sync! 0 Firestore reads!
        setSyncStatus('UP_TO_DATE');
        if (data.synced_at) setLastSyncedTime(data.synced_at);
      } else if (data.mode === 'DELTA') {
        setRawRecords(prev => {
          const currentList = (prev && prev.length > 0) ? prev : (cachedData?.records || []);
          const map = new Map(currentList.map(r => [r.id || r.doc_id, r]));
          
          // 1. Remove deleted tombstones
          if (Array.isArray(data.deleted_ids)) {
            data.deleted_ids.forEach(delId => map.delete(delId));
          }
          // 2. Upsert newly modified / added records
          if (Array.isArray(data.records)) {
            data.records.forEach(newRec => {
              const id = newRec.id || newRec.doc_id;
              if (id) map.set(id, newRec);
            });
          }
          const updated = Array.from(map.values());
          const fallbackStamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
          const syncStamp = data.synced_at || fallbackStamp;
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              synced_at: syncStamp,
              records: updated
            }));
          } catch (storageErr) {
            console.warn("Storage quota full, continuing with in-memory state:", storageErr);
          }
          return updated;
        });
        const fallbackStamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const syncStamp = data.synced_at || fallbackStamp;
        setLastSyncedTime(syncStamp);
        setSyncStatus('LIVE');
      } else {
        // Mode FULL
        const newRecords = Array.isArray(data.records) ? data.records : [];
        setRawRecords(newRecords);
        const fallbackStamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const syncStamp = data.synced_at || fallbackStamp;
        setLastSyncedTime(syncStamp);
        setSyncStatus('LIVE');
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            synced_at: syncStamp,
            records: newRecords
          }));
        } catch (storageErr) {
          console.warn("Storage quota full, continuing with in-memory state:", storageErr);
        }
      }

      if (forceRefresh) {
        if (currentUser?.role !== 'SUB_ADMIN') {
          setSelectedDistrict('All');
        }
        setSelectedFO('All');
      }
      return true;
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      if (!silent) {
        // Resilient fallback: If offline/network glitch and cachedData exists, keep displaying it
        if (cachedData && Array.isArray(cachedData.records) && cachedData.records.length > 0) {
          setRawRecords(cachedData.records);
          setError('Offline notice: Showing previously synchronized data.');
        } else {
          setError(err.message || 'Failed to load dashboard data. Ensure backend is running.');
        }
      }
      return false;
    } finally {
      if (coldTimer) clearTimeout(coldTimer);
      setIsColdStarting(false);
      if (!silent) setIsLoading(false);
    }
  };

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
        showToast(`✓ Removed ${removed} duplicate notification ID(s) & updated district rollups!`, 'success');
        try { localStorage.removeItem(`dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`); } catch (e) {}
        await Promise.all([
          fetchDuplicateScan(true),
          fetchDuplicateAudit(),
          fetchData(true)
        ]);
      } else {
        showToast(data.detail || "Failed to repair duplicate notifications.", "error");
      }
    } catch (err) {
      console.error("Repair duplicate failed", err);
      showToast("Network error occurred during repair. Please try again.", "error");
    } finally {
      setRepairingDocId(null);
    }
  };

  const fetchTopPerformers = useCallback(async (period = topPerformersPeriod) => {
    try {
      setLoadingTopPerformers(true);
      const token = localStorage.getItem('dfy_token');
      const res = await fetch(`${API_BASE_URL}/api/statewide-top-performers?month=${month}&period=${period}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success) {
          setTopPerformersData(json);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch statewide top performers:', err);
    } finally {
      setLoadingTopPerformers(false);
    }
  }, [month, topPerformersPeriod]);

  const generateTopPerformersPosterCanvas = useCallback(() => {
    const canvas = topPerformersCanvasRef.current;
    if (!canvas || !topPerformersData) return;
    const ctx = canvas.getContext('2d');
    const width = 1200;
    const height = 1350;
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

    // Top Header Banner
    ctx.fillStyle = '#14b8a6';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DOCTORS FOR YOU • BIHAR TB ELIMINATION MISSION', width / 2, 70);

    // Main Title
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 46px system-ui, -apple-system, sans-serif';
    ctx.fillText('🏆 STATEWIDE TOP PERFORMERS', width / 2, 130);

    // Period Pill
    const periodLabel = topPerformersPeriod === 'weekly' 
      ? '📅 WEEKLY SPRINT (LAST 7 DAYS)' 
      : topPerformersPeriod === 'fortnightly' 
      ? '📅 15-DAY PERFORMANCE DRIVE' 
      : `📅 MONTHLY LEADERBOARD (${month})`;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    const pillWidth = 420;
    ctx.beginPath();
    ctx.roundRect((width - pillWidth) / 2, 155, pillWidth, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(periodLabel, width / 2, 181);

    // Two Columns Bento Panels
    const colWidth = 520;
    const colHeight = 960;
    const leftX = 60;
    const rightX = 620;
    const topY = 230;

    const drawPanel = (x, y, w, h, title, subtitle, icon, headerColor) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 24);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = headerColor;
      ctx.font = '900 24px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${icon} ${title}`, x + 25, y + 45);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(subtitle, x + 25, y + 70);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 88);
      ctx.lineTo(x + w - 20, y + 88);
      ctx.stroke();
    };

    drawPanel(leftX, topY, colWidth, colHeight, 'TOP 5 DISTRICTS', 'Statewide Target Achievement & Volume', '🏛️', '#38bdf8');
    drawPanel(rightX, topY, colWidth, colHeight, 'TOP 5 FIELD OFFICERS', 'Frontline Clinical Notifications', '👤', '#a78bfa');

    const medals = ['🥇', '🥈', '🥉', '4', '5'];
    const rankColors = ['#f59e0b', '#94a3b8', '#d97706', '#64748b', '#64748b'];

    // Draw Top 5 Districts
    const districts = topPerformersData.top_districts || [];
    districts.forEach((d, idx) => {
      const itemY = topY + 105 + (idx * 165);
      ctx.fillStyle = idx === 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = idx === 0 ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(leftX + 20, itemY, colWidth - 40, 145, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = idx < 3 ? '32px system-ui' : 'bold 24px system-ui';
      ctx.fillStyle = rankColors[idx];
      ctx.textAlign = 'center';
      ctx.fillText(medals[idx], leftX + 55, itemY + (idx < 3 ? 50 : 45));

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(d.district, leftX + 95, itemY + 45);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 28px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${d.notifications}`, leftX + 95, itemY + 85);
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(' Notifications', leftX + 95 + ctx.measureText(`${d.notifications}`).width + 8, itemY + 83);

      const pctText = `${d.percentage}% Target`;
      ctx.fillStyle = d.percentage >= 100 ? '#10b981' : '#f59e0b';
      ctx.font = 'bold 15px system-ui, -apple-system, sans-serif';
      ctx.fillText(pctText, leftX + 95, itemY + 118);
    });

    // Draw Top 5 Staff
    const staff = topPerformersData.top_staff || [];
    staff.forEach((s, idx) => {
      const itemY = topY + 105 + (idx * 165);
      ctx.fillStyle = idx === 0 ? 'rgba(167, 139, 250, 0.15)' : 'rgba(255, 255, 255, 0.04)';
      ctx.strokeStyle = idx === 0 ? 'rgba(167, 139, 250, 0.45)' : 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(rightX + 20, itemY, colWidth - 40, 145, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = idx < 3 ? '32px system-ui' : 'bold 24px system-ui';
      ctx.fillStyle = rankColors[idx];
      ctx.textAlign = 'center';
      ctx.fillText(medals[idx], rightX + 55, itemY + (idx < 3 ? 50 : 45));

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 23px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.fo_name, rightX + 95, itemY + 45);

      ctx.fillStyle = '#a78bfa';
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.fillText(`📍 ${s.district}`, rightX + 95, itemY + 75);

      ctx.fillStyle = '#34d399';
      ctx.font = '900 26px system-ui, -apple-system, sans-serif';
      ctx.fillText(`${s.notifications}`, rightX + 95, itemY + 115);
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(' Notifs Achieved', rightX + 95 + ctx.measureText(`${s.notifications}`).width + 8, itemY + 113);
    });

    // Footer
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
    ctx.textAlign = 'center';
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Generated on ${nowStr} (IST) • Doctors For You State Monitoring Operations`, width / 2, 1300);
  }, [topPerformersData, topPerformersPeriod, month]);

  const handleDownloadTopPerformersPoster = useCallback(() => {
    try {
      generateTopPerformersPosterCanvas();
      const canvas = topPerformersCanvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `DFY_Top_Performers_${topPerformersPeriod}_${month}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('✓ Poster downloaded successfully!', 'success');
    } catch (err) {
      console.error('Download poster failed', err);
      showToast('Failed to download poster', 'error');
    }
  }, [generateTopPerformersPosterCanvas, topPerformersPeriod, month, showToast]);

  const handleShareTopPerformersWhatsApp = useCallback(() => {
    const periodName = topPerformersPeriod === 'weekly' ? 'Weekly Sprint (Last 7 Days)' : topPerformersPeriod === 'fortnightly' ? '15-Day Drive' : `Monthly (${month})`;
    let text = `*🏆 DOCTORS FOR YOU — BIHAR TB MISSION*\n`;
    text += `*🌟 TOP PERFORMERS LEADERBOARD (${periodName})*\n\n`;

    text += `*🏛️ TOP 5 DISTRICTS:*\n`;
    (topPerformersData?.top_districts || []).slice(0, 5).forEach((d, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} *${d.district}*: ${d.notifications} Notifs (${d.percentage}% Target)\n`;
    });

    text += `\n*👤 TOP 5 FIELD OFFICERS:*\n`;
    (topPerformersData?.top_staff || []).slice(0, 5).forEach((s, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      text += `${medal} *${s.fo_name}* (${s.district}): ${s.notifications} Notifs\n`;
    });

    text += `\n_Congratulations to all top performers for leading Bihar's TB elimination drive! 🏥_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }, [topPerformersData, topPerformersPeriod, month]);

  useEffect(() => {
    if (isAuthenticated) { 
      fetchData(false); 
      fetchAttendance(); 
      fetchDirectory(); 
      loadTargets('All'); 
      fetchStaffList(); 
      fetchActiveBroadcasts();
      fetchPacingSettings(month, selectedDistrict);
      fetchTopPerformers(topPerformersPeriod);
    }
  }, [month, selectedDistrict, isAuthenticated, topPerformersPeriod, fetchTopPerformers]);

  // Lazy Tab Loading: Fetch Duplicate Audit & Duplicate Scan when modal is opened
  useEffect(() => {
    if (showDuplicateModal) {
      fetchDuplicateAudit();
      fetchDuplicateScan();
    }
  }, [showDuplicateModal, month]);

  // Fetch scan data when user switches tab to 'repair'
  useEffect(() => {
    if (showDuplicateModal && duplicateRadarTab === 'repair' && !duplicateScanData) {
      fetchDuplicateScan();
    }
  }, [showDuplicateModal, duplicateRadarTab]);

  // Background Silent Auto-Sync & Tab-Focus Sync (0-read delta polling)
  useEffect(() => {
    if (!isAuthenticated) return;

    // 1. Silent interval every 45 seconds
    const intervalId = setInterval(() => {
      fetchData(false, true); // forceRefresh = false, silent = true
    }, 45000);

    // 2. Tab focus listener: delta sync if last sync was > 30s ago
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusSyncRef.current > 30000) {
        lastFocusSyncRef.current = now;
        fetchData(false, true);
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, month]);

  // Derived Filter Lists (Filtered by RBAC for Sub-Admins)
  const districts = useMemo(() => {
    const rawSet = new Set([
      ...DEFAULT_BIHAR_DISTRICTS,
      ...Object.keys(staffDirectory || {}).map(canonicalizeDistrict),
      ...rawRecords.map(r => canonicalizeDistrict(r.working_place))
    ]);
    const allList = Array.from(rawSet).filter(d => DEFAULT_BIHAR_DISTRICTS.includes(d)).sort();
    if (!currentUser || currentUser.role === 'SUPER_ADMIN' || !currentUser.allowed_districts || currentUser.allowed_districts.includes('All')) {
      return ['All', ...allList];
    }
    const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
    const filtered = allList.filter(d => userAllowed.includes(d));
    const permittedOnly = filtered.length > 0 ? filtered : userAllowed.filter(d => d !== 'All');
    return permittedOnly.length > 0 ? permittedOnly : (allList.length > 0 ? [allList[0]] : ['Jamui']);
  }, [staffDirectory, rawRecords, currentUser]);

  const targetModalDistricts = useMemo(() => {
    const rawSet = new Set([
      ...DEFAULT_BIHAR_DISTRICTS,
      ...Object.keys(staffDirectory || {}).map(canonicalizeDistrict)
    ]);
    const allDists = Array.from(rawSet).filter(d => DEFAULT_BIHAR_DISTRICTS.includes(d)).sort();
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
      return allDists.filter(d => userAllowed.includes(d));
    }
    return allDists;
  }, [staffDirectory, currentUser]);

  // Synchronize Report Studio & Comparator dropdowns when districts change
  useEffect(() => {
    const validDists = districts.filter(d => d !== 'All');
    if (validDists.length > 0) {
      if (!reportsDistrict || !validDists.includes(reportsDistrict)) {
        setReportsDistrict(validDists[0]);
      }
      if (!compareDistA || !validDists.includes(compareDistA)) {
        setCompareDistA(validDists[0]);
      }
      if (!compareDistB || !validDists.includes(compareDistB)) {
        setCompareDistB(validDists.length > 1 ? validDists[1] : validDists[0]);
      }
    }
  }, [districts]);

  const availableKpiDistricts = useMemo(() => {
    const all = (districts || []).filter(d => d !== 'All');
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowedSet = new Set(currentUser.allowed_districts.map(canonicalizeDistrict));
      return all.filter(d => allowedSet.has(canonicalizeDistrict(d)));
    }
    return all;
  }, [districts, currentUser]);

  const handleToggleKpiDistrict = (dist) => {
    setSelectedKpiDistricts(prev => {
      if (prev.includes(dist)) {
        return prev.filter(d => d !== dist);
      } else {
        return [...prev, dist];
      }
    });
  };

  const handleSelectAllKpiDistricts = () => {
    setSelectedKpiDistricts([...availableKpiDistricts]);
  };

  const handleClearKpiDistricts = () => {
    setSelectedKpiDistricts([]);
  };

  const handleDownloadKpi = () => {
    if (isDownloadingKpi) return;
    const validPermitted = (districts || []).filter(d => d !== 'All');
    const fallback = validPermitted.length > 0 ? validPermitted[0] : '';
    const targetDist = (reportsDistrict && reportsDistrict !== 'All') 
      ? reportsDistrict 
      : (selectedDistrict !== 'All' ? selectedDistrict : fallback);
    if (!targetDist) {
      alert("Please select a district to download.");
      return;
    }
    setIsDownloadingKpi(true);
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    window.open(`${API_BASE_URL}/download-kpi-workbook?district=${encodeURIComponent(targetDist)}&month=${month}&token=${getAdminToken()}`, "_blank");
    setTimeout(() => setIsDownloadingKpi(false), 3000);
  };

  const handleToggleMedDistrict = (dist) => {
    setSelectedMedDistricts(prev => {
      if (prev.includes(dist)) {
        return prev.filter(d => d !== dist);
      } else {
        return [...prev, dist];
      }
    });
  };

  const handleSelectAllMedDistricts = () => {
    setSelectedMedDistricts([...availableKpiDistricts]);
  };

  const handleClearMedDistricts = () => {
    setSelectedMedDistricts([]);
  };

  const availableAttendanceDistricts = availableKpiDistricts;

  const handleToggleAttendanceDistrict = (dist) => {
    setSelectedAttendanceDistricts(prev => {
      if (prev.includes(dist)) {
        return prev.filter(d => d !== dist);
      } else {
        return [...prev, dist];
      }
    });
  };

  const handleSelectAllAttendanceDistricts = () => {
    setSelectedAttendanceDistricts([...availableAttendanceDistricts]);
  };

  const handleClearAttendanceDistricts = () => {
    setSelectedAttendanceDistricts([]);
  };

  const handleToggleNotifDistrict = (dist) => {
    setNotifTrayDistricts(prev => {
      const clean = prev.filter(d => d !== 'All');
      if (clean.includes(dist)) {
        return clean.filter(d => d !== dist);
      } else {
        return [...clean, dist];
      }
    });
  };

  const handleSelectAllNotifDistricts = () => {
    setNotifTrayDistricts([...availableKpiDistricts]);
  };

  const handleClearNotifDistricts = () => {
    setNotifTrayDistricts([]);
  };

  const handleDownloadMedicineReport = () => {
    if (isDownloadingMedicineReport) return;
    setIsDownloadingMedicineReport(true);
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    let url = `${API_BASE_URL}/admin/reports/medicine-consumption?month=${month}&token=${getAdminToken()}`;
    if (selectedMedDistricts.length > 0) {
      url += `&districts=${encodeURIComponent(selectedMedDistricts.join(','))}`;
    } else {
      const targetDist = selectedDistrict || 'All';
      url += `&district=${encodeURIComponent(targetDist)}`;
    }
    window.open(url, "_blank");
    setTimeout(() => setIsDownloadingMedicineReport(false), 3000);
  };

  const handleDownloadSequentialMedQueue = async () => {
    if (isDownloadingMedicineReport) return;
    const targetList = selectedMedDistricts.length > 0 ? selectedMedDistricts : availableKpiDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingMedicineReport(true);
    const total = targetList.length;
    setMedQueueProgress({
      current: 0,
      total,
      district: '',
      percent: 0,
      status: `Initializing medicine queue for ${total} district(s)...`
    });

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    for (let i = 0; i < total; i++) {
      const dist = targetList[i];
      setMedQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i) / total) * 100),
        status: `Generating Medicine Report for ${dist} (${i + 1}/${total})...`
      });

      try {
        const res = await authFetch(`${API_BASE_URL}/admin/reports/medicine-consumption?district=${encodeURIComponent(dist)}&month=${month}`);
        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `Medicine_Consumption_${dist}_${month}.xlsx`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
          link.remove();
        } else {
          console.error(`Failed to download medicine report for ${dist}`);
        }
      } catch (err) {
        console.error(`Error downloading medicine report for ${dist}:`, err);
      }

      setMedQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Completed ${dist} (${i + 1}/${total}) ✓`
      });

      // Intentional 1000ms pause between district files: Render CPU/RAM cooldown
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    showToast(`✓ All ${total} district medicine workbooks downloaded successfully!`, "success");
    setMedQueueProgress({
      current: total,
      total,
      district: '',
      percent: 100,
      status: `All ${total} district medicine workbooks downloaded successfully!`
    });

    setTimeout(() => {
      setMedQueueProgress(null);
      setIsDownloadingMedicineReport(false);
    }, 2500);
  };

  const handleDownloadScopedZip = () => {
    if (isDownloadingKpi) return;
    const targetList = selectedKpiDistricts.length > 0 ? selectedKpiDistricts : availableKpiDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingKpi(true);
    showToast(`📦 Preparing Scoped ZIP bundle for ${targetList.length} district(s)...`, "info");

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    const distParam = `&districts=${encodeURIComponent(targetList.join(','))}`;
    window.open(`${API_BASE_URL}/download-all-kpi-workbooks?month=${month}${distParam}&token=${getAdminToken()}`, "_blank");

    setTimeout(() => {
      setIsDownloadingKpi(false);
    }, 4000);
  };

  const handleDownloadSequentialQueue = async () => {
    if (isDownloadingKpi) return;
    const targetList = selectedKpiDistricts.length > 0 ? selectedKpiDistricts : availableKpiDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingKpi(true);
    const total = targetList.length;
    setKpiQueueProgress({
      current: 0,
      total,
      district: '',
      percent: 0,
      status: `Initializing queue for ${total} district(s)...`
    });

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    for (let i = 0; i < total; i++) {
      const dist = targetList[i];
      setKpiQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i) / total) * 100),
        status: `Generating Excel for ${dist} (${i + 1}/${total})...`
      });

      try {
        const res = await authFetch(`${API_BASE_URL}/download-kpi-workbook?district=${encodeURIComponent(dist)}&month=${month}`);
        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `KPI_Report_${dist}_${month}.xlsx`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
          link.remove();
        } else {
          console.error(`Failed to download KPI for ${dist}`);
        }
      } catch (err) {
        console.error(`Error downloading ${dist}:`, err);
      }

      setKpiQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Completed ${dist} (${i + 1}/${total}) ✓`
      });

      // Intentional 1000ms pause between district files: Render CPU/RAM cooldown
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    showToast(`✓ All ${total} district workbooks downloaded successfully!`, "success");
    setKpiQueueProgress({
      current: total,
      total,
      district: '',
      percent: 100,
      status: `All ${total} district workbooks downloaded successfully!`
    });

    setTimeout(() => {
      setKpiQueueProgress(null);
      setIsDownloadingKpi(false);
    }, 2500);
  };

  const handleDownloadAttendanceSingleOrScoped = () => {
    if (isDownloadingAttendance) return;
    const targetList = selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts : availableAttendanceDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingAttendance(true);
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    if (targetList.length === 1) {
      const dist = targetList[0];
      showToast(`📋 Preparing Staff Attendance workbook for ${dist}...`, "info");
      window.open(`${API_BASE_URL}/admin/export-staff-attendance?month=${month}&district=${encodeURIComponent(dist)}&token=${getAdminToken()}`, "_blank");
    } else {
      showToast(`📋 Preparing Scoped Staff Attendance workbook for ${targetList.length} district(s)...`, "info");
      const distParam = `&districts=${encodeURIComponent(targetList.join(','))}`;
      window.open(`${API_BASE_URL}/admin/export-staff-attendance?month=${month}${distParam}&token=${getAdminToken()}`, "_blank");
    }

    setTimeout(() => {
      setIsDownloadingAttendance(false);
    }, 4000);
  };

  const handleDownloadAttendanceScopedZip = handleDownloadAttendanceSingleOrScoped;

  const handleDownloadStaffAttendanceQueue = async () => {
    if (isDownloadingAttendance) return;
    const targetList = selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts : availableAttendanceDistricts;
    if (!targetList || targetList.length === 0) {
      showToast("Please select at least one district to download.", "error");
      return;
    }

    setIsDownloadingAttendance(true);
    const total = targetList.length;
    setAttendanceQueueProgress({
      current: 0,
      total,
      district: '',
      percent: 0,
      status: `Initializing staff attendance queue for ${total} district(s)...`
    });

    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";

    for (let i = 0; i < total; i++) {
      const dist = targetList[i];
      setAttendanceQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i) / total) * 100),
        status: `Generating Attendance Excel for ${dist} (${i + 1}/${total})...`
      });

      try {
        const res = await authFetch(`${API_BASE_URL}/admin/export-staff-attendance?month=${month}&district=${encodeURIComponent(dist)}`);
        if (res.ok) {
          const blob = await res.blob();
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = `DFY_Staff_Attendance_${dist}_${month}.xlsx`;
          document.body.appendChild(link);
          link.click();
          window.URL.revokeObjectURL(downloadUrl);
          link.remove();
        } else {
          console.error(`Failed to download staff attendance for ${dist}`);
        }
      } catch (err) {
        console.error(`Error downloading staff attendance for ${dist}:`, err);
      }

      setAttendanceQueueProgress({
        current: i + 1,
        total,
        district: dist,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Completed ${dist} (${i + 1}/${total}) ✓`
      });

      // Intentional 1000ms pause between district files: Render CPU/RAM cooldown
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    showToast(`✓ All ${total} district attendance workbooks downloaded successfully!`, "success");
    setAttendanceQueueProgress({
      current: total,
      total,
      district: '',
      percent: 100,
      status: `All ${total} district attendance workbooks downloaded successfully!`
    });

    setTimeout(() => {
      setAttendanceQueueProgress(null);
      setIsDownloadingAttendance(false);
    }, 2500);
  };


  const fos = useMemo(() => {
    let filtered = rawRecords;
    if (selectedDistrict !== 'All') {
      filtered = filtered.filter(r => canonicalizeDistrict(r.working_place) === selectedDistrict);
    }
    const names = Array.from(new Set(filtered.map(r => canonicalizeFo(r.fo_name, r.working_place, staffDirectory)))).filter(Boolean).sort();
    return ['All', ...names];
  }, [rawRecords, selectedDistrict, staffDirectory]);

  const isSubAdmin = currentUser?.role === 'SUB_ADMIN';

  const foComparisonData = useMemo(() => {
    if (!isSubAdmin) return [];
    const targetDist = selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts?.[0] || '');
    const distRecs = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === targetDist);
    const foMap = {};
    distRecs.forEach(r => {
      const fo = canonicalizeFo(r.fo_name, r.working_place, staffDirectory);
      if (!foMap[fo]) foMap[fo] = { fo_name: fo, notifications: 0, tests: 0, total_km: 0 };
      foMap[fo].notifications += (r.notifications || 0);
      foMap[fo].tests += (r.tests || 0);
      foMap[fo].total_km += (r.total_km || 0);
    });
    return Object.values(foMap).sort((a, b) => b.notifications - a.notifications);
  }, [isSubAdmin, selectedDistrict, currentUser, rawRecords, staffDirectory]);

const availableDistrictsForFeed = useMemo(() => {
    const allDists = Object.keys(staffDirectory).length > 0 
      ? Object.keys(staffDirectory).sort() 
      : (districts || []).filter(d => d !== 'All');
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      return allDists.filter(d => currentUser.allowed_districts.includes(d));
    }
    return allDists;
  }, [staffDirectory, districts, currentUser]);

  const availableFosForFeed = useMemo(() => {
    if (!feedDistrict) return [];
    const fromDir = staffDirectory[feedDistrict] || [];
    if (fromDir.length > 0) return fromDir;
    const fromRecs = Array.from(new Set(rawRecords.filter(r => r.working_place === feedDistrict).map(r => r.fo_name))).filter(Boolean).sort();
    return fromRecs;
  }, [staffDirectory, feedDistrict, rawRecords]);

  const handleAdminFeedSubmit = async (e) => {
    if (e) e.preventDefault();
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
      remark: feedRemarks ? feedRemarks.trim() : `Admin feed by ${currentUser?.name || currentUser?.username || 'Admin'}`
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
          if (tokenRegex.test(tok)) {
            validList.push(tok);
          } else {
            invalidTokens.push(tok);
          }
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
      setFeedError(`The following ${invalidTokens.length} item(s) are NOT valid numeric IDs (must be 8 or 9 digits for FDC/Outcome, 9 digits for others): ${invalidTokens.slice(0, 6).join(', ')}${invalidTokens.length > 6 ? '...' : ''}.`);
      return;
    }

    setFeedLoading(true);
    let feedSavedSuccessfully = false;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/feed-officer-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      let data = {};
      try {
        data = await res.json();
      } catch (jsonErr) {
        data = { detail: `Server responded with status ${res.status}: ${res.statusText || 'Unexpected server response'}` };
      }

      if (res.ok) {
        feedSavedSuccessfully = true;
        setFeedSuccess(`✓ Saved successfully for ${feedFoName} (${feedDistrict}) on ${feedDate}! Total ${totalIdsCount} Patient IDs processed.`);
        setFeedError('');
      } else {
        const errorMsg = typeof data?.detail === 'string'
          ? data.detail
          : Array.isArray(data?.detail)
            ? data.detail.map(d => (d.msg || JSON.stringify(d))).join(', ')
            : (data?.detail ? JSON.stringify(data.detail) : 'Failed to feed data.');
        setFeedError(errorMsg);
      }
    } catch (err) {
      console.error('[handleAdminFeedSubmit] Error connecting to backend:', err);
      const isFailedFetch = err?.name === 'TypeError' || String(err?.message || '').toLowerCase().includes('failed to fetch');
      setFeedError(
        isFailedFetch
          ? 'Network connection error: Unable to reach backend server. Please verify your internet or retry in a few moments.'
          : `Error saving data: ${err.message || 'Unknown network error'}`
      );
    } finally {
      setFeedLoading(false);
    }

    // Decoupled Background Refresh: Never let dashboard re-sync network lag mask a successful save
    if (feedSavedSuccessfully) {
      try {
        await fetchData(true);
      } catch (refreshErr) {
        console.warn('[handleAdminFeedSubmit] Background dashboard refresh notice:', refreshErr);
      }
    }
  };

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return rawRecords.filter(r => {
      const cDist = canonicalizeDistrict(r.working_place);
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
        if (!allowed.includes(cDist)) return false;
      }
      if (selectedDistrict !== 'All' && cDist !== selectedDistrict) return false;
      if (selectedFO !== 'All' && canonicalizeFo(r.fo_name, cDist, staffDirectory) !== selectedFO) return false;
      return true;
    });
  }, [rawRecords, selectedDistrict, selectedFO, currentUser, staffDirectory]);

  // Aggregations
  const aggregate = (records) => {
    const init = {
      total_km: 0, notifications: 0, tests: 0, presumptive: 0, doctor_visits: 0,
      hiv_dm: 0, dbt: 0, sample_collection: 0, outcome_assigned: 0,
      home_visits: 0, contact_tracing: 0, follow_ups: 0, face_to_face: 0,
      documents: 0, fdc_provided: 0, kit_consumption: 0, overrides: 0, differentiated_tb: 0, tpt_treatment_start: 0, tpt_presumptive: 0, adhar_face_auth: 0, consent_with_id: 0
    };
    return records.reduce((acc, curr) => {
      for (let key in init) {
        if (key === 'overrides') acc[key] += curr.is_override ? 1 : 0;
        else acc[key] += (curr[key] || 0);
      }
      return acc;
    }, init);
  };

  const totals = useMemo(() => aggregate(filteredRecords), [filteredRecords]);

  const liveWhatsAppBulletin = useMemo(() => {
    const isSubAdmin = currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All');
    const permittedDistricts = isSubAdmin
      ? (currentUser.allowed_districts || []).map(canonicalizeDistrict)
      : (districts || []).filter(d => d !== 'All').map(canonicalizeDistrict);

    const permittedTargets = targetsData.filter(t => {
      const cDist = canonicalizeDistrict(t.district);
      return permittedDistricts.includes(cDist);
    });

    const totalStateTarget = permittedTargets.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
    
    const distStats = {};
    permittedDistricts.forEach(d => {
      distStats[d] = { dist: d, notif: 0, tests: 0, dbt: 0, km: 0, tgt: 0, pct: 0 };
    });

    permittedTargets.forEach(t => {
      const cDist = canonicalizeDistrict(t.district);
      if (distStats[cDist]) {
        distStats[cDist].tgt += (Number(t.target) || 0);
      }
    });

    (rawRecords || []).forEach(r => {
      const cDist = canonicalizeDistrict(r.working_place || r.district || '');
      if (distStats[cDist]) {
        distStats[cDist].notif += (r.notifications || (r.notification_ids ? r.notification_ids.length : 0) || 0);
        distStats[cDist].tests += (r.tests || (r.sample_tested_ids ? r.sample_tested_ids.length : 0) || 0);
        distStats[cDist].dbt += (r.dbt || (r.dbt_ids ? r.dbt_ids.length : 0) || 0);
        distStats[cDist].km += (Number(r.total_km) || 0);
      }
    });

    const totalStateNotif = Object.values(distStats).reduce((sum, d) => sum + d.notif, 0);
    const totalStateTests = Object.values(distStats).reduce((sum, d) => sum + d.tests, 0);
    const totalStateDbt = Object.values(distStats).reduce((sum, d) => sum + d.dbt, 0);
    const totalStateKm = Object.values(distStats).reduce((sum, d) => sum + d.km, 0);
    const overallPct = totalStateTarget > 0 ? Math.round((totalStateNotif / totalStateTarget) * 100) : 0;

    const sortedDistricts = Object.values(distStats).map(d => {
      const pct = d.tgt > 0 ? Math.round((d.notif / d.tgt) * 100) : 0;
      return { ...d, pct };
    }).sort((a, b) => b.pct - a.pct || b.notif - a.notif);

    let msg = `🏥 *DOCTORS FOR YOU (DFY) - BIHAR TB MIS BULLETIN*\n`;
    msg += `📅 *Month:* ${month} | *Generated:* ${new Date().toLocaleDateString()}\n\n`;
    msg += `📊 *${isSubAdmin ? 'ASSIGNED DISTRICTS SUMMARY' : 'STATE SUMMARY'}:*\n`;
    msg += `• Total Notifications: *${totalStateNotif}* / ${totalStateTarget} (*${overallPct}%*)\n`;
    msg += `• Total Samples Tested: *${totalStateTests}*\n`;
    msg += `• Total DBT Seeded: *${totalStateDbt}*\n`;
    msg += `• Total Field KM: *${totalStateKm} KM*\n\n`;
    msg += `🏆 *DISTRICT LEADERBOARD:*\n`;

    sortedDistricts.forEach((d, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      msg += `${medal} *${d.dist}:* ${d.notif}/${d.tgt} (${d.pct}%)\n`;
    });

    msg += `\n_DFY Bihar State Health Monitoring Cell_`;
    return msg;
  }, [month, totals, rawRecords, targetsData, districts, currentUser]);

  const copyWhatsAppBulletin = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(liveWhatsAppBulletin);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = liveWhatsAppBulletin;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopiedBulletin(true);
      showToast('✓ WhatsApp Bulletin copied to clipboard!', 'success');
      setTimeout(() => setCopiedBulletin(false), 2500);
    } catch (err) {
      console.error('Failed to copy WhatsApp bulletin:', err);
      showToast('Failed to copy bulletin to clipboard', 'error');
    }
  };

  // Option A: Daily Timeline Trend Data (Dynamic calendar days, peak day, daily average)
  const dailyTrendStats = useMemo(() => {
    let totalDays = 31;
    let year = new Date().getFullYear();
    let monthIdx = new Date().getMonth();
    try {
      const [yStr, mStr] = (month || new Date().toISOString().slice(0, 7)).split('-');
      year = parseInt(yStr, 10);
      monthIdx = parseInt(mStr, 10) - 1;
      totalDays = new Date(year, monthIdx + 1, 0).getDate();
    } catch (e) {
      totalDays = 31;
    }

    const days = Array.from({ length: totalDays }, (_, i) => String(i + 1).padStart(2, '0'));
    const map = {};
    days.forEach(d => { map[d] = 0; });

    filteredRecords.forEach(r => {
      const recordDate = String(r.date || r.date_of_reporting || '').trim();
      if (recordDate) {
        const dateOnly = recordDate.split('T')[0];
        const parts = dateOnly.split('-');
        if (parts.length >= 3) {
          const d = parts[2].padStart(2, '0');
          if (map[d] !== undefined) {
            map[d] += (Number(r[activeMetric]) || 0);
          }
        }
      }
    });

    let peakDay = { day: '-', value: 0 };
    let totalVal = 0;
    const chartData = days.map(d => {
      const val = map[d] || 0;
      totalVal += val;
      if (val > peakDay.value) {
        peakDay = { day: d, value: val };
      }
      return {
        day: `${Number(d)}`,
        value: val
      };
    });

    const today = new Date();
    const isCurrentMonth = (year === today.getFullYear() && monthIdx === today.getMonth());
    const elapsedDays = isCurrentMonth ? Math.min(today.getDate(), totalDays) : totalDays;
    const avgDaily = elapsedDays > 0 ? (totalVal / elapsedDays).toFixed(1) : '0';

    return {
      chartData,
      totalVal,
      peakDay,
      avgDaily,
      totalDays
    };
  }, [filteredRecords, activeMetric, month]);

  // Backward compatibility alias for any component expecting dailyTrendData
  const dailyTrendData = dailyTrendStats.chartData;

  // Unified Target vs Achievement & Performance Data
  const performanceData = useMemo(() => {
    // Mode 1: Statewide / Multi-District View
    if (selectedDistrict === 'All') {
      let distList = DEFAULT_BIHAR_DISTRICTS;
      // Strict Sub-Admin Enforcing: Sub-Admin only sees their allowed districts!
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
        distList = distList.filter(d => userAllowed.includes(d));
      }

      const list = distList.map(dist => {
        const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === dist);
        const notif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
        const target = targetsData.filter(t => canonicalizeDistrict(t.district) === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
        const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
        return {
          name: dist,
          district: dist,
          notifications: notif,
          target: target,
          percentage: pct,
          reports: distRecords.length,
          type: 'district'
        };
      });

      if (performanceMetricFilter === 'pct_achieve') {
        return list.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
      }
      return list.sort((a, b) => b.notifications - a.notifications || b.percentage - a.percentage);
    }

    // Mode 2: Specific District View -> Field Officers in selectedDistrict
    const targetDist = canonicalizeDistrict(selectedDistrict);
    const distRecs = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === targetDist);
    const dirFos = staffDirectory[targetDist] || [];
    const allFos = Array.from(new Set([...dirFos, ...distRecs.map(r => canonicalizeFo(r.fo_name, targetDist, staffDirectory))])).filter(Boolean);

    const list = allFos.map(fo => {
      const foRecs = distRecs.filter(r => canonicalizeFo(r.fo_name, targetDist, staffDirectory) === fo);
      const notif = foRecs.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const targetObj = targetsData.find(t => canonicalizeFo(t.fo_name, targetDist, staffDirectory) === fo && canonicalizeDistrict(t.district) === targetDist);
      const target = targetObj ? (Number(targetObj.target) || 0) : 0;
      const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
      return {
        name: fo,
        fo_name: fo,
        district: targetDist,
        notifications: notif,
        target: target,
        percentage: pct,
        reports: foRecs.length,
        type: 'officer'
      };
    });

    if (performanceMetricFilter === 'pct_achieve') {
      return list.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
    }
    return list.sort((a, b) => b.notifications - a.notifications || b.percentage - a.percentage);
  }, [rawRecords, targetsData, staffDirectory, selectedDistrict, currentUser, performanceMetricFilter]);

  const performanceChartHeight = useMemo(() => {
    const len = performanceData.length;
    return Math.min(850, Math.max(340, len * 30 + 50));
  }, [performanceData]);

  const districtComparisonData = performanceData;

  // District Performance Leaderboard
  const leaderboardData = useMemo(() => {
    let distList = DEFAULT_BIHAR_DISTRICTS;
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
      distList = distList.filter(d => userAllowed.includes(d));
    }
    const result = distList.map(dist => {
      const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === dist);
      const notif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const target = targetsData.filter(t => canonicalizeDistrict(t.district) === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
      const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
      return {
        district: dist,
        notifications: notif,
        target: target,
        percentage: pct,
        reports: distRecords.length
      };
    });
    return result.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
  }, [rawRecords, targetsData, staffDirectory, currentUser]);

  // Set of all patient IDs notified in the current month across active records
  const currentMonthNotifIdSet = useMemo(() => {
    const s = new Set();
    (rawRecords || []).forEach(r => {
      (r.notification_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) s.add(clean);
      });
    });
    return s;
  }, [rawRecords]);

  // Table Data with Grouping & Sorting
  const tableData = useMemo(() => {
    const map = {};
    filteredRecords.forEach(r => {
      const key = selectedDistrict === 'All' 
        ? canonicalizeDistrict(r.working_place) 
        : canonicalizeFo(r.fo_name, r.working_place, staffDirectory);
      if (!map[key]) {
        map[key] = { 
          name: key, 
          ...aggregate([]),
          target: 0,
          hiv_dm_cur: 0,
          hiv_dm_prev: 0,
          tests_cur: 0,
          tests_prev: 0,
          dbt_cur: 0,
          dbt_prev: 0,
          home_visits_cur: 0,
          home_visits_prev: 0,
          contact_tracing_cur: 0,
          contact_tracing_prev: 0,
          follow_ups_cur: 0,
          follow_ups_prev: 0,
          documents_cur: 0,
          documents_prev: 0,
          differentiated_tb_cur: 0,
          differentiated_tb_prev: 0,
        };
      }
      for (let k in map[key]) {
        if (k !== 'name' && k !== 'overrides' && !k.endsWith('_cur') && !k.endsWith('_prev') && k !== 'target') {
          map[key][k] += (r[k] || 0);
        }
      }
      if (r.is_override) map[key].overrides += 1;

      // Cohort breakdown for this record's IDs
      (r.hiv_dm_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].hiv_dm_cur += 1;
          else map[key].hiv_dm_prev += 1;
        }
      });
      (r.sample_tested_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].tests_cur += 1;
          else map[key].tests_prev += 1;
        }
      });
      (r.dbt_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].dbt_cur += 1;
          else map[key].dbt_prev += 1;
        }
      });
      (r.home_visit_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].home_visits_cur += 1;
          else map[key].home_visits_prev += 1;
        }
      });
      (r.contact_tracing_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].contact_tracing_cur += 1;
          else map[key].contact_tracing_prev += 1;
        }
      });
      (r.follow_up_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].follow_ups_cur += 1;
          else map[key].follow_ups_prev += 1;
        }
      });
      (r.documents_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].documents_cur += 1;
          else map[key].documents_prev += 1;
        }
      });
      (r.differentiated_tb_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].differentiated_tb_cur += 1;
          else map[key].differentiated_tb_prev += 1;
        }
      });
    });

    // Populate target for each row (district or officer)
    Object.keys(map).forEach(key => {
      if (selectedDistrict === 'All') {
        const distTargets = (targetsData || []).filter(t => canonicalizeDistrict(t.district) === key);
        let tSum = distTargets.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
        if (tSum === 0) {
          const staffCount = (staffList || []).filter(s => canonicalizeDistrict(s.district) === key && s.is_active !== false && s.status !== 'inactive').length;
          tSum = (staffCount > 0 ? staffCount : 1) * 50;
        }
        map[key].target = tSum;
      } else {
        const cDist = canonicalizeDistrict(selectedDistrict);
        const tObj = (targetsData || []).find(t => 
          canonicalizeDistrict(t.district) === cDist && 
          canonicalizeFo(t.fo_name, cDist, staffDirectory).toLowerCase() === key.toLowerCase()
        );
        map[key].target = tObj ? (Number(tObj.target) || 50) : 50;
      }
    });

    let data = Object.values(map);
    data.sort((a, b) => {
      const getVal = (row, sortKey) => {
        if (masterTableCohortFilter === 'current_cohort') {
          if (sortKey === 'hiv_dm') return row.hiv_dm_cur;
          if (sortKey === 'tests') return row.tests_cur;
          if (sortKey === 'dbt') return row.dbt_cur;
          if (sortKey === 'home_visits') return row.home_visits_cur;
          if (sortKey === 'contact_tracing') return row.contact_tracing_cur;
          if (sortKey === 'follow_ups') return row.follow_ups_cur;
          if (sortKey === 'documents') return row.documents_cur;
          if (sortKey === 'differentiated_tb') return row.differentiated_tb_cur;
        } else if (masterTableCohortFilter === 'backlog') {
          if (sortKey === 'hiv_dm') return row.hiv_dm_prev;
          if (sortKey === 'tests') return row.tests_prev;
          if (sortKey === 'dbt') return row.dbt_prev;
          if (sortKey === 'home_visits') return row.home_visits_prev;
          if (sortKey === 'contact_tracing') return row.contact_tracing_prev;
          if (sortKey === 'follow_ups') return row.follow_ups_prev;
          if (sortKey === 'documents') return row.documents_prev;
          if (sortKey === 'differentiated_tb') return row.differentiated_tb_prev;
        }
        return row[sortKey] ?? 0;
      };

      const valA = getVal(a, sortConfig.key);
      const valB = getVal(b, sortConfig.key);

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [filteredRecords, selectedDistrict, sortConfig, staffDirectory, targetsData, staffList, currentMonthNotifIdSet, masterTableCohortFilter]);

  // Aggregate totals across all rows in tableData (for both All Districts and District Drill-down)
  const tableTotals = useMemo(() => {
    const init = {
      target: 0,
      notifications: 0,
      tests: 0, tests_cur: 0, tests_prev: 0,
      presumptive: 0,
      doctor_visits: 0,
      hiv_dm: 0, hiv_dm_cur: 0, hiv_dm_prev: 0,
      dbt: 0, dbt_cur: 0, dbt_prev: 0,
      sample_collection: 0,
      outcome_assigned: 0,
      home_visits: 0, home_visits_cur: 0, home_visits_prev: 0,
      contact_tracing: 0, contact_tracing_cur: 0, contact_tracing_prev: 0,
      follow_ups: 0, follow_ups_cur: 0, follow_ups_prev: 0,
      face_to_face: 0,
      documents: 0, documents_cur: 0, documents_prev: 0,
      fdc_provided: 0,
      kit_consumption: 0,
      differentiated_tb: 0, differentiated_tb_cur: 0, differentiated_tb_prev: 0,
      tpt_treatment_start: 0,
      tpt_presumptive: 0,
      adhar_face_auth: 0,
      consent_with_id: 0,
      overrides: 0,
    };
    return (tableData || []).reduce((acc, row) => {
      for (const k in init) {
        acc[k] += (Number(row[k]) || 0);
      }
      return acc;
    }, init);
  }, [tableData]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const TH = ({ label, sortKey }) => {
    const isSorted = sortConfig.key === sortKey;
    return (
      <th 
        className={`p-2.5 sm:px-3 sm:py-2.5 font-black text-[10px] uppercase tracking-wider border-b border-slate-200 transition-all select-none cursor-pointer ${
          isSorted ? 'bg-teal-50 text-teal-950 font-extrabold' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`} 
        onClick={() => requestSort(sortKey)}
      >
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {isSorted && (
            <span className="bg-teal-700 text-white text-[9px] px-1 py-0.2 rounded font-black shadow-2xs">
              {sortConfig.direction === 'desc' ? '▼' : '▲'}
            </span>
          )}
        </div>
      </th>
    );
  };

  // Dynamic Working Days & Calendar Model (Zero-Backend Overhead)
  const workingDaysInfo = useMemo(() => {
    try {
      const [yearStr, mStr] = (month || new Date().toISOString().slice(0, 7)).split('-');
      const year = parseInt(yearStr, 10);
      const monthIdx = parseInt(mStr, 10) - 1;

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonthIdx = today.getMonth();
      const currentDay = today.getDate();

      const totalDays = new Date(year, monthIdx + 1, 0).getDate();

      let sundays = 0;
      let elapsedSundays = 0;

      const isCurrentMonth = (year === currentYear && monthIdx === currentMonthIdx);
      const isPastMonth = (year < currentYear || (year === currentYear && monthIdx < currentMonthIdx));
      const isFutureMonth = (year > currentYear || (year === currentYear && monthIdx > currentMonthIdx));

      const effectiveElapsedDays = isCurrentMonth 
        ? Math.min(currentDay, totalDays)
        : isPastMonth 
          ? totalDays 
          : 0;

      for (let day = 1; day <= totalDays; day++) {
        const d = new Date(year, monthIdx, day);
        if (d.getDay() === 0) {
          sundays++;
          if (day <= effectiveElapsedDays) {
            elapsedSundays++;
          }
        }
      }

      const holidays = Math.max(0, Number(pacingHolidaysCount) || 0);
      const totalWorkingDays = Math.max(1, totalDays - sundays - holidays);
      const elapsedWorkingDays = isFutureMonth 
        ? 0 
        : Math.max(0, Math.min(totalWorkingDays, effectiveElapsedDays - elapsedSundays - (isPastMonth ? holidays : Math.min(holidays, Math.floor((effectiveElapsedDays / totalDays) * holidays)))));
      const remainingWorkingDays = Math.max(0, totalWorkingDays - elapsedWorkingDays);

      return {
        month,
        totalDays,
        sundays,
        holidays,
        totalWorkingDays,
        elapsedWorkingDays,
        remainingWorkingDays,
        isCurrentMonth,
        isPastMonth,
        isFutureMonth
      };
    } catch (e) {
      return {
        month,
        totalDays: 30,
        sundays: 4,
        holidays: 1,
        totalWorkingDays: 25,
        elapsedWorkingDays: 10,
        remainingWorkingDays: 15,
        isCurrentMonth: true,
        isPastMonth: false,
        isFutureMonth: false
      };
    }
  }, [month, pacingHolidaysCount]);

  // Comprehensive Staff Pacing, Forecasting & Velocity Engine (Zero-Backend Overhead)
  const staffPacingData = useMemo(() => {
    const seenMap = new Set();
    const candidateList = [];

    // Strict Staff Alignment: Single Source of Truth from Official Staff Directory
    if (staffDirectory && Object.keys(staffDirectory).length > 0) {
      Object.keys(staffDirectory).forEach(dist => {
        const cDist = canonicalizeDistrict(dist);
        (staffDirectory[dist] || []).forEach(name => {
          const cleanName = (name || '').trim();
          if (cleanName) {
            candidateList.push({ name: cleanName, district: cDist, designation: 'Field Officer' });
          }
        });
      });
    }

    // Include registered staff from staffList (Admin Staff Management suite)
    if (staffList && staffList.length > 0) {
      staffList.forEach(s => {
        if (s.is_active === false || s.status === 'inactive') return;
        const cleanName = (s.name || '').trim();
        const cDist = canonicalizeDistrict(s.district || '');
        if (cleanName && cDist) {
          candidateList.push({ name: cleanName, district: cDist, designation: s.designation || 'Field Officer' });
        }
      });
    }

    // De-duplicate candidates by normalized canonical key
    const uniqueCandidates = [];
    candidateList.forEach(c => {
      const key = `${canonicalizeDistrict(c.district)}___${c.name.trim().toLowerCase()}`;
      if (!seenMap.has(key)) {
        seenMap.add(key);
        uniqueCandidates.push(c);
      }
    });

    const isSubAdmin = currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All');
    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = workingDaysInfo;
    const list = [];

    uniqueCandidates.forEach(c => {
      const cDist = canonicalizeDistrict(c.district);
      // Sub-Admin RBAC filter
      if (isSubAdmin) {
        const allowedCanonical = (currentUser.allowed_districts || []).map(canonicalizeDistrict);
        if (!allowedCanonical.includes(cDist) && !allowedCanonical.includes(c.district)) {
          return;
        }
      }

      const officerLower = c.name.trim().toLowerCase();

      // Find target with normalized matching
      const tObj = targetsData.find(t => {
        if (!t.fo_name || !t.district) return false;
        return canonicalizeDistrict(t.district) === cDist && t.fo_name.trim().toLowerCase() === officerLower;
      });
      const target = tObj ? (Number(tObj.target) || 0) : 50;

      // Find monthly records with normalized trimmed matching
      const officerRecords = rawRecords.filter(r => {
        if (!r.working_place || !r.fo_name) return false;
        if (canonicalizeDistrict(r.working_place) !== cDist) return false;
        const rName = r.fo_name.trim().toLowerCase();
        if (rName === officerLower) return true;
        // Legacy alias resolution (Ashwani Kumar -> Ashwani Kr Keshri)
        if (officerLower === 'ashwani kr keshri' && (rName === 'ashwani kumar' || rName === 'ashwani kr keshri')) return true;
        return false;
      });
      const achieved = officerRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const activeDaysCount = new Set(officerRecords.map(r => r.date_of_reporting || r.date).filter(Boolean)).size;

      // Clinical indicators
      const tests = officerRecords.reduce((sum, r) => sum + (r.tests || 0), 0);
      const dbt = officerRecords.reduce((sum, r) => sum + (r.dbt || 0), 0);
      const hiv_dm = officerRecords.reduce((sum, r) => sum + (r.hiv_dm || 0), 0);
      const tpt = officerRecords.reduce((sum, r) => sum + (r.tpt_treatment_start || 0), 0);
      const doctor_visits = officerRecords.reduce((sum, r) => sum + (r.doctor_visits || 0), 0);
      const total_km = officerRecords.reduce((sum, r) => sum + (r.total_km || 0), 0);
      const home_visits = officerRecords.reduce((sum, r) => sum + (r.home_visits || 0), 0);

      // Pacing Calculations
      const expectedPace = Math.min(target, Math.round((target / Math.max(1, totalWorkingDays)) * elapsedWorkingDays));
      const pacingPct = expectedPace > 0 
        ? Math.round((achieved / expectedPace) * 100) 
        : (achieved > 0 ? 100 : 0);

      const targetAchievedPct = target > 0 ? Math.round((achieved / target) * 100) : 0;

      const dailyVelocityNum = elapsedWorkingDays > 0 ? (achieved / elapsedWorkingDays) : 0;
      const dailyVelocity = dailyVelocityNum.toFixed(1);

      const targetDailyRateNum = (target / Math.max(1, totalWorkingDays));
      const targetDailyRate = targetDailyRateNum.toFixed(1);

      const requiredRecoveryRateNum = remainingWorkingDays > 0 
        ? Math.max(0, target - achieved) / remainingWorkingDays 
        : 0;
      const requiredRecoveryRate = requiredRecoveryRateNum.toFixed(1);

      const projectedFinish = Math.round(achieved + (dailyVelocityNum * remainingWorkingDays));
      const projectedPct = target > 0 ? Math.round((projectedFinish / target) * 100) : 0;
      const surplus = projectedFinish - target;

      // Status classification
      let status = 'ON_TRACK';
      if (achieved >= target || pacingPct >= 100) {
        status = 'ON_TRACK';
      } else if (pacingPct >= 75) {
        status = 'WATCHLIST';
      } else {
        status = 'CRITICAL';
      }

      const consistencyPct = elapsedWorkingDays > 0 
        ? Math.min(100, Math.round((activeDaysCount / elapsedWorkingDays) * 100)) 
        : 0;

      list.push({
        id: `${c.district}___${c.name}`,
        name: c.name,
        district: c.district,
        designation: c.designation || 'Field Officer',
        target,
        achieved,
        expectedPace,
        pacingPct,
        targetAchievedPct,
        dailyVelocity: Number(dailyVelocity),
        targetDailyRate: Number(targetDailyRate),
        requiredRecoveryRate: Number(requiredRecoveryRate),
        projectedFinish,
        projectedPct,
        surplus,
        status,
        activeDaysCount,
        consistencyPct,
        tests,
        dbt,
        hiv_dm,
        tpt,
        doctor_visits,
        home_visits,
        total_km
      });
    });

    return list;
  }, [staffList, staffDirectory, rawRecords, targetsData, workingDaysInfo, currentUser]);

  const pacingStats = useMemo(() => {
    const totalStaff = staffPacingData.length;
    const onTrack = staffPacingData.filter(s => s.status === 'ON_TRACK').length;
    const watchlist = staffPacingData.filter(s => s.status === 'WATCHLIST').length;
    const critical = staffPacingData.filter(s => s.status === 'CRITICAL').length;
    const totalTarget = staffPacingData.reduce((sum, s) => sum + s.target, 0);
    const totalAchieved = staffPacingData.reduce((sum, s) => sum + s.achieved, 0);
    const totalProjected = staffPacingData.reduce((sum, s) => sum + s.projectedFinish, 0);
    const statePacingPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
    const stateProjectedPct = totalTarget > 0 ? Math.round((totalProjected / totalTarget) * 100) : 0;

    return {
      totalStaff,
      onTrack,
      watchlist,
      critical,
      totalTarget,
      totalAchieved,
      totalProjected,
      statePacingPct,
      stateProjectedPct
    };
  }, [staffPacingData]);

  const filteredStaffPacing = useMemo(() => {
    let list = staffPacingData;

    if (selectedDistrict !== 'All') {
      list = list.filter(s => s.district === selectedDistrict);
    }

    if (pacingFilterStatus !== 'ALL') {
      list = list.filter(s => s.status === pacingFilterStatus);
    }

    if (pacingSearchQuery.trim()) {
      const q = pacingSearchQuery.trim().toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.district.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      let valA = a[pacingSortConfig.key];
      let valB = b[pacingSortConfig.key];
      if (typeof valA === 'string') {
        return pacingSortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return pacingSortConfig.direction === 'asc' ? (valA - valB) : (valB - valA);
    });
  }, [staffPacingData, selectedDistrict, pacingFilterStatus, pacingSearchQuery, pacingSortConfig]);

  const districtPacingData = useMemo(() => {
    let distList = DEFAULT_BIHAR_DISTRICTS;
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
      distList = distList.filter(d => userAllowed.includes(d));
    }
    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = workingDaysInfo;

    return distList.map(dist => {
      const distStaff = staffPacingData.filter(s => canonicalizeDistrict(s.district) === dist);
      const staffCount = distStaff.length;
      const target = distStaff.reduce((sum, s) => sum + s.target, 0) || (targetsData.filter(t => canonicalizeDistrict(t.district) === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0) || 100);
      const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === dist);
      const achieved = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);

      const expectedPace = Math.min(target, Math.round((target / Math.max(1, totalWorkingDays)) * elapsedWorkingDays));
      const pacingPct = expectedPace > 0 ? Math.round((achieved / expectedPace) * 100) : (achieved > 0 ? 100 : 0);
      const targetAchievedPct = target > 0 ? Math.round((achieved / target) * 100) : 0;

      const dailyVelocityNum = elapsedWorkingDays > 0 ? (achieved / elapsedWorkingDays) : 0;
      const requiredRecoveryRateNum = remainingWorkingDays > 0 ? (Math.max(0, target - achieved) / remainingWorkingDays) : 0;
      const projectedFinish = Math.round(achieved + (dailyVelocityNum * remainingWorkingDays));
      const surplus = projectedFinish - target;

      let status = 'ON_TRACK';
      if (achieved >= target || pacingPct >= 100) status = 'ON_TRACK';
      else if (pacingPct >= 75) status = 'WATCHLIST';
      else status = 'CRITICAL';

      return {
        district: dist,
        staffCount,
        target,
        expectedPace,
        achieved,
        pacingPct,
        targetAchievedPct,
        dailyVelocity: dailyVelocityNum.toFixed(1),
        requiredRecoveryRate: requiredRecoveryRateNum.toFixed(1),
        projectedFinish,
        surplus,
        status,
        reportsCount: distRecords.length
      };
    }).sort((a, b) => b.pacingPct - a.pacingPct || b.achieved - a.achieved);
  }, [staffPacingData, staffDirectory, currentUser, workingDaysInfo, targetsData, rawRecords]);

  // WhatsApp Coaching Message Generator
  const generateCoachingMessage = (officer) => {
    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = workingDaysInfo;
    let msg = `🏥 *DOCTORS FOR YOU (DFY) - OFFICER TARGET PACING COACH*\n`;
    msg += `👤 *Officer:* ${officer.name} (${officer.district})\n`;
    msg += `📅 *Month:* ${month} | *Working Days:* ${elapsedWorkingDays}/${totalWorkingDays} days elapsed\n\n`;
    msg += `🎯 *Target Performance:*\n`;
    msg += `• Monthly Target: *${officer.target}*\n`;
    msg += `• Achieved So Far: *${officer.achieved}* (${officer.targetAchievedPct}% achieved)\n`;
    msg += `• Expected Pace to Date: *${officer.expectedPace}*\n`;
    msg += `• Current Pacing: *${officer.pacingPct}%* (${officer.status === 'ON_TRACK' ? '🟢 Ahead of Pace' : officer.status === 'WATCHLIST' ? '🟡 Slight Lag - Push Needed' : '🔴 Critical Lag - Immediate Support Required'})\n\n`;
    msg += `⚡ *Daily Run-Rate & Forecast:*\n`;
    msg += `• Current Velocity: *${officer.dailyVelocity}* notif/day\n`;
    msg += `• Month-End Forecast: *${officer.projectedFinish}* (${officer.surplus >= 0 ? `+${officer.surplus} surplus ✓` : `${officer.surplus} deficit ⚠️`})\n`;
    if (remainingWorkingDays > 0 && officer.achieved < officer.target) {
      msg += `• Required Daily Pace: *${officer.requiredRecoveryRate}* notif/day for remaining *${remainingWorkingDays}* working days\n\n`;
    }
    msg += `💪 *Aap kar sakte hain! Kripya field work aur daily notifications me tezi layein.*\n`;
    msg += `_DFY Bihar State Health Monitoring Cell_`;
    return msg;
  };

  const copyCoachingMessage = (officer) => {
    const text = generateCoachingMessage(officer);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCoachingOfficer(officer.id);
      setTimeout(() => setCopiedCoachingOfficer(null), 2500);
    }
  };

  const copyDistrictWhatsAppReport = (targetDist = selectedDistrict) => {
    if (!targetDist || targetDist === 'All') {
      showToast("Please select a specific district to generate the report.", "error");
      return;
    }
    const cDist = canonicalizeDistrict(targetDist);
    const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === cDist);
    const distStaff = staffPacingData.filter(s => canonicalizeDistrict(s.district) === cDist);
    
    // District Targets and Totals
    const distTarget = distStaff.reduce((sum, s) => sum + (s.target || 0), 0) || 
      (targetsData.filter(t => canonicalizeDistrict(t.district) === cDist).reduce((sum, t) => sum + (Number(t.target) || 0), 0) || 100);
    const distNotif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
    const distPct = distTarget > 0 ? Math.round((distNotif / distTarget) * 100) : 0;
    const distTests = distRecords.reduce((sum, r) => sum + (r.tests || 0), 0);
    const distFdc = distRecords.reduce((sum, r) => sum + (Array.isArray(r.fdc_provided_ids) ? r.fdc_provided_ids.length : (r.fdc_provided || 0)), 0);
    const distDbt = distRecords.reduce((sum, r) => sum + (r.dbt || 0), 0);
    const distContact = distRecords.reduce((sum, r) => sum + (r.contact_tracing || 0), 0);
    const distKm = distRecords.reduce((sum, r) => sum + (r.total_km || 0), 0);

    let msg = `🏥 *DOCTORS FOR YOU (DFY) - BIHAR TB MIS*\n`;
    msg += `📍 *DISTRICT COMPREHENSIVE PERFORMANCE REPORT*\n`;
    msg += `────────────────────────────\n`;
    msg += `📌 *District:* ${cDist.toUpperCase()}\n`;
    msg += `📅 *Month:* ${month} | *Generated:* ${new Date().toLocaleDateString('en-IN')}\n\n`;

    msg += `🎯 *DISTRICT OVERALL TARGET & PROGRESS:*\n`;
    msg += `• District Target: *${distTarget}* | Achieved: *${distNotif}* (*${distPct}% Progress*)\n`;
    msg += `• Notifications: *${distNotif}*\n`;
    msg += `• Lab Samples Tested: *${distTests}*\n`;
    msg += `• FDC Medicine Issues: *${distFdc}*\n`;
    msg += `• DBT Bank Linked: *${distDbt}*\n`;
    msg += `• Contact Tracing: *${distContact}*\n`;
    msg += `• Total Field Travel: *${distKm} KM*\n\n`;

    msg += `👥 *STAFF PERFORMANCE & TARGET ACHIEVEMENT:*\n`;
    if (distStaff.length === 0) {
      msg += `_No staff assigned or registered for this district._\n`;
    } else {
      distStaff.forEach((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const statusIcon = s.status === 'ON_TRACK' ? '🟢 ON TRACK' : s.status === 'WATCHLIST' ? '🟡 WATCHLIST' : '🔴 CRITICAL';
        const staffFdc = distRecords
          .filter(r => canonicalizeFo(r.fo_name, r.working_place, staffDirectory) === s.name)
          .reduce((sum, r) => sum + (Array.isArray(r.fdc_provided_ids) ? r.fdc_provided_ids.length : (r.fdc_provided || 0)), 0);

        msg += `${medal} *${s.name}* (${s.designation || 'Field Officer'})\n`;
        msg += `   • Target: *${s.target}* | Achieved: *${s.achieved}* (*${s.targetAchievedPct}% Achievement*) ${statusIcon}\n`;
        msg += `   • Tests: ${s.tests || 0} | FDC: ${staffFdc} | DBT: ${s.dbt || 0} | Travel: ${s.total_km || 0} KM\n`;
        msg += `   • Field Attendance: ${s.activeDaysCount || 0} Days\n\n`;
      });
    }

    msg += `────────────────────────────\n`;
    msg += `_Report generated by DFY Bihar TB MIS Monitoring Cell_`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      showToast(`✓ ${cDist} WhatsApp Comprehensive Report copied!`, 'success');
    }
    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(shareUrl, '_blank');
  };

  const handleHardAppReset = async () => {
    if (!window.confirm("App cache clear karke fresh version reload karein?")) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn("Reset error:", e);
    }
    window.location.reload();
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/20 to-slate-100/60 flex items-center justify-center p-4 font-sans">
        <div className="bg-white/95 backdrop-blur-xl p-6 sm:p-8 rounded-3xl shadow-[0_20px_50px_rgba(79,70,229,0.07)] w-full max-w-md border border-slate-200/80 animate-fade-in-down">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-white border border-slate-200/90 rounded-2xl flex items-center justify-center p-1.5 mx-auto mb-3 shadow-md shadow-teal-900/10">
              <img src="/dfy-logo.png" alt="Doctors For You Logo" className="w-full h-full object-contain" />
            </div>
            <div className="inline-block bg-teal-50 text-teal-800 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border border-teal-200 mb-1.5">
              Doctors For You
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Admin Portal</h1>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1">State Health MIS Management</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-0.5">Username / Admin ID</label>
              <input 
                type="text" 
                value={loginUsername} 
                onChange={(e) => setLoginUsername(e.target.value)} 
                placeholder="e.g. admin or mis_buxar" 
                className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-2xs" 
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5 ml-0.5">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Enter password" 
                className="w-full bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-sm font-semibold focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-2xs" 
              />
            </div>

            {error && <p className="text-rose-600 text-xs font-bold text-center bg-rose-50/90 p-2.5 rounded-xl border border-rose-200/80 animate-fade-in">{error}</p>}

            <button type="submit" className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black py-3.5 rounded-xl shadow-md shadow-indigo-600/25 hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.98] transition-all text-xs uppercase tracking-wider cursor-pointer">
              Enter Admin Portal &rarr;
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-3">
            <button onClick={() => window.location.href = '/'} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              &larr; Back to Field Officer App
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 md:p-6 font-sans text-slate-800">
      <div className="max-w-[1720px] w-full mx-auto space-y-4">
        {isColdStarting && (
          <div className="bg-amber-500 text-white px-4 py-3 rounded-2xl font-bold text-xs sm:text-sm text-center shadow-md animate-pulse flex items-center justify-center gap-2">
            <span>⚡ Server wake-up ho raha hai (Render spin-up), kripya thoda intezar karein...</span>
          </div>
        )}
        
        {/* ========================================================================= */}
        {/* --- EXECUTIVE TOP STICKY COMMAND BAR (FULL-WIDTH BRAND, FILTERS & UTILITIES) --- */}
        {/* ========================================================================= */}
        <header className="sticky top-0 z-40 command-bar-surface p-3 sm:p-3.5 rounded-2xl shadow-sm border border-slate-200/90 transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
            
            {/* 1. Left: Brand & Admin Identity */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white border border-teal-200/90 p-0.5 shadow-sm shadow-teal-700/20 flex items-center justify-center shrink-0 overflow-hidden">
                <img src="/dfy-logo.png" alt="Doctors For You Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">DFY TB Control Center</h1>
                  <div className="flex items-center gap-1.5 bg-teal-50 border border-teal-200/90 px-2.5 py-0.5 rounded-full shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-black text-teal-950">{currentUser?.name || 'Super Admin'}</span>
                    <span className="text-[9px] font-black uppercase tracking-wider bg-teal-200/80 text-teal-900 px-2 py-0.5 rounded-full">
                      {currentUser?.role === 'SUPER_ADMIN' ? '👑 Super Admin' : '🛡️ Sub Admin'}
                    </span>
                  </div>
                </div>
                <p className="text-slate-500 text-xs font-medium mt-0.5">Monitoring {rawRecords.length} daily reports across Bihar</p>
              </div>
            </div>

            {/* 2. Middle & Right: Scope Filters + Global Utilities */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              {/* Scope Filters Group */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-slate-100/80 border border-slate-200/90 p-1 rounded-xl shadow-inner">
                <input 
                  type="month" 
                  value={month} 
                  onChange={(e) => setMonth(e.target.value)} 
                  className="bg-white border border-slate-200/90 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all cursor-pointer" 
                />
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDistrict('All');
                      setSelectedFO('All');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                      selectedDistrict === 'All'
                        ? 'bg-teal-700 text-white shadow-xs shadow-teal-700/25'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 shadow-2xs'
                    }`}
                    title="View All Districts"
                  >
                    <span>🌐</span>
                    <span>All</span>
                  </button>
                )}
                <select 
                  value={selectedDistrict} 
                  onChange={(e) => {setSelectedDistrict(e.target.value); setSelectedFO('All');}} 
                  className={`border px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all cursor-pointer ${
                    selectedDistrict !== 'All'
                      ? 'bg-teal-50 border-teal-300 text-teal-900 ring-1 ring-teal-300 shadow-xs'
                      : 'bg-white border-slate-200/90 text-slate-700 shadow-2xs'
                  }`}
                >
                  {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
                </select>
                <select 
                  value={selectedFO} 
                  onChange={(e) => setSelectedFO(e.target.value)} 
                  disabled={selectedDistrict === 'All'} 
                  className="bg-white border border-slate-200/90 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 disabled:opacity-40 shadow-2xs cursor-pointer transition-all"
                >
                  {fos.map(f => <option key={f} value={f}>{f === 'All' ? 'All Officers' : f}</option>)}
                </select>

                {selectedDistrict !== 'All' ? (
                  <button
                    type="button"
                    onClick={() => copyDistrictWhatsAppReport(selectedDistrict)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0 animate-fade-in"
                    title={`1-Click WhatsApp Performance Report for ${selectedDistrict} with Staff Target Achievement %`}
                  >
                    <span>📱</span>
                    <span className="hidden sm:inline">WhatsApp Report</span>
                    <span className="sm:hidden">Report</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={copyWhatsAppBulletin}
                    className="bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                    title="1-Click WhatsApp State Bulletin"
                  >
                    <span>📱</span>
                    <span className="hidden sm:inline">WhatsApp Bulletin</span>
                    <span className="sm:hidden">Bulletin</span>
                  </button>
                )}
              </div>

              {/* Utility Action Buttons: Refresh, Security, Logout */}
              <div className="flex items-center gap-1.5">
                {lastSyncedTime && (
                  <div 
                    className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold shadow-2xs transition-all ${
                      syncStatus === 'SYNCING'
                        ? 'bg-amber-50/90 border-amber-300 text-amber-900 animate-pulse'
                        : 'bg-teal-50/80 border-teal-200/90 text-teal-900'
                    }`}
                    title={`Last Synced: ${lastSyncedTime} (${syncStatus === 'UP_TO_DATE' ? 'Data verified up-to-date via delta cache' : 'Live synchronized'})`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      syncStatus === 'SYNCING' 
                        ? 'bg-amber-500 animate-ping' 
                        : 'bg-emerald-500 shadow-xs shadow-emerald-500/50'
                    }`}></span>
                    <span>{syncStatus === 'SYNCING' ? 'Syncing Live...' : syncStatus === 'UP_TO_DATE' ? 'Cached (Up-to-date)' : 'Live Synced'}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await fetchData(true);
                    await fetchAttendance(true);
                    fetchDirectory();
                    loadTargets('All');
                    fetchStaffList();
                    fetchActiveBroadcasts();
                    if (typeof fetchCascadeAlerts === 'function') fetchCascadeAlerts();
                    if (ok) showToast("✓ Live database refresh complete.", "success");
                  }}
                  disabled={isLoading}
                  className={`bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 disabled:opacity-50 text-white px-3 py-2 rounded-xl text-xs font-black transition-all shadow-xs shadow-teal-700/20 flex items-center gap-1.5 active:scale-95 cursor-pointer ${
                    isLoading ? 'cursor-wait animate-pulse' : ''
                  }`}
                  title="Click for guaranteed live database refresh."
                >
                  <svg className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  <span className="hidden sm:inline">{isLoading ? "Syncing..." : "Refresh"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleHardAppReset}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/90 px-3 py-2 rounded-xl text-xs font-black transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
                  title="App cache clear karke fresh version reload karein"
                >
                  <span>🔄</span>
                  <span className="hidden sm:inline">Reset Cache</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAppGuideModal(true)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Admin SOP Manual & Feature Guide (Sub-Admin Help Center)"
                >
                  <span>📘</span>
                  <span className="hidden sm:inline">SOP</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowRecentIdEditsModal(true);
                    fetchRecentIdEdits();
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="View all Patient ID additions, edits, and deletions across the past 7 days"
                >
                  <span>🕒</span>
                  <span className="hidden sm:inline">History</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowChangelogModal(true);
                    setHasSeenLatestChangelog(true);
                    try { localStorage.setItem('dfy_last_seen_changelog', APP_VERSION); } catch (e) {}
                  }}
                  className="relative bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="View Application Updates & Release Changelog"
                >
                  {!hasSeenLatestChangelog && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                  )}
                  <span>🚀</span>
                  <span>v{APP_VERSION}</span>
                </button>

                {isSuperAdmin && (
                  <button 
                    type="button"
                    onClick={() => { setSecurityStatusMsg(''); setShowSecurityModal(true); }} 
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Admin Security Settings & Change Password"
                  >
                    <span>⚙️</span>
                    <span className="hidden sm:inline">Security</span>
                  </button>
                )}

                {isSuperAdmin && (
                  <button 
                    type="button"
                    onClick={() => { setShowBackupModal(true); fetchBackupStatus(); }} 
                    className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Automated Daily Cloud Backups (Google Cloud Storage Mumbai)"
                  >
                    <span>💾</span>
                    <span className="hidden sm:inline">Backups</span>
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem('dfy_admin_auth');
                      localStorage.removeItem('dfy_admin_user');
                    } catch (e) {}
                    setCurrentUser(null);
                    setIsAuthenticated(false);
                    window.location.href = '/';
                  }} 
                  className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 cursor-pointer"
                  title="Logout from Admin Portal"
                >
                  <span>🚪</span>
                  <span>Logout</span>
                </button>
              </div>
            </div>

          </div>
        </header>

        {/* ========================================================================= */}
        {/* --- TIER 2: COMMAND DECK (ORGANIZED FUNCTIONAL CLUSTERS) --- */}
        {/* ========================================================================= */}
        <div className="bg-white/95 backdrop-blur-md p-3.5 sm:p-4 rounded-2xl shadow-xs border border-slate-200/80">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3">
            
            {/* CLUSTER 1: 🩺 CLINICAL & RECONCILIATION (5 cols on LG) */}
            <div className="lg:col-span-5 bg-gradient-to-br from-emerald-50/60 to-teal-50/40 border border-emerald-200/80 rounded-2xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                  <span>🩺</span>
                  <span>Clinical &amp; Nikshay Verification</span>
                </span>
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100/70 px-1.5 py-0.2 rounded">5 Tools</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setShowNotifTrayModal(true)} 
                  className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer col-span-2" 
                  title="Daily Notification Verification Tray - Rapid Nikshay 1-click copy"
                >
                  <span>📋</span>
                  <span className="truncate">Daily Notification Tray</span>
                  {notifTrayData.allIds.length > 0 && (
                    <span className="bg-amber-800 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">
                      {notifTrayData.allIds.length} IDs
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => setShowNikshayModal(true)} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                  title="Upload official Nikshay Excel/CSV dump and auto-reconcile against field reports"
                >
                  <span>⚖️</span>
                  <span className="truncate">Nikshay Reconciler</span>
                </button>

                <button 
                  onClick={() => setShowJourneyModal(true)} 
                  className="bg-sky-600 hover:bg-sky-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                  title="Track complete longitudinal clinical pathway of any patient ID"
                >
                  <span>🔍</span>
                  <span className="truncate">Patient Journey</span>
                </button>

                <button 
                  onClick={() => {
                    fetchDuplicateAudit();
                    fetchDuplicateScan();
                    setShowDuplicateModal(true);
                  }} 
                  className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer relative" 
                  title="Cross-Officer Duplicate Patient ID Radar"
                >
                  <span>🛡️</span>
                  <span className="truncate">Duplicate Radar</span>
                  {((duplicateAudit?.total_duplicate_ids || 0) + (duplicateScanData?.total_inflated_count || 0)) > 0 && (
                    <span className="bg-rose-600 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black">
                      {(duplicateAudit?.total_duplicate_ids || 0) + (duplicateScanData?.total_inflated_count || 0)}
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => {
                    fetchCascadeAlerts();
                    setShowCascadeModal(true);
                  }} 
                  className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 animate-pulse cursor-pointer" 
                  title="Predictive Clinical Cascade & Patient Dropout Radar"
                >
                  <span>🚨</span>
                  <span className="truncate">Cascade Alerts</span>
                </button>
              </div>
            </div>

            {/* CLUSTER 2: 👥 STAFF OPERATIONS & TARGETS (4 cols on LG) */}
            <div className="lg:col-span-4 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-200/80 rounded-2xl p-3 flex flex-col justify-between space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 flex items-center gap-1">
                  <span>👥</span>
                  <span>Staff Ops &amp; Targets</span>
                </span>
                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100/70 px-1.5 py-0.2 rounded">4 Tools</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setActiveMainTab('staff_pacing')} 
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 relative cursor-pointer ${
                    activeMainTab === 'staff_pacing'
                      ? 'bg-amber-500 text-white shadow-amber-500/20 ring-2 ring-amber-300'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                  title="Open Staff Target Pacing, Forecasting & Comparison Studio"
                >
                  <span>🎯</span>
                  <span className="truncate">Staff Pacing</span>
                  {pacingStats.critical > 0 && (
                    <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse">
                      {pacingStats.critical}
                    </span>
                  )}
                </button>

                {canManageStaff && (
                  <button 
                    onClick={() => {
                      fetchStaffList();
                      setShowStaffSuite(true);
                    }} 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Manage Staff Members, Reset PINs & Export PIN Directory"
                  >
                    <span>👥</span>
                    <span className="truncate">Staff &amp; PINs</span>
                  </button>
                )}

                {canEditTargets && (
                  <button 
                    onClick={() => {
                      setTargetModalDistrict(selectedDistrict !== 'All' ? selectedDistrict : 'All');
                      loadTargets('All');
                      fetchDirectory();
                      setShowTargetModal(true);
                    }} 
                    className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                    title="Set Monthly Notification Targets for All Staff"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                    <span className="truncate">Set Targets</span>
                  </button>
                )}

                <button 
                  onClick={() => {
                    fetchAllBroadcasts();
                    setShowBroadcastStudio(true);
                  }} 
                  className="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 active:scale-95 relative cursor-pointer" 
                  title="Broadcast urgent alerts and notices to field staff and sub-admins"
                >
                  <span>📢</span>
                  <span className="truncate">Broadcasts</span>
                  {activeAdminBroadcasts.length > 0 && (
                    <span className="bg-rose-500 text-white px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse">
                      {activeAdminBroadcasts.length}
                    </span>
                  )}
                </button>

                <button 
                  onClick={() => {
                    const fallbackDist = selectedDistrict !== 'All' ? selectedDistrict : (availableDistrictsForFeed[0] || '');
                    setFeedDistrict(fallbackDist);
                    setFeedFoName(selectedFO !== 'All' ? selectedFO : '');
                    setFeedDate(new Date().toISOString().slice(0, 10));
                    setFeedCategoryInputs({});
                    setFeedRemarks('');
                    setFeedError('');
                    setFeedSuccess('');
                    setShowAdminFeedModal(true);
                  }} 
                  className="col-span-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-700 text-white px-2.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer" 
                  title="Feed or backfill patient IDs for any Field Officer on any date (Backdated / Current)"
                >
                  <span>📝</span>
                  <span className="truncate">Feed Field Officer IDs (Any Date)</span>
                </button>
              </div>
            </div>

            {/* CLUSTER 3 & 4: 📊 REPORTS & 🔐 GOVERNANCE (3 cols on LG) */}
            <div className="lg:col-span-3 flex flex-col gap-2.5">
              {/* Reports Studio High-Priority Box */}
              <button 
                onClick={() => setShowReportsStudio(true)} 
                className="w-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-700 hover:to-purple-800 text-white p-2.5 rounded-2xl text-xs font-black shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center justify-between cursor-pointer border border-indigo-400/30 group" 
                title="Open 5-in-1 Executive Reports & Export Studio"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base p-1 bg-white/20 rounded-lg group-hover:scale-110 transition-transform">📊</span>
                  <div className="text-left">
                    <span className="block font-black text-xs">Reports Studio</span>
                    <span className="block text-[10px] text-indigo-100 font-medium">5-in-1 DTO &amp; MIS Exports</span>
                  </div>
                </div>
                <span className="text-white/80 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              {/* Governance Cluster (Super Admin Only) */}
              {isSuperAdmin && (
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <span>🔐</span>
                      <span>Governance</span>
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">Admin</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button 
                      onClick={() => {
                        fetchAdminUsers();
                        setShowAdminUsersModal(true);
                      }} 
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer" 
                      title="Manage Admin & MIS Accounts, Permitted Districts and Permissions"
                    >
                      <span>👥</span>
                      <span className="truncate">Admins</span>
                    </button>
                    <button 
                      onClick={() => {
                        fetchAuditLogs();
                        setShowAuditModal(true);
                      }} 
                      className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer" 
                      title="View Audit Logs of all Target changes, ID edits, and Admin actions"
                    >
                      <span>📜</span>
                      <span className="truncate">Audit Trail</span>
                    </button>
                    <button 
                      onClick={() => {
                        fetchBackupStatus();
                        setShowBackupModal(true);
                      }} 
                      className="bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer" 
                      title="Automated Daily Cloud Backups & Disaster Recovery"
                    >
                      <span>💾</span>
                      <span className="truncate">Backups</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Active Broadcasts & Alert Bulletin */}
        {activeAdminBroadcasts && activeAdminBroadcasts.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            {activeAdminBroadcasts.map((b) => {
              const isHigh = b.priority === 'HIGH';
              const isMedium = b.priority === 'MEDIUM';
              const borderClass = isHigh ? 'border-rose-300 bg-rose-50/80 text-rose-950' : isMedium ? 'border-amber-300 bg-amber-50/80 text-amber-950' : 'border-indigo-200 bg-indigo-50/80 text-indigo-950';
              const badgeClass = isHigh ? 'bg-rose-600 text-white' : isMedium ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white';
              const icon = isHigh ? '🚨' : isMedium ? '⚠️' : '📢';
              const distLabel = b.target_districts?.includes('All') ? 'Statewide (All Districts)' : (b.target_districts || []).join(', ');

              return (
                <div key={b.id} className={`p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all ${borderClass}`}>
                  <div className="flex items-start gap-3.5 flex-1">
                    <div className="text-2xl mt-0.5 shrink-0 select-none">{icon}</div>
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeClass}`}>
                          {b.priority || 'MEDIUM'} NOTICE
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-white/80 border border-slate-200/60 px-2 py-0.5 rounded-md">
                          🎯 {b.target_audience === 'FIELD_STAFF' ? 'Field Staff' : b.target_audience === 'SUB_ADMINS' ? 'Sub-Admins' : 'All Team'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-white/80 border border-slate-200/60 px-2 py-0.5 rounded-md">
                          📍 {distLabel}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium ml-auto md:ml-0">
                          {b.created_at ? new Date(b.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <h4 className="text-sm font-black tracking-tight">{b.title}</h4>
                      <p className="text-xs font-medium leading-relaxed opacity-90 whitespace-pre-wrap">{b.message}</p>
                      <p className="text-[10px] font-bold opacity-60">Posted by: {b.created_by_user} ({b.created_by_role === 'SUPER_ADMIN' ? 'Super Admin' : 'Sub-Admin'})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    {(isSuperAdmin || b.created_by_user === currentUser?.username || b.created_by_user === currentUser?.name) && (
                      <button
                        onClick={() => handleDeleteBroadcast(b.id)}
                        className="bg-white/90 hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 flex items-center gap-1"
                        title="Delete Broadcast (instantly removes for all staff)"
                      >
                        <span>🗑️</span>
                        <span>Delete</span>
                      </button>
                    )}
                    <button
                      onClick={() => {
                        fetchAllBroadcasts();
                        setShowBroadcastStudio(true);
                      }}
                      className="bg-white/90 hover:bg-white text-slate-700 border border-slate-200/80 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 flex items-center gap-1"
                    >
                      <span>📢</span>
                      <span>Studio</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Primary Dashboard Navigation Tabs */}
        <div className="bg-white/95 backdrop-blur-md p-2 sm:p-2.5 rounded-2xl shadow-xs border border-slate-200/90 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 animate-fade-in">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveMainTab('overview')}
              className={`px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer ${
                activeMainTab === 'overview'
                  ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                  : 'bg-white hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
              }`}
            >
              <span>📊</span>
              <span>{isSuperAdmin ? 'Overview & State Analytics' : `Overview & District Analytics (${selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts || []).join(', ')})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMainTab('staff_pacing')}
              className={`px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 relative cursor-pointer ${
                activeMainTab === 'staff_pacing'
                  ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                  : 'bg-white hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
              }`}
            >
              <span>🎯</span>
              <span>Staff Pacing &amp; Peer Comparison</span>
              {pacingStats.critical > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full animate-pulse tabular-num">
                  {pacingStats.critical} At Risk
                </span>
              )}
            </button>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveMainTab('district_benchmarks')}
                className={`px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 active:scale-95 cursor-pointer ${
                  activeMainTab === 'district_benchmarks'
                    ? 'bg-teal-700 text-white shadow-sm shadow-teal-700/25 font-black'
                    : 'bg-white hover:bg-teal-50/70 text-slate-700 hover:text-teal-900 border border-slate-200/90 font-bold'
                }`}
              >
                <span>🏢</span>
                <span>District Benchmarks &amp; Pacing</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold text-teal-950 px-3 py-1.5 bg-teal-50/80 rounded-xl border border-teal-200/90 self-start md:self-auto tabular-num">
            <span>📅 {month}</span>
            <span className="text-teal-300">&bull;</span>
            <span>{workingDaysInfo.totalWorkingDays} Working Days ({workingDaysInfo.elapsedWorkingDays} Elapsed, {workingDaysInfo.remainingWorkingDays} Left)</span>
          </div>
        </div>

        {/* Tab 1: Overview & State Analytics */}
        {activeMainTab === 'overview' && (
          <>
            {/* Real-Time Live Activity Continuous Scrolling Marquee Ticker */}
            {filteredRecords.length > 0 && (() => {
              const recentActivity = filteredRecords.slice(-16).reverse();
              const tickerItems = [...recentActivity, ...recentActivity];

              return (
                <div className="bg-slate-900 text-white rounded-2xl px-3 py-2.5 sm:px-5 sm:py-3 shadow-md flex items-center gap-3 overflow-hidden border border-slate-800 animate-fade-in group relative select-none">
                  {/* Left Label & Live Indicator */}
                  <div className="flex items-center gap-2 shrink-0 z-20 bg-slate-900 pr-2 sm:pr-3 border-r border-slate-800">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Live Activity Feed</span>
                    <button
                      type="button"
                      onClick={() => setIsTickerPaused(prev => !prev)}
                      className="text-slate-400 hover:text-white text-[11px] p-1 rounded-md transition-colors ml-1"
                      title={isTickerPaused ? "Resume Live Auto-Scroll" : "Pause Live Auto-Scroll (or hover mouse to pause)"}
                    >
                      {isTickerPaused ? "▶️" : "⏸️"}
                    </button>
                  </div>

                  {/* Left edge gradient mask for seamless entry */}
                  <div className="pointer-events-none absolute left-36 sm:left-44 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900 to-transparent z-10"></div>

                  {/* Infinite Marquee Track */}
                  <div className="flex-1 overflow-hidden relative">
                    <div className={`animate-ticker flex items-center gap-8 ${isTickerPaused ? 'ticker-paused' : ''}`}>
                      {tickerItems.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs font-semibold shrink-0 bg-slate-800/80 hover:bg-indigo-900/60 transition-colors px-3 py-1.5 rounded-xl border border-slate-700/60 cursor-pointer"
                          onClick={() => {
                            setSelectedDistrict(r.working_place);
                            setSelectedFO(r.fo_name);
                          }}
                          title={`Click to filter by ${r.fo_name} (${r.working_place})`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                          <strong className="text-white tracking-tight">{r.fo_name}</strong>
                          <span className="text-slate-400 text-[10px] bg-slate-700/60 px-1.5 py-0.5 rounded-md font-mono">{r.working_place}</span>
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                            <span>📈</span> {r.notifications} Notif
                          </span>
                          <span className="text-slate-400 text-[11px] font-medium">&bull; {r.total_km} KM</span>
                          {r.tests > 0 && (
                            <span className="text-amber-300 text-[11px] font-medium">&bull; 🧪 {r.tests}</span>
                          )}
                          <span className="text-slate-500 text-[10px] ml-1">{r.date_of_reporting || r.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right edge gradient mask for seamless exit */}
                  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-900 to-transparent z-10"></div>
                </div>
              );
            })()}

        {/* Live Attendance Banner */}
        {attendance && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                  Today's Field Officer Attendance 
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{attendance.date}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span>Total Active FOs: <strong className="text-slate-700">{attendance.total_staff}</strong></span>
                  <span>| Submitted: <strong className="text-emerald-600">{attendance.submitted_count || (attendance.submitted_full_count + attendance.submitted_partial_count)}</strong></span>
                  <span>| Pending: <strong className="text-red-500">{attendance.missing_count}</strong></span>
                  <span>| On Leave: <strong className="text-amber-600">{attendance.on_leave_count || 0}</strong></span>
                  {chronicDefaulters.length > 0 && (
                    <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1 animate-pulse">
                      <span>⚠️</span> {chronicDefaulters.length} Inactive (2+ Days)
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                <button
                  onClick={() => { setActiveAttendanceTab('submitted'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Click to view submitted officers with time"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span>{attendance.submitted_count || (attendance.submitted_full_count + attendance.submitted_partial_count)} Submitted</span>
                </button>
                <button
                  onClick={() => { setActiveAttendanceTab('missing'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                  className="bg-red-50 hover:bg-red-100 text-red-700 px-3.5 py-1.5 rounded-xl border border-red-200 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Click to view pending officers"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span>{attendance.missing_count} Missing</span>
                </button>
                <button
                  onClick={() => { setActiveAttendanceTab('on_leave'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 px-3.5 py-1.5 rounded-xl border border-amber-200 flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
                  title="Click to view officers on leave or absent"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span>{attendance.on_leave_count || 0} On Leave / Absent</span>
                </button>
                {chronicDefaulters.length > 0 && (
                  <button
                    onClick={() => { setActiveAttendanceTab('defaulters'); setAttendanceDistrictFilter('All'); setAttendanceSearchQuery(''); setShowAttendanceModal(true); }}
                    className="bg-purple-50 hover:bg-purple-100 text-purple-800 px-3 py-1.5 rounded-xl border border-purple-200 flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                    title="View chronic defaulters (2+ consecutive days missed)"
                  >
                    <span>⚠️</span>
                    <span>{chronicDefaulters.length} Defaulters</span>
                  </button>
                )}
              </div>
              <button 
                onClick={() => { setAttendanceSearchQuery(''); setAttendanceDistrictFilter('All'); setShowAttendanceModal(true); }}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95 shadow-sm"
              >
                View Radar
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="w-full space-y-6 py-4 animate-fade-in">
            {/* Top Loading Header / Sync Pulse Indicator */}
            <div className="bg-white/85 backdrop-blur-md rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20 shrink-0">
                  <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <span>Synchronizing Bihar Field Records...</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-medium">Aggregating district targets, daily FDC dosages &amp; clinical rollups</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-black px-3 py-1.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse"></span>
                <span>Zero-Lag Cloud Stream Active</span>
              </div>
            </div>

            {/* 4 Skeleton KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-3 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-20 bg-slate-200 rounded-md"></div>
                    <div className="h-6 w-6 bg-slate-100 rounded-lg"></div>
                  </div>
                  <div className="h-7 w-28 bg-slate-300 rounded-lg"></div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-200 rounded-full w-2/3"></div>
                  </div>
                  <div className="flex justify-between">
                    <div className="h-2.5 w-12 bg-slate-200 rounded"></div>
                    <div className="h-2.5 w-16 bg-slate-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>

            {/* Main Table Skeleton */}
            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4 animate-pulse">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="h-4 w-40 bg-slate-200 rounded-md"></div>
                <div className="flex gap-2">
                  <div className="h-7 w-24 bg-slate-100 rounded-xl"></div>
                  <div className="h-7 w-24 bg-slate-100 rounded-xl"></div>
                </div>
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="flex items-center gap-4 py-2 border-b border-slate-50 last:border-0">
                    <div className="h-8 w-8 bg-slate-100 rounded-full shrink-0"></div>
                    <div className="h-4 w-32 bg-slate-200 rounded shrink-0"></div>
                    <div className="h-4 w-24 bg-slate-100 rounded shrink-0"></div>
                    <div className="h-4 flex-1 bg-slate-100 rounded hidden md:block"></div>
                    <div className="h-6 w-20 bg-slate-200 rounded-full shrink-0"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12 bg-rose-50 border border-rose-200 rounded-3xl p-6 space-y-3 shadow-sm max-w-xl mx-auto my-8">
            <span className="text-3xl">⚠️</span>
            <h3 className="text-base font-black text-rose-800">Unable to Load Dashboard Records</h3>
            <p className="text-xs font-semibold text-rose-600">{error}</p>
            <div className="pt-2 flex justify-center gap-3">
              <button 
                onClick={() => fetchData(true)} 
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow active:scale-95 flex items-center gap-1.5"
              >
                <span>🔄</span> Retry Loading
              </button>
              <button 
                onClick={() => {
                  localStorage.removeItem('dfy_admin_auth');
                  localStorage.removeItem('dfy_admin_token');
                  localStorage.removeItem('dfy_admin_user');
                  setIsAuthenticated(false);
                }} 
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95"
              >
                Re-login as Admin
              </button>
            </div>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-14 bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 sm:p-8 space-y-4 max-w-2xl mx-auto my-8">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-center text-2xl mx-auto">
              📂
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 mb-1">No Data Found For Selected Filters</h3>
              <p className="text-xs text-slate-500 font-medium">
                {rawRecords.length === 0
                  ? `There are no field reports recorded in the database for ${month}.`
                  : `There are ${rawRecords.length} total reports for ${month}, but none match District: "${selectedDistrict}" and Officer: "${selectedFO}".`}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {selectedDistrict !== 'All' && (
                <button 
                  onClick={() => { setSelectedDistrict('All'); setSelectedFO('All'); }}
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <span>🌐</span> View All Districts ({rawRecords.length} reports)
                </button>
              )}
              {month !== '2026-09' && (
                <button 
                  onClick={() => setMonth('2026-09')}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                >
                  <span>📅</span> Switch to September 2026 (59 Reports)
                </button>
              )}
              <button 
                onClick={() => fetchData(true)}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl border border-slate-200 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <span>🔄</span> Refresh
              </button>
            </div>
          </div>
        ) : (
          <>
            {selectedFO !== 'All' && (
                <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-3xl shadow-xl p-8 sm:p-10 text-white flex flex-col items-center justify-center relative overflow-hidden mb-8 animate-fade-in-down w-full border border-indigo-400/30">
                   <div className="absolute top-0 right-0 w-80 h-80 bg-white opacity-10 rounded-full -mt-20 -mr-20 pointer-events-none blur-3xl"></div>
                   <div className="absolute bottom-0 left-0 w-64 h-64 bg-black opacity-10 rounded-full -mb-20 -ml-20 pointer-events-none blur-3xl"></div>
                   
                   <div className="h-24 w-24 sm:h-28 sm:w-28 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-4xl sm:text-5xl font-black shadow-2xl border-4 border-white/40 shrink-0 uppercase mb-4 z-10 text-white drop-shadow-md">
                     {selectedFO.charAt(0)}
                   </div>
                   
                   <div className="text-center z-10 w-full">
                     <h2 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight drop-shadow-md">{selectedFO}</h2>
                     <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-8 bg-black/20 inline-block px-4 py-1.5 rounded-full border border-white/10 shadow-sm">{selectedDistrict} District</p>
                     
                     <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-sm font-semibold max-w-3xl mx-auto w-full mt-4">
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Days Active</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{filteredRecords.length}</span>
                       </span>
                       
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Total Travel</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{totals.total_km} <span className="text-sm sm:text-base font-bold opacity-70">KM</span></span>
                       </span>
                       
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Total Work</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{Object.values(totals).reduce((a,b)=>a+b, 0) - totals.total_km}</span>
                       </span>
                     </div>
                   </div>
                </div>
              )}

            {/* Executive 4-Card KPI Summary Strip */}
            {(() => {
              // 1. Target & Achievement for TB Notifications
              let scopedTarget = 0;
              if (selectedDistrict !== 'All') {
                scopedTarget = targetsData.filter(t => t.district === selectedDistrict).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
              } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                scopedTarget = targetsData.filter(t => currentUser.allowed_districts.includes(t.district)).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
              } else {
                scopedTarget = targetsData.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
              }
              const notifCount = totals.notifications || 0;
              const notifAchievedPct = scopedTarget > 0 ? ((notifCount / scopedTarget) * 100).toFixed(1) : null;
              
              // 2. Lab Testing & Yield
              const testsCount = totals.tests || 0;
              const presumptiveCount = totals.presumptive || 0;
              const testYieldPct = presumptiveCount > 0 ? ((testsCount / presumptiveCount) * 100).toFixed(1) : null;
              
              // 3. Core Clinical Interventions
              const hivDmCount = totals.hiv_dm || 0;
              const dbtCount = totals.dbt || 0;
              const contactsCount = totals.contact_tracing || 0;
              const clinicalTotal = hivDmCount + dbtCount + contactsCount;
              const clinicalCoveragePct = notifCount > 0 ? Math.min(100, Math.round((clinicalTotal / (notifCount * 3)) * 100)) : 0;

              // 4. Field Travel & Active Staff
              const totalKm = totals.total_km || 0;
              const activeStaffCount = new Set(filteredRecords.map(r => r.fo_name).filter(Boolean)).size;
              const avgKmPerStaff = activeStaffCount > 0 ? (totalKm / activeStaffCount).toFixed(1) : 0;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                  
                  {/* CARD 1: TB Notifications */}
                  <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden bg-white/95">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">TB Notifications</span>
                      <div className="flex items-center gap-1.5">
                        {notifAchievedPct !== null ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full tabular-num ${
                            Number(notifAchievedPct) >= 90 ? 'badge-emerald' : Number(notifAchievedPct) >= 60 ? 'badge-teal' : 'badge-amber'
                          }`}>
                            {notifAchievedPct}%
                          </span>
                        ) : null}
                        <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          📋
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">{notifCount.toLocaleString('en-IN')}</p>
                    {scopedTarget > 0 ? (
                      <div className="mt-2 space-y-1">
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${
                              Number(notifAchievedPct) >= 90 ? 'bg-emerald-500' : Number(notifAchievedPct) >= 60 ? 'bg-teal-600' : 'bg-amber-500'
                            }`} 
                            style={{ width: `${Math.min(100, Number(notifAchievedPct))}%` }}
                          ></div>
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate">
                          Target: <strong className="text-slate-700 font-bold">{scopedTarget.toLocaleString('en-IN')}</strong> • {Number(notifAchievedPct) >= 100 ? 'Target Achieved' : `${Math.max(0, scopedTarget - notifCount).toLocaleString('en-IN')} remaining`}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] font-semibold text-teal-800/90 mt-2 truncate">
                        Primary Clinical Notifications
                      </p>
                    )}
                  </div>

                  {/* CARD 2: UDST Lab Testing */}
                  <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden bg-white/95">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">UDST Lab Testing</span>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-indigo text-[10px] font-black px-2 py-0.5 rounded-full">
                          UDST
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          🔬
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">{testsCount.toLocaleString('en-IN')}</p>
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 rounded-full transition-all duration-700" 
                          style={{ width: `${Math.min(100, Number(testYieldPct || 0))}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate">
                        {testYieldPct !== null ? (
                          <>Yield: <strong className="text-blue-800 font-bold">{testYieldPct}%</strong> of {presumptiveCount.toLocaleString('en-IN')} Presumptive</>
                        ) : (
                          <>Presumptive cases: {presumptiveCount.toLocaleString('en-IN')}</>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* CARD 3: Core Clinical Cascade */}
                  <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden bg-white/95">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Clinical Cascade</span>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-teal text-[10px] font-black px-2 py-0.5 rounded-full">
                          Cascade
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          🩺
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">{clinicalTotal.toLocaleString('en-IN')}</p>
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-teal-600 rounded-full transition-all duration-700" 
                          style={{ width: `${Math.max(8, clinicalCoveragePct)}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate" title={`HIV/DM: ${hivDmCount} • DBT: ${dbtCount} • Contacts: ${contactsCount}`}>
                        HIV/DM: <strong className="text-slate-700 font-bold">{hivDmCount}</strong> • DBT: <strong className="text-slate-700 font-bold">{dbtCount}</strong> • Tracing: <strong className="text-slate-700 font-bold">{contactsCount}</strong>
                      </p>
                    </div>
                  </div>

                  {/* CARD 4: Field Footprint & Travel */}
                  <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all group relative overflow-hidden bg-white/95">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Field Travel</span>
                      <div className="flex items-center gap-1.5">
                        <span className="badge-amber text-[10px] font-black px-2 py-0.5 rounded-full">
                          {activeStaffCount} Staff
                        </span>
                        <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-sm font-black shrink-0 group-hover:scale-110 transition-transform">
                          🚗
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-num tracking-tight">
                      {totalKm.toLocaleString('en-IN')} <span className="text-xs font-bold text-slate-400 tracking-normal">KM</span>
                    </p>
                    <div className="mt-2 space-y-1">
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all duration-700" 
                          style={{ width: `${Math.min(100, Math.round((Number(avgKmPerStaff) / 500) * 100))}%` }}
                        ></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 tabular-num truncate">
                        Average <strong className="text-slate-700 font-bold">{avgKmPerStaff} KM</strong> per active Field Officer
                      </p>
                    </div>
                  </div>

                </div>
              );
            })()}

            {/* Secondary Metrics Grid */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xs border border-slate-200/80 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3.5">
                <h3 className="text-slate-800 text-xs sm:text-sm font-black flex items-center gap-2">
                  <span>⚡</span>
                  <span>Secondary Clinical &amp; Operational Indicators</span>
                </h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded-full">
                  12 Metrics
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2.5">
                {[
                  { k: 'hiv_dm', l: 'HIV & DM', icon: '🩸' }, { k: 'dbt', l: 'DBT', icon: '💰' }, { k: 'sample_collection', l: 'Sample Col', icon: '🧪' },
                  { k: 'outcome_assigned', l: 'Outcomes', icon: '🎯' }, { k: 'home_visits', l: 'Home Visits', icon: '🏠' }, { k: 'contact_tracing', l: 'Contact Tr', icon: '👥' },
                  { k: 'follow_ups', l: 'Follow Ups', icon: '🔄' }, { k: 'face_to_face', l: 'F2F', icon: '🗣️' }, { k: 'documents', l: 'Docs', icon: '📁' },
                  { k: 'fdc_provided', l: 'FDC Prov', icon: '💊' }, { k: 'kit_consumption', l: 'Kits', icon: '📦' }, { k: 'overrides', l: 'Overrides', icon: '⚠️' }
                ].map(metric => (
                  <div key={metric.k} className="p-2.5 bg-slate-50/80 hover:bg-white hover:border-slate-300 border border-slate-200/70 rounded-xl transition-all shadow-2xs hover:shadow-xs group text-center">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1 leading-tight flex items-center justify-center gap-1">
                      <span className="text-[10px]">{metric.icon}</span>
                      <span className="truncate">{metric.l}</span>
                    </p>
                    <p className="text-base sm:text-lg font-black text-slate-800 tabular-num group-hover:text-indigo-600 transition-colors">{totals[metric.k]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual Analytics Row: Daily Progression Trend & Bihar Top Performers Studio */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Option A: Day-by-Day Daily Progression Trend */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📈</span>
                        <h3 className="text-slate-800 font-black text-base">
                          Daily Progression Trend (Day 1 - {dailyTrendStats.totalDays})
                        </h3>
                      </div>
                      <p className="text-slate-400 text-xs font-semibold mt-0.5">
                        {selectedDistrict !== 'All' 
                          ? `Day-by-day progression for ${selectedDistrict}` 
                          : (isSubAdmin 
                              ? `Day-by-day progression for ${(currentUser?.allowed_districts || []).join(', ')}` 
                              : 'Day-by-day statewide performance progression across Bihar')}
                      </p>
                    </div>

                    {/* Metric Switcher */}
                    <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-[11px] font-bold">
                      {[
                        { key: 'notifications', label: '🔔 Notif' },
                        { key: 'tests', label: '🔬 Tests' },
                        { key: 'total_km', label: '🚗 KM' },
                        { key: 'presumptive', label: '🩺 Presump' }
                      ].map(m => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => setActiveMetric(m.key)}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            activeMetric === m.key
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trend Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Peak: {dailyTrendStats.peakDay.day !== '-' && dailyTrendStats.peakDay.value > 0 ? `Day ${Number(dailyTrendStats.peakDay.day)} (${dailyTrendStats.peakDay.value} ${activeMetric === 'total_km' ? 'KM' : 'IDs'})` : 'No Activity Yet'}
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      Daily Avg: {dailyTrendStats.avgDaily} / day
                    </span>
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 ml-auto">
                      Total: {dailyTrendStats.totalVal} {activeMetric === 'total_km' ? 'KM' : ''}
                    </span>
                  </div>
                </div>

                {/* AreaChart */}
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrendStats.chartData} margin={{ top: 5, right: 15, left: -15, bottom: 5 }}>
                      <defs>
                        <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="day" 
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                        axisLine={{ stroke: '#e2e8f0' }} 
                        tickLine={false}
                        interval={1}
                      />
                      <YAxis 
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                        labelFormatter={(day) => `Day ${day} (${month}-${String(day).padStart(2, '0')})`}
                        formatter={(val) => [val, activeMetric === 'total_km' ? 'KM Travelled' : activeMetric.toUpperCase()]}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#6366f1" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#trendGradient)" 
                        dot={{ r: 2, fill: '#6366f1' }}
                        activeDot={{ r: 5, fill: '#4338ca' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bihar Top Performers Studio */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-md border border-indigo-900/60 flex flex-col justify-between relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-teal-500/15 rounded-full blur-2xl pointer-events-none" />

                <div>
                  {/* Studio Header */}
                  <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏆</span>
                      <div>
                        <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                          Bihar Top Performers
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                            Statewide
                          </span>
                        </h3>
                        <p className="text-[10px] font-medium text-slate-400">Top 5 Champions (No RBAC Limit)</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowTopPerformersModal(true)}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-[11px] shadow-sm flex items-center gap-1 transition-all cursor-pointer active:scale-95 shrink-0"
                      title="Generate and Share High-Res Poster"
                    >
                      <span>📲</span>
                      <span>Share Poster</span>
                    </button>
                  </div>

                  {/* Period Pills Switcher */}
                  <div className="grid grid-cols-3 gap-1 bg-white/10 p-1 rounded-xl mb-3 text-[11px] font-black text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setTopPerformersPeriod('weekly');
                        fetchTopPerformers('weekly');
                      }}
                      className={`py-1 rounded-lg transition-all cursor-pointer ${
                        topPerformersPeriod === 'weekly'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopPerformersPeriod('fortnightly');
                        fetchTopPerformers('fortnightly');
                      }}
                      className={`py-1 rounded-lg transition-all cursor-pointer ${
                        topPerformersPeriod === 'fortnightly'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      15 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopPerformersPeriod('monthly');
                        fetchTopPerformers('monthly');
                      }}
                      className={`py-1 rounded-lg transition-all cursor-pointer ${
                        topPerformersPeriod === 'monthly'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Monthly
                    </button>
                  </div>

                  {/* Tab Selector: Districts vs Staff */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2 text-xs font-bold">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setTopPerformersTab('districts')}
                        className={`pb-1 text-[11px] uppercase tracking-wider font-black transition-colors cursor-pointer ${
                          topPerformersTab === 'districts'
                            ? 'text-teal-400 border-b-2 border-teal-400'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        🏛️ Top 5 Districts
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopPerformersTab('staff')}
                        className={`pb-1 text-[11px] uppercase tracking-wider font-black transition-colors cursor-pointer ${
                          topPerformersTab === 'staff'
                            ? 'text-purple-400 border-b-2 border-purple-400'
                            : 'text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        👤 Top 5 Staff
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      {topPerformersPeriod === 'weekly' ? '7 Days' : topPerformersPeriod === 'fortnightly' ? '15 Days' : 'Full Month'}
                    </span>
                  </div>

                  {/* List Content */}
                  <div className="space-y-1.5 min-h-[220px]">
                    {loadingTopPerformers ? (
                      <div className="flex items-center justify-center h-48 text-slate-400 text-xs gap-2">
                        <span className="animate-spin text-lg">🌀</span> Loading Champions...
                      </div>
                    ) : topPerformersTab === 'districts' ? (
                      /* Top 5 Districts */
                      (topPerformersData?.top_districts || []).length === 0 ? (
                        <div className="text-center py-10 text-xs text-slate-400">No district records found</div>
                      ) : (
                        (topPerformersData?.top_districts || []).slice(0, 5).map((dist, idx) => (
                          <div 
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                              idx === 0 
                                ? 'bg-amber-500/15 border-amber-500/30 text-amber-200' 
                                : 'bg-white/5 border-white/5 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-5 text-center text-xs font-black">
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                              </span>
                              <span className="font-bold text-xs text-white">{dist.district}</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-right font-mono">
                              <span className="text-teal-300 text-xs font-black">{dist.notifications} notifs</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-slate-300">
                                {dist.percentage}%
                              </span>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      /* Top 5 Staff */
                      (topPerformersData?.top_staff || []).length === 0 ? (
                        <div className="text-center py-10 text-xs text-slate-400">No staff records found</div>
                      ) : (
                        (topPerformersData?.top_staff || []).slice(0, 5).map((staff, idx) => (
                          <div 
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-xl border transition-all ${
                              idx === 0 
                                ? 'bg-purple-500/15 border-purple-500/30 text-purple-200' 
                                : 'bg-white/5 border-white/5 text-slate-200 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 text-center text-xs font-black shrink-0">
                                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                              </span>
                              <div className="truncate">
                                <div className="font-bold text-xs text-white truncate">{staff.fo_name}</div>
                                <div className="text-[9px] text-slate-400">{staff.district}</div>
                              </div>
                            </div>
                            <div className="text-right font-mono shrink-0">
                              <span className="text-purple-300 text-xs font-black">{staff.notifications} notifs</span>
                            </div>
                          </div>
                        ))
                      )
                    )}
                  </div>
                </div>

                {/* Bottom Quick Share Trigger */}
                <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                  <span>State TB Mission Bihar</span>
                  <button 
                    type="button"
                    onClick={() => setShowTopPerformersModal(true)}
                    className="text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                  >
                    Share Poster / Download Card →
                  </button>
                </div>
              </div>
            </div>

            {/* Unified Section: Target vs Achievement & Performance */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🏆</span>
                    <h3 className="text-slate-800 font-black text-lg">
                      Target vs Achievement &amp; Performance
                    </h3>
                    {selectedDistrict !== 'All' && (
                      <button
                        type="button"
                        onClick={() => setSelectedDistrict('All')}
                        className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                        title="Return to Statewide View"
                      >
                        ← View All Districts
                      </button>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs font-semibold mt-0.5">
                    {selectedDistrict === 'All'
                      ? (isSubAdmin 
                          ? `Performance monitoring for ${(currentUser?.allowed_districts || []).join(', ')} • Ranked by achievement` 
                          : `Statewide monitoring across 22 Bihar Districts • Ranked by achievement • Click any district to inspect field officers`)
                      : `Field Officer performance breakdown for ${selectedDistrict} • Click any officer to inspect details`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Metric Filter (when in chart view) */}
                  {performanceViewMode === 'chart' && (
                    <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setPerformanceMetricFilter('notif_only')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          performanceMetricFilter === 'notif_only'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>🔔</span> Notifications Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setPerformanceMetricFilter('target_vs_notif')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          performanceMetricFilter === 'target_vs_notif'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>🎯</span> Target vs Achieved
                      </button>
                      <button
                        type="button"
                        onClick={() => setPerformanceMetricFilter('pct_achieve')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                          performanceMetricFilter === 'pct_achieve'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>📈</span> % Achievement
                      </button>
                    </div>
                  )}

                  {/* View Switcher Toggle */}
                  <div className="flex items-center gap-1 bg-indigo-50/70 p-1 rounded-xl border border-indigo-200/60 text-xs font-black">
                    <button
                      type="button"
                      onClick={() => setPerformanceViewMode('chart')}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        performanceViewMode === 'chart'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-indigo-700 hover:bg-white/80'
                      }`}
                    >
                      <span>📊</span> Bar Chart
                    </button>
                    <button
                      type="button"
                      onClick={() => setPerformanceViewMode('cards')}
                      className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                        performanceViewMode === 'cards'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-indigo-700 hover:bg-white/80'
                      }`}
                    >
                      <span>🗂️</span> Grid Cards
                    </button>
                  </div>
                </div>
              </div>

              {/* Render View 1: Bar Chart */}
              {performanceViewMode === 'chart' && (
                <div>
                  <div style={{ height: `${performanceChartHeight}px` }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={performanceData}
                        margin={{ top: 5, right: 60, left: 15, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis 
                          type="number" 
                          tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }} 
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false} 
                        />
                        <YAxis 
                          type="category" 
                          dataKey="name" 
                          width={130} 
                          tick={{ fill: '#1e293b', fontSize: 12, fontWeight: 700 }} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }} 
                          contentStyle={{ 
                            borderRadius: '12px', 
                            border: 'none', 
                            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)', 
                            fontWeight: 'bold' 
                          }} 
                        />
                        <Legend wrapperStyle={{ fontWeight: 700, fontSize: '12px', color: '#64748b', paddingTop: '8px' }} />

                        {performanceMetricFilter === 'notif_only' && (
                          <Bar 
                            dataKey="notifications" 
                            name="TB Notifications" 
                            fill="#10b981" 
                            radius={[0, 6, 6, 0]}
                            onClick={(entry) => {
                              if (entry?.type === 'district' && entry?.name) {
                                setSelectedDistrict(entry.name);
                              } else if (entry?.type === 'officer' && entry?.name) {
                                setInspectingFO({ fo_name: entry.name, district: selectedDistrict });
                              }
                            }}
                            className="cursor-pointer hover:opacity-90"
                          >
                            <LabelList 
                              dataKey="notifications" 
                              position="right" 
                              style={{ fill: '#059669', fontWeight: 800, fontSize: 11 }} 
                              formatter={(v) => (v > 0 ? `${v}` : '')}
                            />
                          </Bar>
                        )}

                        {performanceMetricFilter === 'target_vs_notif' && (
                          <>
                            <Bar 
                              dataKey="notifications" 
                              name="Achieved Notifications" 
                              fill="#10b981" 
                              radius={[0, 6, 6, 0]}
                              onClick={(entry) => {
                                if (entry?.type === 'district' && entry?.name) {
                                setSelectedDistrict(entry.name);
                              } else if (entry?.type === 'officer' && entry?.name) {
                                setInspectingFO({ fo_name: entry.name, district: selectedDistrict });
                              }
                            }}
                            className="cursor-pointer"
                          >
                            <LabelList 
                              dataKey="notifications" 
                              position="right" 
                              style={{ fill: '#059669', fontWeight: 800, fontSize: 11 }} 
                              formatter={(v) => (v > 0 ? `${v}` : '')}
                            />
                          </Bar>
                          <Bar 
                            dataKey="target" 
                            name="Monthly Target" 
                            fill="#cbd5e1" 
                            radius={[0, 6, 6, 0]} 
                          >
                            <LabelList 
                              dataKey="target" 
                              position="right" 
                              style={{ fill: '#334155', fontWeight: 800, fontSize: 11 }} 
                              formatter={(v) => (v > 0 ? `${v}` : '')}
                            />
                          </Bar>
                        </>
                      )}

                      {performanceMetricFilter === 'pct_achieve' && (
                        <Bar 
                          dataKey="percentage" 
                          name="Target Completion (%)" 
                          fill="#6366f1" 
                          radius={[0, 6, 6, 0]}
                          onClick={(entry) => {
                            if (entry?.type === 'district' && entry?.name) {
                              setSelectedDistrict(entry.name);
                            } else if (entry?.type === 'officer' && entry?.name) {
                              setInspectingFO({ fo_name: entry.name, district: selectedDistrict });
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <LabelList 
                            dataKey="percentage" 
                            position="right" 
                            style={{ fill: '#4f46e5', fontWeight: 800, fontSize: 11 }} 
                            formatter={(v) => `${v}%`}
                          />
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Render View 2: Grid Cards */}
            {performanceViewMode === 'cards' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider justify-end">
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-100">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> &gt;=100% Target Complete
                  </span>
                  <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-100">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span> 50-99% In Progress
                  </span>
                  <span className="flex items-center gap-1 bg-red-50 text-red-700 px-2.5 py-1 rounded-lg border border-red-100">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span> &lt;50% Lagging
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {performanceData.map((row, idx) => {
                    const notifCount = row.notifications || 0;
                    const targetNum = row.target || 0;
                    const pct = row.percentage || 0;

                    let statusColor = "text-red-600 bg-red-50 border-red-200";
                    let barColor = "bg-red-500";
                    let statusText = "Lagging";

                    if (pct >= 100) {
                      statusColor = "text-emerald-700 bg-emerald-50 border-emerald-200";
                      barColor = "bg-emerald-500";
                      statusText = "Completed";
                    } else if (pct >= 50) {
                      statusColor = "text-amber-700 bg-amber-50 border-amber-200";
                      barColor = "bg-amber-400";
                      statusText = "In Progress";
                    }

                    return (
                      <div key={idx} className="bg-slate-50/70 p-4 rounded-xl border border-slate-100 hover:border-slate-200 transition-all">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 
                              onClick={() => {
                                if (row.type === 'district') {
                                  setSelectedDistrict(row.name);
                                } else {
                                  setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                                }
                              }}
                              className="text-sm font-black text-slate-800 truncate max-w-[180px] hover:text-indigo-600 hover:underline cursor-pointer"
                              title={row.type === 'district' ? "Click to filter to this district" : "Click to inspect officer"}
                            >
                              {row.name}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {notifCount} Notif / {targetNum} Target
                            </p>
                          </div>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                            {statusText} ({pct}%)
                          </span>
                        </div>

                        <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

                        {/* Target Pacing Forecaster & District Benchmarking */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Target Pacing Calculator */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                      <span>⚡</span> Target Pacing &amp; Forecaster
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">Run-rate needed for 100% monthly achievement</p>
                  </div>
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">
                    {selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? currentUser.allowed_districts.join(', ') : 'Statewide')}
                  </span>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const daysInMonth = 30;
                    const todayDate = new Date().getDate();
                    const daysRemaining = Math.max(1, daysInMonth - todayDate);
                    
                    let scopedTarget = 0;
                    if (selectedDistrict !== 'All') {
                      scopedTarget = targetsData.filter(t => t.district === selectedDistrict).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                      scopedTarget = targetsData.filter(t => currentUser.allowed_districts.includes(t.district)).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    } else {
                      scopedTarget = targetsData.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                    }
                    
                    const totalScopeNotif = totals.notifications || 0;
                    const pendingScopeNotif = Math.max(0, scopedTarget - totalScopeNotif);
                    const requiredDailyRate = (pendingScopeNotif / daysRemaining).toFixed(1);
                    const currentDailyRate = todayDate > 0 ? (totalScopeNotif / todayDate).toFixed(1) : 0;
                    const projectedTotal = Math.round(Number(currentDailyRate) * daysInMonth);
                    const projectedPct = scopedTarget > 0 ? Math.round((projectedTotal / scopedTarget) * 100) : 100;

                    return (
                      <>
                        <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex justify-between items-center">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Current Daily Pace</span>
                            <p className="text-xl font-black text-indigo-700">{currentDailyRate} <span className="text-xs font-bold text-indigo-500">Notif/Day</span></p>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Required Pace</span>
                            <p className="text-xl font-black text-slate-800">{requiredDailyRate} <span className="text-xs font-bold text-slate-500">Notif/Day</span></p>
                          </div>
                        </div>

                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">Scope Target &amp; Actual:</span>
                            <span className="font-black text-slate-800">{totalScopeNotif} / {scopedTarget} Notif</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">Month-End Projection:</span>
                            <span className="font-black text-indigo-600">{projectedTotal} Notifications ({projectedPct}%)</span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span className="text-slate-500">Days Remaining:</span>
                            <span className="text-slate-700">{daysRemaining} Days</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden mt-1">
                            <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, projectedPct)}%` }}></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* District Benchmarking Comparator (Super Admin Only) */}
              {isSuperAdmin && (
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                      <span>⚖️</span> District Benchmarking Comparator
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">Side-by-side performance &amp; percentage share</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={compareDistA} onChange={(e) => setCompareDistA(e.target.value)} className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none">
                      {districts.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <span className="text-xs font-black text-slate-400">vs</span>
                    <select value={compareDistB} onChange={(e) => setCompareDistB(e.target.value)} className="bg-purple-50 border border-purple-200 text-purple-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none">
                      {districts.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {(() => {
                  const recA = rawRecords.filter(r => r.working_place === compareDistA);
                  const recB = rawRecords.filter(r => r.working_place === compareDistB);
                  
                  const targetA = targetsData.filter(t => t.district === compareDistA).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                  const targetB = targetsData.filter(t => t.district === compareDistB).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                  
                  const notifA = recA.reduce((sum, r) => sum + (r.notifications || 0), 0);
                  const notifB = recB.reduce((sum, r) => sum + (r.notifications || 0), 0);
                  const achievePctA = targetA > 0 ? Math.round((notifA / targetA) * 100) : 0;
                  const achievePctB = targetB > 0 ? Math.round((notifB / targetB) * 100) : 0;

                  const testsA = recA.reduce((sum, r) => sum + (r.tests || 0), 0);
                  const testsB = recB.reduce((sum, r) => sum + (r.tests || 0), 0);

                  const presumpA = recA.reduce((sum, r) => sum + (r.presumptive || 0), 0);
                  const presumpB = recB.reduce((sum, r) => sum + (r.presumptive || 0), 0);
                  const convA = presumpA > 0 ? Math.round((testsA / presumpA) * 100) : 0;
                  const convB = presumpB > 0 ? Math.round((testsB / presumpB) * 100) : 0;

                  const dbtA = recA.reduce((sum, r) => sum + (r.dbt || 0), 0);
                  const dbtB = recB.reduce((sum, r) => sum + (r.dbt || 0), 0);
                  const kmA = recA.reduce((sum, r) => sum + (r.total_km || 0), 0);
                  const kmB = recB.reduce((sum, r) => sum + (r.total_km || 0), 0);

                  const metrics = [
                    { label: "Target Achievement", aVal: `${achievePctA}%`, bVal: `${achievePctB}%`, aSub: `${notifA}/${targetA}`, bSub: `${notifB}/${targetB}`, rawA: achievePctA, rawB: achievePctB },
                    { label: "Testing Yield / Conv.", aVal: `${convA}%`, bVal: `${convB}%`, aSub: `${testsA} tests`, bSub: `${testsB} tests`, rawA: convA, rawB: convB },
                    { label: "Notifications Volume", aVal: notifA, bVal: notifB, aSub: "Total Notif", bSub: "Total Notif", rawA: notifA, rawB: notifB },
                    { label: "DBT Processed", aVal: dbtA, bVal: dbtB, aSub: "Bank Seeded", bSub: "Bank Seeded", rawA: dbtA, rawB: dbtB }
                  ];

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-auto">
                      {metrics.map((m, idx) => {
                        const totalVal = (Number(m.rawA) || 0) + (Number(m.rawB) || 0);
                        const shareA = totalVal > 0 ? Math.round(((Number(m.rawA) || 0) / totalVal) * 100) : 50;
                        const shareB = 100 - shareA;
                        return (
                          <div key={idx} className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-center flex flex-col justify-between">
                            <span className="text-[10px] font-black uppercase text-slate-400 block mb-1.5">{m.label}</span>
                            
                            <div className="flex justify-between items-center text-xs font-black my-1">
                              <div className="text-left">
                                <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg block">{m.aVal}</span>
                                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{m.aSub}</span>
                              </div>
                              <span className="text-[10px] text-slate-300 font-bold px-1">vs</span>
                              <div className="text-right">
                                <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg block">{m.bVal}</span>
                                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{m.bSub}</span>
                              </div>
                            </div>

                            {/* Relative split bar */}
                            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex mt-2">
                              <div className="bg-indigo-500 h-full" style={{ width: `${shareA}%` }} title={`${compareDistA}: ${shareA}%`}></div>
                              <div className="bg-purple-500 h-full" style={{ width: `${shareB}%` }} title={`${compareDistB}: ${shareB}%`}></div>
                            </div>
                            <div className="flex justify-between text-[8px] font-black text-slate-400 mt-1">
                              <span>{shareA}%</span>
                              <span>{shareB}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              )}

            </div>

{/* Master Data Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/90 overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50/60">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <h3 className="text-slate-800 font-black text-sm sm:text-base flex items-center gap-2">
                      <span>📋</span>
                      <span>Detailed Master Table</span>
                      {selectedDistrict !== 'All' && (
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-md border border-indigo-200">
                          {selectedDistrict}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">Sorted by: <span className="font-bold text-indigo-600">{sortConfig.key} ({sortConfig.direction.toUpperCase()})</span> &bull; {tableData.length} records</p>
                  </div>

                  {selectedDistrict !== 'All' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDistrict('All');
                        setSelectedFO('All');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
                      title="Return to All Districts list"
                    >
                      <span>←</span> Back to All Districts
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Cohort Switcher */}
                  <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-2xs text-[11px] font-bold">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-wider px-2 hidden md:inline">Cohort:</span>
                    <button
                      type="button"
                      onClick={() => setMasterTableCohortFilter('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        masterTableCohortFilter === 'all'
                          ? 'bg-indigo-600 text-white shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Show all interventions conducted this month"
                    >
                      All (Total)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTableCohortFilter('current_cohort')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        masterTableCohortFilter === 'current_cohort'
                          ? 'bg-emerald-600 text-white shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Interventions conducted on patients notified in current month"
                    >
                      Current Month Cohort
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTableCohortFilter('backlog')}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        masterTableCohortFilter === 'backlog'
                          ? 'bg-amber-600 text-white shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title="Interventions conducted on patients notified in previous months (backlog)"
                    >
                      Previous Month Backlog
                    </button>
                  </div>

                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-white px-3 py-1.5 rounded-full shadow-2xs border border-slate-200/80 hidden sm:inline-block">
                    Click column header to sort
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    {/* Tier 1: Category Group Bands */}
                    <tr>
                      <th 
                        rowSpan={2}
                        className="p-3 sticky left-0 z-20 bg-slate-100/95 backdrop-blur-md border-r border-b border-slate-300 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.08)] text-slate-800 text-[11px] font-black uppercase tracking-wider align-bottom"
                      >
                        {selectedDistrict === 'All' ? 'District' : 'Officer Name'}
                      </th>
                      <th colSpan={2} className="th-band-primary py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider border-r border-teal-200/80">
                        Target &amp; Volume
                      </th>
                      <th colSpan={5} className="th-band-clinical py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider border-r border-indigo-200/80">
                        Core Clinical Cascade
                      </th>
                      <th colSpan={8} className="th-band-outreach py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider border-r border-amber-200/80">
                        Visits &amp; Field Logistics
                      </th>
                      <th colSpan={7} className="th-band-special py-2 px-3 text-center text-[10px] font-black uppercase tracking-wider">
                        Special Indicators
                      </th>
                    </tr>

                    {/* Tier 2: Column Headers */}
                    <tr className="bg-slate-50/90 text-slate-700 text-[10px] uppercase tracking-wider border-b border-slate-200">
                      <TH label="Target" sortKey="target" />
                      <TH label="Notif" sortKey="notifications" />
                      <TH label="Tests" sortKey="tests" />
                      <TH label="Presumptive" sortKey="presumptive" />
                      <TH label="Doc Visit" sortKey="doctor_visits" />
                      <TH label="HIV/DM" sortKey="hiv_dm" />
                      <TH label="DBT" sortKey="dbt" />
                      <TH label="Sample Col" sortKey="sample_collection" />
                      <TH label="Outcomes" sortKey="outcome_assigned" />
                      <TH label="Home Vis" sortKey="home_visits" />
                      <TH label="Contact Tr" sortKey="contact_tracing" />
                      <TH label="Follow Up" sortKey="follow_ups" />
                      <TH label="F2F" sortKey="face_to_face" />
                      <TH label="Docs" sortKey="documents" />
                      <TH label="FDC" sortKey="fdc_provided" />
                      <TH label="Kits" sortKey="kit_consumption" />
                      <TH label="Diff TB" sortKey="differentiated_tb" />
                      <TH label="TPT Start" sortKey="tpt_treatment_start" />
                      <TH label="TPT Presumptive" sortKey="tpt_presumptive" />
                      <TH label="Adhar Auth" sortKey="adhar_face_auth" />
                      <TH label="Consent" sortKey="consent_with_id" />
                      <TH label="Override" sortKey="overrides" />
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => (
                      <tr 
                        key={idx} 
                        className={`transition-colors border-b border-slate-100/90 last:border-none text-xs font-semibold text-slate-700 group ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                        } hover:bg-teal-50/60`}
                      >
                        <td 
                          onClick={() => {
                            if (selectedDistrict !== 'All') {
                              setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                            } else {
                              setSelectedDistrict(row.name);
                            }
                          }}
                          className={`p-3 sticky left-0 z-10 backdrop-blur-xs shadow-[4px_0_12px_-2px_rgba(0,0,0,0.07)] border-r border-slate-300/80 text-teal-800 hover:text-teal-950 font-black cursor-pointer group-hover:bg-teal-50/80 transition-colors ${
                            idx % 2 === 0 ? 'bg-white/95' : 'bg-slate-50/95'
                          }`}
                          title={selectedDistrict !== 'All' ? "Click to inspect all IDs" : "Click to view this district"}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{row.name}</span>
                            <span className="text-teal-500 text-[10px]">{selectedDistrict !== 'All' ? '🔍' : '➔'}</span>
                          </span>
                        </td>
                        <td className="p-3 tabular-num font-bold text-slate-800">{row.target}</td>
                        <td className="p-3 tabular-num font-bold text-emerald-600">{row.notifications}</td>
                        <td className="p-3 tabular-num font-bold text-blue-600">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.tests_cur > 0 ? row.tests_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.tests_prev > 0 ? row.tests_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.tests > 0 ? row.tests : <span className="text-slate-300 font-normal">—</span>}
                                {row.tests > 0 && (row.tests_cur > 0 || row.tests_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.tests_cur} | P:{row.tests_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-bold text-amber-600">
                          {row.presumptive > 0 ? row.presumptive : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-bold text-purple-600">
                          {row.doctor_visits > 0 ? row.doctor_visits : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.hiv_dm_cur > 0 ? row.hiv_dm_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.hiv_dm_prev > 0 ? row.hiv_dm_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.hiv_dm > 0 ? row.hiv_dm : <span className="text-slate-300 font-normal">—</span>}
                                {row.hiv_dm > 0 && (row.hiv_dm_cur > 0 || row.hiv_dm_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.hiv_dm_cur} | P:{row.hiv_dm_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.dbt_cur > 0 ? row.dbt_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.dbt_prev > 0 ? row.dbt_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.dbt > 0 ? row.dbt : <span className="text-slate-300 font-normal">—</span>}
                                {row.dbt > 0 && (row.dbt_cur > 0 || row.dbt_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.dbt_cur} | P:{row.dbt_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.sample_collection > 0 ? row.sample_collection : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.outcome_assigned > 0 ? row.outcome_assigned : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.home_visits_cur > 0 ? row.home_visits_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.home_visits_prev > 0 ? row.home_visits_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.home_visits > 0 ? row.home_visits : <span className="text-slate-300 font-normal">—</span>}
                                {row.home_visits > 0 && (row.home_visits_cur > 0 || row.home_visits_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.home_visits_cur} | P:{row.home_visits_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.contact_tracing_cur > 0 ? row.contact_tracing_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.contact_tracing_prev > 0 ? row.contact_tracing_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.contact_tracing > 0 ? row.contact_tracing : <span className="text-slate-300 font-normal">—</span>}
                                {row.contact_tracing > 0 && (row.contact_tracing_cur > 0 || row.contact_tracing_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.contact_tracing_cur} | P:{row.contact_tracing_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.follow_ups_cur > 0 ? row.follow_ups_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.follow_ups_prev > 0 ? row.follow_ups_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.follow_ups > 0 ? row.follow_ups : <span className="text-slate-300 font-normal">—</span>}
                                {row.follow_ups > 0 && (row.follow_ups_cur > 0 || row.follow_ups_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.follow_ups_cur} | P:{row.follow_ups_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.face_to_face > 0 ? row.face_to_face : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-semibold text-slate-700">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.documents_cur > 0 ? row.documents_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.documents_prev > 0 ? row.documents_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.documents > 0 ? row.documents : <span className="text-slate-300 font-normal">—</span>}
                                {row.documents > 0 && (row.documents_cur > 0 || row.documents_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.documents_cur} | P:{row.documents_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.fdc_provided > 0 ? row.fdc_provided : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-medium">
                          {row.kit_consumption > 0 ? row.kit_consumption : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-bold text-pink-600">
                          {masterTableCohortFilter === 'current_cohort'
                            ? (row.differentiated_tb_cur > 0 ? row.differentiated_tb_cur : <span className="text-slate-300 font-normal">—</span>)
                            : masterTableCohortFilter === 'backlog'
                            ? (row.differentiated_tb_prev > 0 ? row.differentiated_tb_prev : <span className="text-slate-300 font-normal">—</span>)
                            : (
                              <span>
                                {row.differentiated_tb > 0 ? row.differentiated_tb : <span className="text-slate-300 font-normal">—</span>}
                                {row.differentiated_tb > 0 && (row.differentiated_tb_cur > 0 || row.differentiated_tb_prev > 0) && (
                                  <span className="text-[9px] font-medium text-slate-400 block -mt-0.5">
                                    C:{row.differentiated_tb_cur} | P:{row.differentiated_tb_prev}
                                  </span>
                                )}
                              </span>
                            )}
                        </td>
                        <td className="p-3 tabular-num font-bold text-teal-600">
                          {row.tpt_treatment_start > 0 ? row.tpt_treatment_start : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-bold text-cyan-600">
                          {row.tpt_presumptive > 0 ? row.tpt_presumptive : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-bold text-orange-600">
                          {row.adhar_face_auth > 0 ? row.adhar_face_auth : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num font-bold text-indigo-500">
                          {row.consent_with_id > 0 ? row.consent_with_id : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                        <td className="p-3 tabular-num text-red-500 font-bold">
                          {row.overrides > 0 ? row.overrides : <span className="text-slate-300 font-normal">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100/95 border-t-2 border-slate-300 text-xs font-black text-slate-900 sticky bottom-0 z-10 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.06)]">
                    <tr>
                      <td className="p-3 sticky left-0 z-20 bg-slate-200/95 backdrop-blur-md border-r border-slate-300 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.1)] text-slate-900">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="tracking-wide">TOTAL</span>
                          <span className="text-[10px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-300">
                            {selectedDistrict === 'All' ? `${tableData.length} Dists` : `${tableData.length} Staff`}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-900">{tableTotals.target}</td>
                      <td className="p-3 tabular-num font-black text-emerald-700">{tableTotals.notifications}</td>
                      <td className="p-3 tabular-num font-black text-blue-700">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.tests_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.tests_prev
                          : (
                            <span>
                              {tableTotals.tests}
                              {(tableTotals.tests_cur > 0 || tableTotals.tests_prev > 0) && (
                                <span className="text-[9px] font-bold text-blue-900/60 block -mt-0.5">
                                  C:{tableTotals.tests_cur} | P:{tableTotals.tests_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-amber-700">{tableTotals.presumptive}</td>
                      <td className="p-3 tabular-num font-black text-purple-700">{tableTotals.doctor_visits}</td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.hiv_dm_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.hiv_dm_prev
                          : (
                            <span>
                              {tableTotals.hiv_dm}
                              {(tableTotals.hiv_dm_cur > 0 || tableTotals.hiv_dm_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.hiv_dm_cur} | P:{tableTotals.hiv_dm_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.dbt_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.dbt_prev
                          : (
                            <span>
                              {tableTotals.dbt}
                              {(tableTotals.dbt_cur > 0 || tableTotals.dbt_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.dbt_cur} | P:{tableTotals.dbt_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.sample_collection}</td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.outcome_assigned}</td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.home_visits_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.home_visits_prev
                          : (
                            <span>
                              {tableTotals.home_visits}
                              {(tableTotals.home_visits_cur > 0 || tableTotals.home_visits_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.home_visits_cur} | P:{tableTotals.home_visits_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.contact_tracing_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.contact_tracing_prev
                          : (
                            <span>
                              {tableTotals.contact_tracing}
                              {(tableTotals.contact_tracing_cur > 0 || tableTotals.contact_tracing_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.contact_tracing_cur} | P:{tableTotals.contact_tracing_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.follow_ups_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.follow_ups_prev
                          : (
                            <span>
                              {tableTotals.follow_ups}
                              {(tableTotals.follow_ups_cur > 0 || tableTotals.follow_ups_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.follow_ups_cur} | P:{tableTotals.follow_ups_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.face_to_face}</td>
                      <td className="p-3 tabular-num font-black text-slate-800">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.documents_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.documents_prev
                          : (
                            <span>
                              {tableTotals.documents}
                              {(tableTotals.documents_cur > 0 || tableTotals.documents_prev > 0) && (
                                <span className="text-[9px] font-bold text-slate-500 block -mt-0.5">
                                  C:{tableTotals.documents_cur} | P:{tableTotals.documents_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.fdc_provided}</td>
                      <td className="p-3 tabular-num font-bold text-slate-800">{tableTotals.kit_consumption}</td>
                      <td className="p-3 tabular-num font-black text-pink-700">
                        {masterTableCohortFilter === 'current_cohort'
                          ? tableTotals.differentiated_tb_cur
                          : masterTableCohortFilter === 'backlog'
                          ? tableTotals.differentiated_tb_prev
                          : (
                            <span>
                              {tableTotals.differentiated_tb}
                              {(tableTotals.differentiated_tb_cur > 0 || tableTotals.differentiated_tb_prev > 0) && (
                                <span className="text-[9px] font-bold text-pink-900/60 block -mt-0.5">
                                  C:{tableTotals.differentiated_tb_cur} | P:{tableTotals.differentiated_tb_prev}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td className="p-3 tabular-num font-black text-teal-700">{tableTotals.tpt_treatment_start}</td>
                      <td className="p-3 tabular-num font-black text-cyan-700">{tableTotals.tpt_presumptive}</td>
                      <td className="p-3 tabular-num font-black text-orange-700">{tableTotals.adhar_face_auth}</td>
                      <td className="p-3 tabular-num font-black text-indigo-700">{tableTotals.consent_with_id}</td>
                      <td className="p-3 tabular-num font-black text-red-600">{tableTotals.overrides}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </>
    )}

    {/* Tab 2: Staff Target Pacing & Peer Comparison Studio */}
    {activeMainTab === 'staff_pacing' && (
      <div className="space-y-6 animate-fade-in">
        {/* Calendar Status & Working Days Config Bar */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
              🎯
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                Staff Target Pacing &amp; Run-Rate Studio
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{month}</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Individual target velocity, expected vs actual run-rates, month-end forecast models &amp; head-to-head benchmarking.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 w-full md:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="text-slate-400 text-[10px] uppercase font-black tracking-wider">Sundays:</span>
              <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-800 font-mono">{workingDaysInfo.sundays}</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="text-slate-400 text-[10px] uppercase font-black tracking-wider">Declared Holidays:</span>
              <div className="inline-flex items-center bg-white rounded-lg border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleUpdatePacingHolidays(-1)}
                  className="px-2 py-0.5 text-slate-500 hover:text-indigo-600 font-black text-xs transition-colors cursor-pointer"
                  title="Decrease holiday buffer"
                >
                  -
                </button>
                <span className="px-2 text-indigo-700 font-black text-xs font-mono">{pacingHolidaysCount}</span>
                <button
                  type="button"
                  onClick={() => handleUpdatePacingHolidays(1)}
                  className="px-2 py-0.5 text-slate-500 hover:text-indigo-600 font-black text-xs transition-colors cursor-pointer"
                  title="Increase holiday buffer"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-black text-indigo-950 bg-indigo-100/70 px-3 py-1.5 rounded-lg border border-indigo-200">
              <span>{workingDaysInfo.totalWorkingDays} Working Days</span>
              <span className="text-indigo-400">&bull;</span>
              <span className="text-emerald-700">{workingDaysInfo.elapsedWorkingDays} Done</span>
              <span className="text-indigo-400">&bull;</span>
              <span className="text-amber-700">{workingDaysInfo.remainingWorkingDays} Left</span>
            </div>
          </div>
        </div>

        {/* Executive Pacing KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 text-xs font-black uppercase tracking-wider">
              <span>Active Officers</span>
              <span className="text-base">👥</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-slate-800">{pacingStats.totalStaff}</h4>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Field Staff Monitored</p>
            </div>
          </div>

          <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-2xl shadow-sm border border-emerald-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-700 text-xs font-black uppercase tracking-wider">
              <span>On Track / Ahead</span>
              <span className="text-base">🟢</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-emerald-800">
                {pacingStats.onTrack}
                <span className="text-xs font-bold ml-1.5 opacity-80 font-mono">
                  ({Math.round((pacingStats.onTrack / Math.max(1, pacingStats.totalStaff)) * 100)}%)
                </span>
              </h4>
              <p className="text-[11px] font-bold text-emerald-700 mt-1">Pacing &ge; 100% of Expected</p>
            </div>
          </div>

          <div className="bg-amber-50/70 p-4 sm:p-5 rounded-2xl shadow-sm border border-amber-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-amber-700 text-xs font-black uppercase tracking-wider">
              <span>Needs Push</span>
              <span className="text-base">🟡</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-amber-800">
                {pacingStats.watchlist}
                <span className="text-xs font-bold ml-1.5 opacity-80 font-mono">
                  ({Math.round((pacingStats.watchlist / Math.max(1, pacingStats.totalStaff)) * 100)}%)
                </span>
              </h4>
              <p className="text-[11px] font-bold text-amber-700 mt-1">75% - 99% of Expected Pace</p>
            </div>
          </div>

          <div className="bg-rose-50/70 p-4 sm:p-5 rounded-2xl shadow-sm border border-rose-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-700 text-xs font-black uppercase tracking-wider">
              <span>Critical Lag</span>
              <span className="text-base">🔴</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-rose-800">
                {pacingStats.critical}
                <span className="text-xs font-bold ml-1.5 opacity-80 font-mono">
                  ({Math.round((pacingStats.critical / Math.max(1, pacingStats.totalStaff)) * 100)}%)
                </span>
              </h4>
              <p className="text-[11px] font-bold text-rose-700 mt-1">&lt; 75% Pace (Action Needed)</p>
            </div>
          </div>

          <div className="bg-indigo-50/80 p-4 sm:p-5 rounded-2xl shadow-sm border border-indigo-200/80 col-span-2 lg:col-span-1 flex flex-col justify-between">
            <div className="flex items-center justify-between text-indigo-800 text-xs font-black uppercase tracking-wider">
              <span>Month-End Forecast</span>
              <span className="text-base">📈</span>
            </div>
            <div className="mt-3">
              <h4 className="text-2xl sm:text-3xl font-black text-indigo-950">
                {pacingStats.totalProjected}
                <span className="text-xs font-bold ml-1 text-indigo-700 font-mono">
                  / {pacingStats.totalTarget}
                </span>
              </h4>
              <p className={`text-[11px] font-black mt-1 ${pacingStats.totalProjected >= pacingStats.totalTarget ? 'text-emerald-700' : 'text-rose-600'}`}>
                {pacingStats.totalProjected >= pacingStats.totalTarget 
                  ? `✓ Target will exceed (+${pacingStats.totalProjected - pacingStats.totalTarget})`
                  : `⚠️ Deficit of ${pacingStats.totalTarget - pacingStats.totalProjected} notif`}
              </p>
            </div>
          </div>
        </div>

        {/* Dual Officer Head-to-Head Benchmark Comparator */}
        {staffPacingData.length >= 2 && (() => {
          const defaultA = comparatorOfficerA || staffPacingData[0]?.id;
          const defaultB = comparatorOfficerB || (staffPacingData[1]?.id !== defaultA ? staffPacingData[1]?.id : staffPacingData[0]?.id);
          const officerA = staffPacingData.find(s => s.id === defaultA) || staffPacingData[0];
          const officerB = staffPacingData.find(s => s.id === defaultB) || staffPacingData[1];

          if (!officerA || !officerB) return null;

          const notifLeader = officerA.achieved > officerB.achieved ? officerA : officerB.achieved > officerA.achieved ? officerB : null;
          const paceLeader = officerA.pacingPct > officerB.pacingPct ? officerA : officerB.pacingPct > officerA.pacingPct ? officerB : null;
          const dbtLeader = officerA.dbt > officerB.dbt ? officerA : officerB.dbt > officerA.dbt ? officerB : null;
          const testLeader = officerA.tests > officerB.tests ? officerA : officerB.tests > officerA.tests ? officerB : null;

          return (
            <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-100 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                    <span>⚔️</span> Dual Officer Head-to-Head Benchmark
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Compare any two officers side-by-side: run-rate velocity, clinical indicators &amp; 1-click WhatsApp coaching.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={defaultA}
                    onChange={(e) => setComparatorOfficerA(e.target.value)}
                    className="bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {staffPacingData.map(s => (
                      <option key={s.id} value={s.id}>Officer A: {s.name} ({s.district})</option>
                    ))}
                  </select>
                  <span className="text-xs font-black text-slate-400">VS</span>
                  <select
                    value={defaultB}
                    onChange={(e) => setComparatorOfficerB(e.target.value)}
                    className="bg-purple-50 border border-purple-200 text-purple-900 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {staffPacingData.map(s => (
                      <option key={s.id} value={s.id}>Officer B: {s.name} ({s.district})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Side-by-Side Comparison Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Officer A Card */}
                <div className="bg-indigo-50/40 p-5 rounded-2xl border border-indigo-100 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-indigo-600/20">
                        {officerA.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-800">{officerA.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-indigo-100 text-indigo-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                            {officerA.district}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold">{officerA.designation}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      officerA.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                      officerA.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}>
                      {officerA.status === 'ON_TRACK' ? '🟢 Ahead of Pace' : officerA.status === 'WATCHLIST' ? '🟡 Needs Push' : '🔴 Critical Lag'}
                    </span>
                  </div>

                  {/* Progress Bar with Expected Marker */}
                  <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-indigo-100/80">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Notifications: <strong className="text-indigo-700">{officerA.achieved}</strong> / {officerA.target}</span>
                      <span className="text-slate-500 font-mono">{officerA.targetAchievedPct}% achieved</span>
                    </div>
                    <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          officerA.status === 'ON_TRACK' ? 'bg-emerald-500' :
                          officerA.status === 'WATCHLIST' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (officerA.achieved / Math.max(1, officerA.target)) * 100)}%` }}
                      ></div>
                      {/* Milestone Marker for Expected Pace */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10"
                        style={{ left: `${Math.min(100, (officerA.expectedPace / Math.max(1, officerA.target)) * 100)}%` }}
                        title={`Expected pace today: ${officerA.expectedPace}`}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5">
                      <span>Expected today: <strong className="text-slate-700">{officerA.expectedPace}</strong></span>
                      <span>Target: <strong className="text-slate-700">{officerA.target}</strong></span>
                    </div>
                  </div>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Pacing Health</span>
                      <p className={`text-base font-black ${officerA.pacingPct >= 100 ? 'text-emerald-700' : officerA.pacingPct >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {officerA.pacingPct}%
                      </p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Daily Speed</span>
                      <p className="text-base font-black text-slate-800">{officerA.dailyVelocity} <span className="text-[10px] text-slate-400 font-normal">/day</span></p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-indigo-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Projected Total</span>
                      <p className={`text-base font-black ${officerA.surplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {officerA.projectedFinish}
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => copyCoachingMessage(officerA)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>💬</span>
                    <span>{copiedCoachingOfficer === officerA.id ? "✓ Copied Coaching Message!" : `Copy Coaching Text for ${officerA.name}`}</span>
                  </button>
                </div>

                {/* Officer B Card */}
                <div className="bg-purple-50/40 p-5 rounded-2xl border border-purple-100 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-purple-600/20">
                        {officerB.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-base font-black text-slate-800">{officerB.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase">
                            {officerB.district}
                          </span>
                          <span className="text-slate-400 text-xs font-semibold">{officerB.designation}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      officerB.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                      officerB.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-rose-100 text-rose-800 border border-rose-200'
                    }`}>
                      {officerB.status === 'ON_TRACK' ? '🟢 Ahead of Pace' : officerB.status === 'WATCHLIST' ? '🟡 Needs Push' : '🔴 Critical Lag'}
                    </span>
                  </div>

                  {/* Progress Bar with Expected Marker */}
                  <div className="space-y-1.5 bg-white p-3.5 rounded-xl border border-purple-100/80">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Notifications: <strong className="text-purple-700">{officerB.achieved}</strong> / {officerB.target}</span>
                      <span className="text-slate-500 font-mono">{officerB.targetAchievedPct}% achieved</span>
                    </div>
                    <div className="relative w-full h-3.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          officerB.status === 'ON_TRACK' ? 'bg-emerald-500' :
                          officerB.status === 'WATCHLIST' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (officerB.achieved / Math.max(1, officerB.target)) * 100)}%` }}
                      ></div>
                      {/* Milestone Marker for Expected Pace */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10"
                        style={{ left: `${Math.min(100, (officerB.expectedPace / Math.max(1, officerB.target)) * 100)}%` }}
                        title={`Expected pace today: ${officerB.expectedPace}`}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5">
                      <span>Expected today: <strong className="text-slate-700">{officerB.expectedPace}</strong></span>
                      <span>Target: <strong className="text-slate-700">{officerB.target}</strong></span>
                    </div>
                  </div>

                  {/* Metric Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Pacing Health</span>
                      <p className={`text-base font-black ${officerB.pacingPct >= 100 ? 'text-emerald-700' : officerB.pacingPct >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {officerB.pacingPct}%
                      </p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Daily Speed</span>
                      <p className="text-base font-black text-slate-800">{officerB.dailyVelocity} <span className="text-[10px] text-slate-400 font-normal">/day</span></p>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-purple-100/70">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">Projected Total</span>
                      <p className={`text-base font-black ${officerB.surplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {officerB.projectedFinish}
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    onClick={() => copyCoachingMessage(officerB)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black text-xs py-2.5 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>💬</span>
                    <span>{copiedCoachingOfficer === officerB.id ? "✓ Copied Coaching Message!" : `Copy Coaching Text for ${officerB.name}`}</span>
                  </button>
                </div>
              </div>

              {/* Comparative Clinical Summary Bar */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-around gap-4 text-xs font-bold text-slate-700">
                <div className="flex items-center gap-2">
                  <span>🏆 Notifications:</span>
                  <span className="text-indigo-700">{officerA.name} ({officerA.achieved})</span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-purple-700">{officerB.name} ({officerB.achieved})</span>
                  {notifLeader && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-black">{notifLeader.name} +{Math.abs(officerA.achieved - officerB.achieved)}</span>}
                </div>

                <div className="flex items-center gap-2">
                  <span>⚡ Pacing:</span>
                  <span className="text-indigo-700">{officerA.pacingPct}%</span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-purple-700">{officerB.pacingPct}%</span>
                  {paceLeader && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-black">{paceLeader.name} Leads</span>}
                </div>

                <div className="flex items-center gap-2">
                  <span>💳 DBT Seeded:</span>
                  <span className="text-indigo-700">{officerA.dbt}</span>
                  <span className="text-slate-400">vs</span>
                  <span className="text-purple-700">{officerB.dbt}</span>
                  {dbtLeader && <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-black">{dbtLeader.name} +{Math.abs(officerA.dbt - officerB.dbt)}</span>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Filter, Search & View Toolbar */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {districts.map(d => (
                <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>
              ))}
            </select>

            <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1 text-xs font-bold">
              <button
                onClick={() => setPacingFilterStatus('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${pacingFilterStatus === 'ALL' ? 'bg-white text-slate-800 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-800'}`}
              >
                All ({staffPacingData.length})
              </button>
              <button
                onClick={() => setPacingFilterStatus('ON_TRACK')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${pacingFilterStatus === 'ON_TRACK' ? 'bg-emerald-600 text-white shadow-2xs font-black' : 'text-emerald-700 hover:bg-emerald-50'}`}
              >
                <span>🟢</span> On Track ({pacingStats.onTrack})
              </button>
              <button
                onClick={() => setPacingFilterStatus('WATCHLIST')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${pacingFilterStatus === 'WATCHLIST' ? 'bg-amber-500 text-white shadow-2xs font-black' : 'text-amber-700 hover:bg-amber-50'}`}
              >
                <span>🟡</span> Needs Push ({pacingStats.watchlist})
              </button>
              <button
                onClick={() => setPacingFilterStatus('CRITICAL')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${pacingFilterStatus === 'CRITICAL' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-rose-700 hover:bg-rose-50'}`}
              >
                <span>🔴</span> Critical ({pacingStats.critical})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={pacingSearchQuery}
              onChange={(e) => setPacingSearchQuery(e.target.value)}
              placeholder="Search officer name..."
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 w-40 sm:w-48"
            />

            <select
              value={pacingSortConfig.key}
              onChange={(e) => setPacingSortConfig({ key: e.target.value, direction: e.target.value === 'name' ? 'asc' : 'desc' })}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="pacingPct">Sort: Pacing % (Fastest First)</option>
              <option value="achieved">Sort: Notifications Achieved</option>
              <option value="target">Sort: Highest Target</option>
              <option value="dailyVelocity">Sort: Daily Speed</option>
              <option value="projectedFinish">Sort: Month-End Forecast</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>

            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setPacingViewMode('matrix')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${pacingViewMode === 'matrix' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
                title="Matrix Table View"
              >
                📊 Table
              </button>
              <button
                type="button"
                onClick={() => setPacingViewMode('cards')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${pacingViewMode === 'cards' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500'}`}
                title="Visual Cards View"
              >
                🎴 Cards
              </button>
            </div>
          </div>
        </div>

        {/* Pacing Matrix: Table View */}
        {pacingViewMode === 'matrix' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                    <th className="p-3.5 sticky left-0 bg-slate-50 z-10">Officer &amp; District</th>
                    <th className="p-3.5 text-center">Target</th>
                    <th className="p-3.5 text-center">Expected Pace</th>
                    <th className="p-3.5 text-center">Achieved</th>
                    <th className="p-3.5 min-w-[170px]">Pacing Velocity Tracker</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-center">Speed / Day</th>
                    <th className="p-3.5 text-center">Needed / Day</th>
                    <th className="p-3.5 text-center">Projected Finish</th>
                    <th className="p-3.5 text-center">Active Days</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredStaffPacing.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-12 text-slate-400 font-bold">
                        No officers found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredStaffPacing.map((s, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="p-3.5 sticky left-0 bg-white shadow-2xs font-bold">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-xs font-black">
                              {s.name.charAt(0)}
                            </span>
                            <div>
                              <span className="text-slate-800 font-black block">{s.name}</span>
                              <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded-md">
                                {s.district}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center font-bold text-slate-600">{s.target}</td>
                        <td className="p-3.5 text-center font-bold text-slate-500">{s.expectedPace}</td>
                        <td className="p-3.5 text-center font-black text-slate-800">
                          {s.achieved}
                          <span className="text-[10px] text-slate-400 font-normal block font-mono">({s.targetAchievedPct}%)</span>
                        </td>
                        <td className="p-3.5">
                          {/* Triple-Milestone Pacing Bar */}
                          <div className="space-y-1">
                            <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  s.status === 'ON_TRACK' ? 'bg-emerald-500' :
                                  s.status === 'WATCHLIST' ? 'bg-amber-500' :
                                  'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, (s.achieved / Math.max(1, s.target)) * 100)}%` }}
                              ></div>
                              {/* Expected marker line */}
                              <div
                                className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10 -mt-0.5"
                                style={{ left: `${Math.min(100, (s.expectedPace / Math.max(1, s.target)) * 100)}%` }}
                                title={`Expected pace today: ${s.expectedPace}`}
                              ></div>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-mono">
                              <span>Pace: {s.pacingPct}%</span>
                              <span>Target: {s.target}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            s.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                            s.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            {s.status === 'ON_TRACK' ? '🟢 Ahead' : s.status === 'WATCHLIST' ? '🟡 Watchlist' : '🔴 Critical'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-bold font-mono text-slate-700">
                          {s.dailyVelocity}
                        </td>
                        <td className="p-3.5 text-center font-bold font-mono">
                          <span className={Number(s.requiredRecoveryRate) > Number(s.targetDailyRate) * 1.5 ? 'text-rose-600 font-black' : 'text-slate-700'}>
                            {s.requiredRecoveryRate}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`font-black text-xs ${s.surplus >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {s.projectedFinish}
                          </span>
                          <span className={`text-[9px] font-bold block ${s.surplus >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {s.surplus >= 0 ? `+${s.surplus}` : `${s.surplus}`}
                          </span>
                        </td>
                        <td className="p-3.5 text-center text-xs font-semibold text-slate-600">
                          {s.activeDaysCount} / {workingDaysInfo.elapsedWorkingDays}
                          <span className="text-[10px] text-slate-400 block font-mono">({s.consistencyPct}%)</span>
                        </td>
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setComparatorOfficerA(s.id);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                            title="Compare in Head-to-Head Benchmarking"
                          >
                            ⚔️ Compare
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectingFO({ fo_name: s.name, district: s.district })}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                            title="Inspect Patient IDs"
                          >
                            🔍 IDs
                          </button>
                          <button
                            type="button"
                            onClick={() => copyCoachingMessage(s)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                            title="Copy WhatsApp Coaching Message"
                          >
                            {copiedCoachingOfficer === s.id ? "✓ Copied!" : "💬 Coach"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pacing Matrix: Cards View */}
        {pacingViewMode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStaffPacing.length === 0 ? (
              <div className="col-span-full text-center py-16 bg-white rounded-3xl border border-slate-100 text-slate-400 font-bold">
                No officers found matching your filters.
              </div>
            ) : (
              filteredStaffPacing.map((s, idx) => (
                <div
                  key={idx}
                  className={`bg-white p-5 rounded-3xl shadow-sm border transition-all hover:shadow-md space-y-4 ${
                    s.status === 'ON_TRACK' ? 'border-emerald-200/80 hover:border-emerald-300' :
                    s.status === 'WATCHLIST' ? 'border-amber-200/80 hover:border-amber-300' :
                    'border-rose-200/80 hover:border-rose-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base text-white shadow-sm ${
                        s.status === 'ON_TRACK' ? 'bg-emerald-600' :
                        s.status === 'WATCHLIST' ? 'bg-amber-500' :
                        'bg-rose-600'
                      }`}>
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-800">{s.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="bg-indigo-50 text-indigo-700 text-[9px] font-black px-2 py-0.5 rounded-md uppercase">
                            {s.district}
                          </span>
                          <span className="text-slate-400 text-[11px] font-semibold">{s.designation}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                      s.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800' :
                      s.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {s.status === 'ON_TRACK' ? '🟢 Ahead' : s.status === 'WATCHLIST' ? '🟡 Watchlist' : '🔴 Critical'}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-600">Notifications: <strong className="text-slate-800">{s.achieved}</strong> / {s.target}</span>
                      <span className="text-slate-500 font-mono">{s.targetAchievedPct}%</span>
                    </div>
                    <div className="relative w-full h-2.5 bg-slate-200/80 rounded-full overflow-visible">
                      <div
                        className={`h-full rounded-full transition-all ${
                          s.status === 'ON_TRACK' ? 'bg-emerald-500' :
                          s.status === 'WATCHLIST' ? 'bg-amber-500' :
                          'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, (s.achieved / Math.max(1, s.target)) * 100)}%` }}
                      ></div>
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10 -mt-0.5"
                        style={{ left: `${Math.min(100, (s.expectedPace / Math.max(1, s.target)) * 100)}%` }}
                        title={`Expected pace today: ${s.expectedPace}`}
                      ></div>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-0.5 font-mono">
                      <span>Expected: {s.expectedPace}</span>
                      <span>Health: {s.pacingPct}%</span>
                    </div>
                  </div>

                  {/* Key Stats Chips */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Speed</span>
                      <p className="font-bold text-slate-800 font-mono">{s.dailyVelocity}/d</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Needed</span>
                      <p className="font-bold text-amber-700 font-mono">{s.requiredRecoveryRate}/d</p>
                    </div>
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[9px] font-black uppercase text-slate-400 block">Forecast</span>
                      <p className={`font-black font-mono ${s.surplus >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {s.projectedFinish}
                      </p>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setComparatorOfficerA(s.id);
                        window.scrollTo({ top: 400, behavior: 'smooth' });
                      }}
                      className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold py-2 rounded-xl transition-colors text-center"
                    >
                      ⚔️ Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => copyCoachingMessage(s)}
                      className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold py-2 rounded-xl transition-colors text-center"
                    >
                      {copiedCoachingOfficer === s.id ? "✓ Copied" : "💬 Coach"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    )}

    {/* Tab 3: District Benchmarks & Pacing Matrix */}
    {activeMainTab === 'district_benchmarks' && (
      <div className="space-y-6 animate-fade-in">
        {/* District Summary Bar */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-2xl shadow-inner shrink-0">
              🏢
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2">
                District Benchmarks &amp; Target Pacing Matrix
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{month}</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Comparative district pacing run-rates, target deficit/surplus forecasts &amp; state percentile rankings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-black text-indigo-950 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
            <span>{districtPacingData.length} Districts Analyzed</span>
            <span>&bull;</span>
            <span className="text-emerald-700">{districtPacingData.filter(d => d.status === 'ON_TRACK').length} On Track</span>
            <span>&bull;</span>
            <span className="text-rose-700">{districtPacingData.filter(d => d.status === 'CRITICAL').length} Critical</span>
          </div>
        </div>

        {/* District Pacing Table */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                  <th className="p-3.5 sticky left-0 bg-slate-50 z-10">District Name</th>
                  <th className="p-3.5 text-center">Staff Count</th>
                  <th className="p-3.5 text-center">District Target</th>
                  <th className="p-3.5 text-center">Expected Pace</th>
                  <th className="p-3.5 text-center">Achieved</th>
                  <th className="p-3.5 min-w-[160px]">Pacing Velocity Tracker</th>
                  <th className="p-3.5 text-center">Pacing Health</th>
                  <th className="p-3.5 text-center">Daily Speed</th>
                  <th className="p-3.5 text-center">Needed / Day</th>
                  <th className="p-3.5 text-center">Month-End Forecast</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {districtPacingData.map((d, idx) => (
                  <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="p-3.5 sticky left-0 bg-white shadow-2xs font-black text-indigo-950">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center text-[10px] font-black font-mono">
                          {idx + 1}
                        </span>
                        <span>{d.district}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-center text-slate-600 font-bold">{d.staffCount} FOs</td>
                    <td className="p-3.5 text-center font-bold text-slate-600">{d.target}</td>
                    <td className="p-3.5 text-center font-bold text-slate-500">{d.expectedPace}</td>
                    <td className="p-3.5 text-center font-black text-slate-800">
                      {d.achieved}
                      <span className="text-[10px] text-slate-400 font-normal block font-mono">({d.targetAchievedPct}%)</span>
                    </td>
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="relative w-full h-2.5 bg-slate-100 rounded-full overflow-visible border border-slate-200">
                          <div
                            className={`h-full rounded-full transition-all ${
                              d.status === 'ON_TRACK' ? 'bg-emerald-500' :
                              d.status === 'WATCHLIST' ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, (d.achieved / Math.max(1, d.target)) * 100)}%` }}
                          ></div>
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-slate-800 rounded-full z-10 -mt-0.5"
                            style={{ left: `${Math.min(100, (d.expectedPace / Math.max(1, d.target)) * 100)}%` }}
                            title={`Expected pace today: ${d.expectedPace}`}
                          ></div>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 font-semibold font-mono">
                          <span>Pace: {d.pacingPct}%</span>
                          <span>Target: {d.target}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                        d.status === 'ON_TRACK' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                        d.status === 'WATCHLIST' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {d.status === 'ON_TRACK' ? '🟢 Ahead' : d.status === 'WATCHLIST' ? '🟡 Watchlist' : '🔴 Critical'}
                      </span>
                    </td>
                    <td className="p-3.5 text-center font-bold font-mono text-slate-700">{d.dailyVelocity}</td>
                    <td className="p-3.5 text-center font-bold font-mono text-amber-700">{d.requiredRecoveryRate}</td>
                    <td className="p-3.5 text-center">
                      <span className={`font-black text-xs ${d.surplus >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {d.projectedFinish}
                      </span>
                      <span className={`text-[9px] font-bold block ${d.surplus >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {d.surplus >= 0 ? `+${d.surplus}` : `${d.surplus}`}
                      </span>
                    </td>
                    <td className="p-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDistrict(d.district);
                          setActiveMainTab('staff_pacing');
                        }}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Drilldown Staff ➔
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
      </div>

      {/* Branding Footer */}
      <footer className="w-full text-center py-8 mt-auto opacity-70">
        <p className="text-sm font-bold text-slate-500 tracking-widest uppercase">
          Designed by <span className="text-indigo-600 font-black">Insomniac</span>
        </p>
      </footer>

                  {/* Admin Security Settings Modal */}
      {showSecurityModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>⚙️</span> Admin Security & Password Settings
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Credential Management & Password Security</p>
              </div>
              <button onClick={() => setShowSecurityModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Change Password Form */}
            <form onSubmit={handleUpdatePassword} className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Change Master Password</h4>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Current Password</label>
                <input
                  type="password"
                  value={changeCurrentPw}
                  onChange={(e) => setChangeCurrentPw(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">New Password</label>
                <input
                  type="password"
                  value={changeNewPw}
                  onChange={(e) => setChangeNewPw(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {securityStatusMsg && (
                <p className={`text-xs font-bold p-2.5 rounded-xl border ${securityStatusMsg.includes('✓') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                  {securityStatusMsg}
                </p>
              )}

              <div className="pt-3 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowSecurityModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Close</button>
                <button
                  type="submit"
                  disabled={isSavingSecurity}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all"
                >
                  {isSavingSecurity ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

                              {/* 🚨 Predictive Clinical Cascade & Dropout Radar Modal */}
      {showCascadeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in">
            
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0">
                  🚨
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">Predictive Clinical Cascade &amp; Dropout Radar</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    {cascadeData.summary.total_notified || 0} Total Notified Patients &bull; {month}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowCascadeModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none self-end sm:self-center">&times;</button>
            </div>

            {/* Quick KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 my-3">
              <div className="bg-rose-50 border border-rose-100 p-3 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase text-rose-500 block">High Risk (2+ Missing)</span>
                <p className="text-xl font-black text-rose-700">{cascadeData.summary.high_risk_count || 0}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 p-3 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase text-purple-600 block">HIV / DM Missing</span>
                <p className="text-xl font-black text-purple-700">{cascadeData.summary.hiv_pending || 0}</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase text-amber-600 block">DBT Bank Pending</span>
                <p className="text-xl font-black text-amber-700">{cascadeData.summary.dbt_pending || 0}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase text-blue-600 block">Contact Tracing</span>
                <p className="text-xl font-black text-blue-700">{cascadeData.summary.contact_pending || 0}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase text-emerald-600 block">UDST / Testing</span>
                <p className="text-xl font-black text-emerald-700">{cascadeData.summary.udst_pending || 0}</p>
              </div>
              <div className="bg-pink-50 border border-pink-100 p-3 rounded-2xl text-center">
                <span className="text-[10px] font-black uppercase text-pink-600 block">Diff TB Care</span>
                <p className="text-xl font-black text-pink-700">{cascadeData.summary.diff_tb_pending || 0}</p>
              </div>
            </div>

            {/* Action Bar: District Filter, Risk Filter & Export */}
            <div className="py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <select
                  value={cascadeFilterDist}
                  onChange={(e) => {
                    setCascadeFilterDist(e.target.value);
                  }}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="All">All Districts</option>
                  {districts.filter(d => d !== 'All').map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <select
                  value={cascadeRiskFilter}
                  onChange={(e) => setCascadeRiskFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="All">All Alerts</option>
                  <option value="HIGH">🔴 High Risk Only (2+ Missing)</option>
                  <option value="MEDIUM">🟡 Medium Risk</option>
                  <option value="HIV">🧪 HIV &amp; DM Missing</option>
                  <option value="DBT">💳 DBT Missing Only</option>
                  <option value="CONTACT">👥 Contact Tracing Missing</option>
                  <option value="UDST">🔬 UDST Testing Missing</option>
                  <option value="DIFF_TB">🩺 Diff TB Care Missing</option>
                  <option value="PRESUMPTIVE">🔍 Presumptive Not Tested</option>
                </select>

                <button
                  onClick={fetchCascadeAlerts}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                >
                  <span>🔄</span> Refresh
                </button>
              </div>

              <a
                href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-cascade-alerts?month=${month}&district=${cascadeFilterDist}&token=${getAdminToken()}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md shadow-rose-600/20 active:scale-95 transition-all flex items-center gap-1.5"
              >
                <span>📥</span> Export Dropout Action Sheet (.xlsx)
              </a>
            </div>

            {/* Patients Dropout Alerts Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-2 pr-1">
              {loadingCascade ? (
                <div className="text-center py-16 text-slate-400 font-bold text-xs flex flex-col items-center justify-center gap-2">
                  <span className="animate-spin text-2xl">⏳</span>
                  <span>Scanning patient clinical cascades...</span>
                </div>
              ) : (() => {
                const filteredAlerts = (cascadeData.alerts || []).filter(a => {
                  if (cascadeFilterDist !== 'All' && a.district !== cascadeFilterDist) return false;
                  if (cascadeRiskFilter === 'HIGH' && a.risk_level !== 'HIGH') return false;
                  if (cascadeRiskFilter === 'MEDIUM' && a.risk_level !== 'MEDIUM') return false;
                  if (cascadeRiskFilter === 'HIV' && a.has_hiv) return false;
                  if (cascadeRiskFilter === 'DBT' && a.has_dbt) return false;
                  if (cascadeRiskFilter === 'CONTACT' && a.has_contact) return false;
                  if (cascadeRiskFilter === 'UDST' && a.has_udst) return false;
                  if (cascadeRiskFilter === 'DIFF_TB' && a.has_diff_tb) return false;
                  if (cascadeRiskFilter === 'PRESUMPTIVE' && a.cascade_type !== 'Presumptive') return false;
                  return true;
                });

                if (filteredAlerts.length === 0) {
                  return (
                    <div className="text-center py-16 text-slate-400 font-bold text-xs">
                      🎉 Koi clinical dropout alert nahi hai! Sabhi patients ke interventions linked hain.
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-100">
                        <th className="p-3">Patient ID</th>
                        <th className="p-3">District &amp; FO</th>
                        <th className="p-3">Notification Date</th>
                        <th className="p-3">Days Elapsed</th>
                        <th className="p-3">Pending Interventions</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredAlerts.map((a, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/20 transition-colors">
                          <td className="p-3 font-mono font-black text-slate-800">
                            <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">{a.id}</span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-indigo-700 block">{a.district}</span>
                            <span className="text-[11px] text-slate-400">{a.fo_name}</span>
                          </td>
                          <td className="p-3 text-slate-500 font-medium">{a.notified_date || 'N/A'}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${a.days_elapsed > 7 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                              {a.days_elapsed} Days Ago
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {a.missing_actions.map((act, actIdx) => (
                                <span key={actIdx} className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                  {act}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => {
                                const msg = `*URGENT CASCADE ACTION REQUIRED* 🚨\nPatient ID: *${a.id}*\nDistrict: ${a.district} (${a.fo_name})\nNotified: ${a.notified_date}\nPending: ${a.missing_actions.join(', ')}\nKripya is patient ka urgent follow-up karein!`;
                                if (navigator.clipboard) {
                                  navigator.clipboard.writeText(msg);
                                  alert("Alert message copied for WhatsApp!");
                                }
                              }}
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors border border-emerald-200"
                              title="Copy WhatsApp Alert message for Field Officer"
                            >
                              📱 Alert FO
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 font-semibold">
              <span>Tip: High Risk patients wo hain jinme 2 ya usse zyada clinical interventions missing hain.</span>
              <button onClick={() => setShowCascadeModal(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-5 rounded-xl transition-all">Close Radar</button>
            </div>

          </div>
        </div>
      )}

{/* 👥 Staff & PIN Management Suite Modal */}
      {showStaffSuite && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-4xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
            
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl font-black shrink-0">
                  👥
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">Field Staff &amp; PIN Management Suite</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{staffList.filter(s => s.is_active !== false && s.status !== 'inactive').length} Active Officers ({staffList.length} Total) across {districts.filter(d => d !== 'All').length} Districts</p>
                </div>
              </div>
              <button onClick={() => setShowStaffSuite(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none self-end sm:self-center cursor-pointer">&times;</button>
            </div>

            {/* Action Bar: District Filter, Search & Exports */}
            <div className="py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                <select
                  value={staffFilterDistrict}
                  onChange={(e) => setStaffFilterDistrict(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Districts ({staffList.length})</option>
                  {districts.filter(d => d !== 'All').map(d => (
                    <option key={d} value={d}>{d} ({staffList.filter(s => s.district === d).length})</option>
                  ))}
                </select>

                <input
                  type="text"
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  placeholder="Search officer name or PIN..."
                  className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-[150px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAddStaffModal({ district: staffFilterDistrict !== 'All' ? staffFilterDistrict : (districts.filter(d => d !== 'All')[0] || 'Jamui'), name: '', pin: String(Math.floor(1000 + Math.random() * 9000)), designation: 'Field Officer', target: 50, error: '' })}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>+</span> Add Employee
                </button>

                <a
                  href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/staff/export-pins?district=${staffFilterDistrict}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  title="1-Click Download Excel Directory with 4-digit PINs"
                >
                  <span>📥</span> Download PINs ({staffFilterDistrict})
                </a>
              </div>
            </div>

            {/* Filter Tabs: All | Active | Inactive */}
            {(() => {
              const totalCount = staffList.length;
              const activeCount = staffList.filter(s => s.is_active !== false && s.status !== 'inactive').length;
              const inactiveCount = staffList.filter(s => s.is_active === false || s.status === 'inactive').length;

              const filteredStaff = staffList.filter(s => {
                if (staffFilterDistrict !== 'All' && s.district !== staffFilterDistrict) return false;

                const isActive = s.is_active !== false && s.status !== 'inactive';
                if (staffStatusFilter === 'active' && !isActive) return false;
                if (staffStatusFilter === 'inactive' && isActive) return false;

                if (staffSearchQuery.trim()) {
                  const q = staffSearchQuery.trim().toLowerCase();
                  return (
                    (s.name && s.name.toLowerCase().includes(q)) ||
                    String(s.pin || '').includes(q) ||
                    (s.district && s.district.toLowerCase().includes(q)) ||
                    (s.designation && s.designation.toLowerCase().includes(q))
                  );
                }
                return true;
              });

              return (
                <>
                  <div className="py-2.5 flex items-center justify-between gap-2 border-b border-slate-100/80">
                    <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setStaffStatusFilter('all')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                          staffStatusFilter === 'all'
                            ? 'bg-white text-slate-800 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        All ({totalCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffStatusFilter('active')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                          staffStatusFilter === 'active'
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                        Active ({activeCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffStatusFilter('inactive')}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                          staffStatusFilter === 'inactive'
                            ? 'bg-white text-slate-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0"></span>
                        Inactive ({inactiveCount})
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-400 font-semibold hidden sm:block">
                      Showing {filteredStaff.length} of {totalCount} officers
                    </div>
                  </div>

                  {/* Staff Table */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar my-2 pr-1">
                    {filteredStaff.length === 0 ? (
                      <div className="text-center py-16 text-slate-400 font-bold text-xs">
                        Koi matching officer nahi mila.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-100">
                            <th className="p-3">District</th>
                            <th className="p-3">Officer Name</th>
                            <th className="p-3">Designation</th>
                            <th className="p-3">4-Digit PIN</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {filteredStaff.map((s, idx) => {
                            const isPinVisible = showPinMap[s.id];
                            const isActive = s.is_active !== false && s.status !== 'inactive';
                            return (
                              <tr key={s.id || idx} className="hover:bg-blue-50/30 transition-colors">
                                <td className="p-3 font-bold text-indigo-700">{s.district}</td>
                                <td className="p-3 font-black text-slate-800">{s.name}</td>
                                <td className="p-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                    {s.designation || 'Field Officer'}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <div className="inline-flex items-center gap-1.5 font-mono text-xs font-black bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                                    <span>{isPinVisible ? s.pin : '••••'}</span>
                                    <button
                                      type="button"
                                      onClick={() => setShowPinMap(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                                      className="text-slate-400 hover:text-slate-600 text-[11px] cursor-pointer"
                                      title={isPinVisible ? "Hide PIN" : "Show PIN"}
                                    >
                                      {isPinVisible ? '🙈' : '👁️'}
                                    </button>
                                  </div>
                                </td>
                                <td className="p-3">
                                  {isActive ? (
                                    <button
                                      type="button"
                                      onClick={() => setStaffToggleModal({
                                        officer: s,
                                        targetStatus: 'inactive',
                                        effectiveDate: new Date().toISOString().slice(0, 10),
                                        error: ''
                                      })}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                                      title="Click to deactivate officer"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                      Active
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setStaffToggleModal({
                                        officer: s,
                                        targetStatus: 'active',
                                        error: ''
                                      })}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                                      title="Click to reactivate officer"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                      Inactive {s.inactive_since ? `(${s.inactive_since})` : ''}
                                    </button>
                                  )}
                                </td>
                                <td className="p-3 text-right space-x-2">
                                  <button
                                    onClick={() => setPinChangeModal({
                                      name: s.name,
                                      district: s.district,
                                      newPin: s.pin,
                                      designation: s.designation || 'Field Officer',
                                      error: ''
                                    })}
                                    className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                  >
                                    ✏️ Edit Details
                                  </button>
                                  <button
                                    onClick={() => setDeleteStaffModal({ name: s.name, district: s.district, error: '' })}
                                    className="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                                  >
                                    🗑️ Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 font-semibold">
              <span>Tip: PIN badalne par ladke ka session turant naye PIN se authorize ho jata hai.</span>
              <button onClick={() => setShowStaffSuite(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-5 rounded-xl transition-all">Close Suite</button>
            </div>

          </div>
        </div>
      )}

      {/* Edit Staff Details Modal */}
      {pinChangeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-800">✏️ Edit Staff Details</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{pinChangeModal.name} ({pinChangeModal.district})</p>
              </div>
              <button onClick={() => setPinChangeModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">&times;</button>
            </div>

            <form onSubmit={handleExecuteUpdatePin} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Designation</label>
                <select
                  value={pinChangeModal.designation || 'Field Officer'}
                  onChange={(e) => setPinChangeModal(prev => ({ ...prev, designation: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Field Officer">Field Officer</option>
                  <option value="District Coordinator">District Coordinator</option>
                  <option value="Senior Treatment Supervisor (STS)">Senior Treatment Supervisor (STS)</option>
                  <option value="TB Health Visitor (TBHV)">TB Health Visitor (TBHV)</option>
                  <option value="Lab Technician (LT)">Lab Technician (LT)</option>
                  <option value="State Health Coordinator">State Health Coordinator</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">4-Digit Login PIN</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    value={pinChangeModal.newPin}
                    onChange={(e) => setPinChangeModal(prev => ({ ...prev, newPin: e.target.value.replace(/\D/g, '') }))}
                    placeholder="e.g. 5566"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-base font-black text-slate-800 tracking-widest text-center outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setPinChangeModal(prev => ({ ...prev, newPin: String(Math.floor(1000 + Math.random() * 9000)) }))}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs"
                    title="Generate Random PIN"
                  >
                    🎲
                  </button>
                </div>
              </div>

              {pinChangeModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-xl border border-red-100">{pinChangeModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setPinChangeModal(null)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button
                  type="submit"
                  disabled={pinChangeModal.loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all"
                >
                  {pinChangeModal.loading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Employee Modal */}
      {addStaffModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-800">➕ Add New Field Officer</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Staff Directory Onboarding</p>
              </div>
              <button onClick={() => setAddStaffModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">&times;</button>
            </div>

            <form onSubmit={handleExecuteAddStaff} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Select District</label>
                <select
                  value={addStaffModal.district}
                  onChange={(e) => setAddStaffModal(prev => ({ ...prev, district: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {districts.filter(d => d !== 'All').map(d => (
                    <option key={d} value={d}>{d} District</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Officer Full Name</label>
                <input
                  type="text"
                  value={addStaffModal.name}
                  onChange={(e) => setAddStaffModal(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Rahul Kumar"
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Designation</label>
                <select
                  value={addStaffModal.designation || 'Field Officer'}
                  onChange={(e) => setAddStaffModal(prev => ({ ...prev, designation: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Field Officer">Field Officer</option>
                  <option value="District Coordinator">District Coordinator</option>
                  <option value="Senior Treatment Supervisor (STS)">Senior Treatment Supervisor (STS)</option>
                  <option value="TB Health Visitor (TBHV)">TB Health Visitor (TBHV)</option>
                  <option value="Lab Technician (LT)">Lab Technician (LT)</option>
                  <option value="State Health Coordinator">State Health Coordinator</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">4-Digit Login PIN</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      maxLength={4}
                      value={addStaffModal.pin}
                      onChange={(e) => setAddStaffModal(prev => ({ ...prev, pin: e.target.value.replace(/\D/g, '') }))}
                      placeholder="e.g. 1234"
                      className="w-full bg-slate-50 border border-slate-200 font-mono text-xs font-black text-slate-800 text-center rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setAddStaffModal(prev => ({ ...prev, pin: String(Math.floor(1000 + Math.random() * 9000)) }))}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 rounded-xl text-xs"
                      title="Generate Random PIN"
                    >
                      🎲
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Monthly Target</label>
                  <input
                    type="number"
                    value={addStaffModal.target}
                    onChange={(e) => setAddStaffModal(prev => ({ ...prev, target: e.target.value }))}
                    placeholder="e.g. 50"
                    className="w-full bg-slate-50 border border-slate-200 font-mono text-xs font-black text-slate-800 text-center rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {addStaffModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-xl border border-red-100">{addStaffModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setAddStaffModal(null)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button
                  type="submit"
                  disabled={addStaffModal.loading}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all"
                >
                  {addStaffModal.loading ? 'Adding...' : 'Save & Onboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Staff Confirmation Modal */}
      {deleteStaffModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <h4 className="text-sm font-black text-red-600">🗑️ Confirm Remove Staff</h4>
              <button onClick={() => setDeleteStaffModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">&times;</button>
            </div>

            <form onSubmit={handleExecuteDeleteStaff} className="space-y-3">
              <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-center">
                <p className="text-xs font-bold text-red-800 mb-1">
                  Kya aap sach me <strong>{deleteStaffModal.name}</strong> ({deleteStaffModal.district}) ko staff directory se delete karna chahte hain?
                </p>
                <p className="text-[10px] text-red-500">Yeh officer ab mobile app me login nahi kar payega.</p>
              </div>

              {deleteStaffModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-xl border border-red-100">{deleteStaffModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setDeleteStaffModal(null)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button
                  type="submit"
                  disabled={deleteStaffModal.loading}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md shadow-red-600/20 active:scale-95 transition-all"
                >
                  {deleteStaffModal.loading ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Status Toggle Confirmation Modal */}
      {staffToggleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black ${
                  staffToggleModal.targetStatus === 'inactive' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  {staffToggleModal.targetStatus === 'inactive' ? '⏸️' : '▶️'}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">
                    {staffToggleModal.targetStatus === 'inactive' ? 'Deactivate Officer' : 'Reactivate Officer'}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {staffToggleModal.officer?.name} ({staffToggleModal.officer?.district})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isTogglingStaff && setStaffToggleModal(null)}
                disabled={isTogglingStaff}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none disabled:opacity-50 cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleExecuteToggleStaffStatus} className="space-y-4">
              {staffToggleModal.targetStatus === 'inactive' ? (
                <>
                  <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/60 text-amber-900 text-xs">
                    <p className="font-bold mb-1 flex items-center gap-1.5">
                      <span>⚠️</span> Kya aap sach me <strong>{staffToggleModal.officer?.name}</strong> ko deactivate karna chahte hain?
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Officer ka login <code>/verify-pin</code> block ho jayega aur current attendance se hat jayega. Purana historical data 100% safe rahega.
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      Effective Cutoff Date
                    </label>
                    <input
                      type="date"
                      required
                      value={staffToggleModal.effectiveDate || new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setStaffToggleModal(prev => ({ ...prev, effectiveDate: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                      Is tareekh aur iske baad se officer attendance roster me nahi dikhega.
                    </p>
                  </div>
                </>
              ) : (
                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200/60 text-emerald-900 text-xs">
                  <p className="font-bold mb-1 flex items-center gap-1.5">
                    <span>✅</span> Reactivate <strong>{staffToggleModal.officer?.name}</strong> ({staffToggleModal.officer?.district})
                  </p>
                  <p className="text-[11px] text-emerald-800 leading-relaxed">
                    Officer active ho jayega aur login kar sakega.
                  </p>
                </div>
              )}

              {staffToggleModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {staffToggleModal.error}
                </p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStaffToggleModal(null)}
                  disabled={isTogglingStaff}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isTogglingStaff}
                  className={`font-bold px-4 py-2 rounded-xl text-xs shadow-md active:scale-95 transition-all text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    staffToggleModal.targetStatus === 'inactive'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  }`}
                >
                  {isTogglingStaff ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <span>{staffToggleModal.targetStatus === 'inactive' ? 'Deactivate' : 'Reactivate'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Patient ID Correction / Edit Modal */}
      {adminEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  {adminEditModal.action === 'replace' ? '✏️ Correct Patient ID' : adminEditModal.action === 'delete' ? '🗑️ Remove Patient ID' : '➕ Add Missing Patient ID'}
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                  {adminEditModal.fo_name} ({adminEditModal.district}) &bull; {adminEditModal.date}
                </p>
              </div>
              <button onClick={() => setAdminEditModal(null)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <form onSubmit={handleAdminExecuteIdEdit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs font-bold text-slate-600">
                <span className="text-slate-400 text-[10px] uppercase block mb-0.5">Category:</span>
                {adminEditModal.category.replace('_ids', '').replace(/_/g, ' ').toUpperCase()}
              </div>

              {adminEditModal.action === 'delete' ? (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-center space-y-1">
                  <p className="text-xs font-bold text-red-800">
                    Kya aap sach me ID <strong className="font-mono text-sm">{adminEditModal.oldId}</strong> ko report se hatana chahte hain?
                  </p>
                  <p className="text-[10px] text-red-500">Yeh action database aur KPI calculation ko turant update karega.</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                    {adminEditModal.action === 'replace' ? `Replace ID #${adminEditModal.oldId} With:` : 'Enter 9-Digit Patient ID:'}
                  </label>
                  <input
                    type="text"
                    maxLength={9}
                    value={adminEditModal.newId}
                    onChange={(e) => setAdminEditModal(prev => ({ ...prev, newId: e.target.value.replace(/\D/g, '') }))}
                    placeholder="e.g. 332882518"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 font-mono text-sm font-black text-slate-800 tracking-wider outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Must be exactly 9 digits (numbers only).</p>
                </div>
              )}

              {adminEditModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">{adminEditModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setAdminEditModal(null)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
                <button
                  type="submit"
                  disabled={adminEditModal.loading}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-md active:scale-95 transition-all ${adminEditModal.action === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'}`}
                >
                  {adminEditModal.loading ? 'Saving...' : adminEditModal.action === 'delete' ? 'Confirm Delete' : 'Save ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🗑️ Delete Full Day Report Confirmation Modal */}
      {deleteDayModal && deleteDayModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-xl font-black shrink-0">
                🗑️
              </div>
              <div>
                <h3 className="text-base font-black text-slate-800">Delete Day Report?</h3>
                <p className="text-[11px] text-slate-400 font-bold uppercase">{deleteDayModal.fo_name} &bull; {deleteDayModal.district}</p>
              </div>
            </div>
            
            <div className="bg-red-50/70 border border-red-200 rounded-2xl p-4 text-xs text-red-900 mb-4 space-y-2">
              <p className="font-bold">
                Kya aap sach me <span className="underline font-mono">{deleteDayModal.date}</span> ka poora report data delete karna chahte hain?
              </p>
              <p className="text-[11px] text-red-700 leading-relaxed">
                Is din ke sabhi <strong>{deleteDayModal.dayIdsCount} Patient IDs</strong> aur travel record ({deleteDayModal.km || 0} KM) permanently delete ho jayenge aur attendance absent mark ho jayegi. Yeh action undo nahi ho sakta.
              </p>
            </div>

            {deleteDayModal.error && (
              <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100 mb-3">{deleteDayModal.error}</p>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteDayModal(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteDayModal.loading}
                onClick={handleExecuteDeleteDay}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/20 active:scale-95 transition-all cursor-pointer"
              >
                {deleteDayModal.loading ? "Deleting..." : "Yes, Delete Entire Day"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ Edit Full Day Report Modal */}
      {editDayModal && editDayModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col animate-fade-in my-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-black shrink-0">
                  ✏️
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    Edit Day Report
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    {editDayModal.fo_name} &bull; {editDayModal.district} &bull; 📅 {editDayModal.date}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditDayModal(null)} 
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Context Callout */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 mb-4 text-xs text-amber-900 flex items-start gap-2 shrink-0">
              <span className="text-sm shrink-0">⚠️</span>
              <div className="text-[11px] leading-relaxed">
                Yahan aap is din ke <strong>Travel KM</strong>, <strong>Visited Doctors/Stores</strong>, <strong>Remarks</strong>, aur sabhi <strong>19+ Categories ke Patient IDs</strong> ko edit/correct kar sakte hain. Submitting will update report, recalculate district rollups atomically, and log modifications in the 7-day audit trail.
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleExecuteEditDay} className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {/* Row 1: KM, Visits, Remarks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/70">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Morning KM
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editDayModal.morning_km}
                    onChange={(e) => {
                      const m = Math.max(0, parseInt(e.target.value) || 0);
                      setEditDayModal(prev => {
                        const e_val = prev.evening_km || 0;
                        const diff = e_val > m ? e_val - m : prev.travel_expenses;
                        return { ...prev, morning_km: m, travel_expenses: diff };
                      });
                    }}
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Evening KM
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editDayModal.evening_km}
                    onChange={(e) => {
                      const ev = Math.max(0, parseInt(e.target.value) || 0);
                      setEditDayModal(prev => {
                        const m_val = prev.morning_km || 0;
                        const diff = ev > m_val ? ev - m_val : prev.travel_expenses;
                        return { ...prev, evening_km: ev, travel_expenses: diff };
                      });
                    }}
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Total Travel (KM)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editDayModal.travel_expenses}
                    onChange={(e) => setEditDayModal(prev => ({ ...prev, travel_expenses: Math.max(0, parseInt(e.target.value) || 0) }))}
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-indigo-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Remarks
                  </label>
                  <input
                    type="text"
                    value={editDayModal.remark}
                    onChange={(e) => setEditDayModal(prev => ({ ...prev, remark: e.target.value }))}
                    placeholder="e.g. Field visit completed"
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Visited Doctors / Chemist Stores (Comma Separated)
                  </label>
                  <input
                    type="text"
                    value={editDayModal.visited_names}
                    onChange={(e) => setEditDayModal(prev => ({ ...prev, visited_names: e.target.value }))}
                    placeholder="e.g. Dr. A.K. Sharma, Sanjivani Medico, Life Care Pharmacy"
                    className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Category ID Buckets Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                    Patient IDs by Category (19 Categories)
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">
                    One 9-digit patient ID per line or separated by commas
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {feedCategoriesConfig.map(cat => {
                    const rawVal = editDayModal.category_inputs[cat.key] || '';
                    const is8or9 = (cat.key === 'fdc_provided_ids' || cat.key === 'outcome_assigned_ids');
                    const parsedCount = rawVal
                      .split(/[\n,]+/)
                      .map(s => s.trim())
                      .filter(s => (is8or9 ? (s.length === 8 || s.length === 9) : s.length === 9) && /^\d+$/.test(s)).length;

                    return (
                      <div 
                        key={cat.key} 
                        className={`rounded-2xl border p-3 transition-all ${cat.isPrimary ? 'bg-indigo-50/30 border-indigo-200/70' : 'bg-white border-slate-200/80'}`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5 truncate">
                            <span>{cat.icon}</span>
                            <span className="truncate">{cat.label}</span>
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${parsedCount > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {parsedCount}
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={rawVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditDayModal(prev => ({
                              ...prev,
                              category_inputs: {
                                ...prev.category_inputs,
                                [cat.key]: val
                              }
                            }));
                          }}
                          placeholder={is8or9 ? "Paste 8 or 9-digit IDs..." : "Paste 9-digit IDs..."}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar resize-none placeholder:text-slate-300"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {editDayModal.error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-3 rounded-2xl">
                  {editDayModal.error}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setEditDayModal(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editDayModal.loading}
                  className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {editDayModal.loading ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <span>💾</span>
                      <span>Save Day Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🕒 7-Day Patient ID Modification Radar Modal */}
      {showRecentIdEditsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in my-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-black shrink-0">
                  🕒
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    7-Day Patient ID Modification Radar
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">
                      Past 7 Days
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    Full audit history of all ID corrections, additions &amp; deletions
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowRecentIdEditsModal(false)} 
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 mb-3 shrink-0">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
                {['All', 'delete', 'replace', 'add'].map(act => (
                  <button
                    key={act}
                    type="button"
                    onClick={() => setRecentIdEditsFilterAction(act)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      recentIdEditsFilterAction === act
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {act === 'All' ? 'All Logs' : act === 'delete' ? '🗑️ Deleted' : act === 'replace' ? '✏️ Replaced' : '➕ Added'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
                <input
                  type="text"
                  value={recentIdEditsSearch}
                  onChange={(e) => setRecentIdEditsSearch(e.target.value)}
                  placeholder="Filter by ID, FO, or district..."
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={fetchRecentIdEdits}
                  disabled={recentIdEditsLoading}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all shrink-0 cursor-pointer"
                  title="Refresh Logs"
                >
                  <span className={recentIdEditsLoading ? "animate-spin inline-block" : ""}>🔄</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar border border-slate-100 rounded-2xl">
              {recentIdEditsLoading ? (
                <div className="p-12 text-center text-slate-400 font-bold text-xs flex items-center justify-center gap-2">
                  <span className="animate-spin text-lg">⏳</span> Loading recent modification logs...
                </div>
              ) : (() => {
                const filtered = recentIdEdits.filter(item => {
                  const matchAct = recentIdEditsFilterAction === 'All' || item.action === recentIdEditsFilterAction;
                  if (!matchAct) return false;
                  if (!recentIdEditsSearch.trim()) return true;
                  const q = recentIdEditsSearch.trim().toLowerCase();
                  return (
                    (item.fo_name || '').toLowerCase().includes(q) ||
                    (item.district || '').toLowerCase().includes(q) ||
                    (item.old_id || '').includes(q) ||
                    (item.new_id || '').includes(q) ||
                    (item.category || '').toLowerCase().includes(q) ||
                    (item.date || '').includes(q)
                  );
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center text-slate-400 font-bold text-xs">
                      No ID modifications found in the past 7 days matching this filter.
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 uppercase text-[10px] tracking-wider font-black sticky top-0">
                        <th className="p-3">Time (IST)</th>
                        <th className="p-3">Officer &amp; District</th>
                        <th className="p-3">Report Date</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Action</th>
                        <th className="p-3">ID Detail</th>
                        <th className="p-3">Modified By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {filtered.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 whitespace-nowrap font-mono text-[11px] text-slate-500">
                            {item.timestamp}
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800 block">{item.fo_name}</span>
                            <span className="text-[10px] text-slate-400 uppercase">{item.district}</span>
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-700">
                            {item.date}
                          </td>
                          <td className="p-3">
                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                              {(item.category || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              item.action === 'delete'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : item.action === 'replace'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {item.action === 'delete' ? '🗑️ Deleted' : item.action === 'replace' ? '✏️ Replaced' : '➕ Added'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {item.action === 'replace' ? (
                              <div className="flex items-center gap-1.5">
                                <span className="line-through text-red-500">{item.old_id}</span>
                                <span>➔</span>
                                <span className="font-black text-emerald-700">{item.new_id}</span>
                              </div>
                            ) : item.action === 'delete' ? (
                              <span className="line-through text-red-600 font-bold">{item.old_id}</span>
                            ) : (
                              <span className="text-emerald-700 font-black">+{item.new_id}</span>
                            )}
                          </td>
                          <td className="p-3 text-[11px] text-slate-500">
                            {item.edited_by || 'Admin'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 🚀 Application Updates & Changelog Modal */}
      {showChangelogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in my-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white flex items-center justify-center text-xl font-black shadow-md shadow-indigo-600/20 shrink-0">
                  🚀
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    DFY MIS Release Changelog
                    <span className="text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                      v{APP_VERSION}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                    Last deployed: {LAST_UPDATED_DATE} &bull; Live Production Version
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowChangelogModal(false)} 
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Releases Timeline */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-6 custom-scrollbar">
              {CHANGELOG_ENTRIES.map((entry, idx) => (
                <div key={entry.version || idx} className="relative pl-6 pb-2 border-l-2 border-indigo-100 last:border-l-0">
                  {/* Timeline Dot */}
                  <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-white shadow-xs"></div>

                  <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200/70 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black font-mono bg-indigo-600 text-white px-2.5 py-0.5 rounded-lg">
                          {entry.version}
                        </span>
                        <span className="text-xs font-bold text-slate-500">
                          {entry.date}
                        </span>
                      </div>
                      {entry.badge && (
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          entry.badgeColor === 'emerald'
                            ? 'bg-emerald-100 text-emerald-800'
                            : entry.badgeColor === 'rose'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {entry.badge}
                        </span>
                      )}
                    </div>

                    <h4 className="text-sm font-black text-slate-800 leading-snug">
                      {entry.title}
                    </h4>

                    {entry.highlights && entry.highlights.length > 0 && (
                      <ul className="space-y-1.5 text-xs font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-100">
                        {entry.highlights.map((h, hIdx) => (
                          <li key={hIdx} className="flex items-start gap-1.5">
                            <span className="text-indigo-600 font-bold shrink-0">&bull;</span>
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {entry.details && entry.details.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {entry.details.map((d, dIdx) => (
                          <span 
                            key={dIdx} 
                            className="text-[10px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200/60 shadow-2xs"
                          >
                            <strong className="text-indigo-600 uppercase mr-1">[{d.tag}]</strong>
                            {d.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="px-5 py-2 rounded-xl text-xs font-black text-white bg-slate-800 hover:bg-slate-900 shadow-sm transition-all cursor-pointer"
              >
                Close Changelog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 Unified Reports & Export Studio Modal */}
      {showReportsStudio && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-4xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <span>📊</span> DFY Executive Reports &amp; Export Studio
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Month: {month} &bull; Bihar TB Mission ({Object.keys(staffDirectory).length || 22} Districts)</p>
              </div>
              <button onClick={() => setShowReportsStudio(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Studio Navigation Tabs */}
            <div className="flex flex-wrap gap-2 pb-4 border-b border-slate-100">
              {[
                { id: "kpi_workbooks", label: "📁 District KPI Excel", icon: "📁" },
                { id: "medicine_consumption", label: "💊 Medicine Consumption", icon: "💊" },
                { id: "state_matrix", label: "🏢 State Summary (.xlsx)", icon: "🏢" },
                { id: "staff_attendance", label: "📋 Staff Attendance (.xlsx)", icon: "📋" },
                { id: "cascade_funnel", label: "📈 Cascade Funnel", icon: "📈" },
                { id: "whatsapp_bulletin", label: "📱 WhatsApp Bulletin", icon: "📱" }
              ].filter(tab => !isSubAdmin || tab.id !== "state_matrix").map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setReportsStudioTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${reportsStudioTab === tab.id ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Studio Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1">
              
              {/* Tab 1: District KPI Workbooks */}
              {reportsStudioTab === "kpi_workbooks" && (
                <div className="space-y-4">
                  <div className="bg-indigo-50/70 p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-indigo-900 mb-0.5">Official 33-Sheet Pre-Formulated KPI Workbooks</h4>
                      <p className="text-xs text-indigo-700 font-medium">Monthly populated daily tabs (1ST..31st) with auto-calculating consolidated sheets and target injection.</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-200/80 text-indigo-900 px-3 py-1 rounded-full shrink-0 self-start sm:self-auto">
                      Month: {month}
                    </span>
                  </div>

                  {/* Multi-District Selection Deck */}
                  <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">
                          🎯 Choose Districts to Export
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${selectedKpiDistricts.length > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          {selectedKpiDistricts.length} of {availableKpiDistricts.length} Selected
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllKpiDistricts}
                          disabled={isDownloadingKpi}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-indigo-100 hover:bg-indigo-200 text-indigo-800 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearKpiDistricts}
                          disabled={isDownloadingKpi}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* District Chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {availableKpiDistricts.map(dist => {
                        const isSelected = selectedKpiDistricts.includes(dist);
                        return (
                          <button
                            key={dist}
                            type="button"
                            disabled={isDownloadingKpi}
                            onClick={() => handleToggleKpiDistrict(dist)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer disabled:opacity-50 ${
                              isSelected
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs shadow-indigo-600/20'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                            }`}
                          >
                            <span>{isSelected ? '✓' : '+'}</span>
                            <span>{dist}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Live Queue Progress Banner */}
                    {kpiQueueProgress && (
                      <div className="bg-indigo-950 text-white p-4 rounded-2xl border border-indigo-800 shadow-lg space-y-2 animate-fade-in">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="flex items-center gap-2">
                            <span className="animate-spin text-sm">⏳</span>
                            <span>{kpiQueueProgress.status}</span>
                          </span>
                          <span className="font-mono text-indigo-300">{kpiQueueProgress.percent}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-indigo-900 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300 rounded-full"
                            style={{ width: `${kpiQueueProgress.percent}%` }}
                          ></div>
                        </div>
                        <p className="text-[10px] text-indigo-300 font-medium">
                          Render memory protection active: generating one file at a time with 1-second server cooldown between requests.
                        </p>
                      </div>
                    )}

                    {/* Multi-District Download Action Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {/* Option A: Scoped ZIP */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-1">
                            <span>📦</span>
                            <span>Download Scoped ZIP Archive</span>
                          </span>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Bundles only the <strong>{selectedKpiDistricts.length > 0 ? selectedKpiDistricts.length : availableKpiDistricts.length} selected district(s)</strong> into a single compressed ZIP file.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingKpi || (selectedKpiDistricts.length === 0 && availableKpiDistricts.length === 0)}
                          onClick={handleDownloadScopedZip}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isDownloadingKpi
                              ? 'bg-indigo-400 text-white cursor-wait animate-pulse'
                              : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-indigo-600/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingKpi ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Generating Scoped ZIP Archive...</span>
                            </>
                          ) : (
                            <>
                              <span>📦</span>
                              <span>Download Selected ZIP ({selectedKpiDistricts.length > 0 ? selectedKpiDistricts.length : 'All'})</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Option B: One-by-One Queue */}
                      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 mb-1">
                            <span>📑</span>
                            <span>Download One-by-One (Queue)</span>
                          </span>
                          <p className="text-[11px] text-emerald-800 font-medium">
                            Downloads `.xlsx` files individually with a 1-second pause between each file (guarantees zero memory spikes on Render).
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingKpi || selectedKpiDistricts.length === 0}
                          onClick={handleDownloadSequentialQueue}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isDownloadingKpi
                              ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                              : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-emerald-600/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingKpi ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Queue Running Safely...</span>
                            </>
                          ) : (
                            <>
                              <span>📑</span>
                              <span>Start Download Queue ({selectedKpiDistricts.length} Files)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Single District Quick Export */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs font-black text-slate-800 block mb-0.5">Quick Single District Export</span>
                      <p className="text-[11px] text-slate-400 font-medium">Select a single district to immediately download its 33-sheet `.xlsx` file:</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={reportsDistrict}
                        onChange={(e) => setReportsDistrict(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {availableKpiDistricts.map(d => (
                          <option key={d} value={d}>{d} District</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={isDownloadingKpi}
                        onClick={handleDownloadKpi}
                        className={`font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5 active:scale-95 shrink-0 ${
                          isDownloadingKpi
                            ? 'bg-indigo-400 text-white cursor-wait animate-pulse'
                            : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white cursor-pointer'
                        }`}
                      >
                        {isDownloadingKpi ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            <span>Generating 33 Sheets...</span>
                          </>
                        ) : (
                          <>
                            <span>📥</span>
                            <span>Download</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Medicine Consumption Studio */}
              {reportsStudioTab === "medicine_consumption" && (() => {
                const summaryMap = {};
                let totalPatientsCount = 0;
                let totalStripsCount = 0;

                const filtered = rawRecords.filter(r => {
                  const dist = canonicalizeDistrict(r.working_place || r.district || '');
                  if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
                    const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
                    if (!allowed.includes(dist)) return false;
                  }
                  if (selectedMedDistricts.length > 0) {
                    if (!selectedMedDistricts.map(canonicalizeDistrict).includes(dist)) return false;
                  } else if (selectedDistrict !== 'All' && dist !== selectedDistrict) {
                    return false;
                  }
                  if (selectedFO !== 'All' && (r.fo_name || r.officer_name) !== selectedFO) return false;
                  return true;
                });

                filtered.forEach(r => {
                  const dist = canonicalizeDistrict(r.working_place || r.district || '');
                  const fo = r.fo_name || r.officer_name || 'Field Officer';
                  const key = `${dist}___${fo}`;
                  
                  if (!summaryMap[key]) {
                    summaryMap[key] = {
                      district: dist,
                      fo_name: fo,
                      total_patients: 0,
                      adult_ip: 0,
                      adult_cp: 0,
                      pediatric_ip: 0,
                      pediatric_cp: 0,
                      total_strips: 0
                    };
                  }

                  const details = Array.isArray(r.fdc_details) ? r.fdc_details : [];
                  const fdcIds = Array.isArray(r.fdc_provided_ids) ? r.fdc_provided_ids : [];

                  if (details.length > 0) {
                    details.forEach(d => {
                      const ptype = String(d.patient_type || 'adult').toLowerCase();
                      const phase = String(d.phase || 'IP').toUpperCase();
                      const strips = Number(d.strips) || 1;

                      summaryMap[key].total_patients += 1;
                      summaryMap[key].total_strips += strips;
                      totalPatientsCount += 1;
                      totalStripsCount += strips;

                      if (ptype === 'pediatric') {
                        if (phase === 'IP') summaryMap[key].pediatric_ip += 1;
                        else summaryMap[key].pediatric_cp += 1;
                      } else {
                        if (phase === 'IP') summaryMap[key].adult_ip += 1;
                        else summaryMap[key].adult_cp += 1;
                      }
                    });
                  } else if (fdcIds.length > 0) {
                    fdcIds.forEach(() => {
                      summaryMap[key].total_patients += 1;
                      summaryMap[key].total_strips += 1;
                      summaryMap[key].adult_ip += 1;
                      totalPatientsCount += 1;
                      totalStripsCount += 1;
                    });
                  }
                });

                const summaryList = Object.values(summaryMap).filter(s => s.total_patients > 0);

                return (
                  <div className="space-y-4">
                    {/* Top Banner & Overview */}
                    <div className="bg-gradient-to-r from-teal-900 to-slate-900 p-5 rounded-2xl border border-teal-800/60 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-teal-950/30">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-xl shrink-0">
                            💊
                          </div>
                          <div>
                            <h4 className="text-base font-black text-white tracking-tight">TB FDC Medicine Distribution &amp; Consumption Studio</h4>
                            <p className="text-xs text-teal-200/80 font-medium">
                              Export 2-sheet executive consumption workbooks (.xlsx) with Detailed Patient Records &amp; Aggregations.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className="text-[10px] font-black uppercase tracking-wider bg-teal-800/60 border border-teal-600/40 text-teal-200 px-2.5 py-1 rounded-lg">
                            Month: {month}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-teal-800/60 border border-teal-600/40 text-teal-200 px-2.5 py-1 rounded-lg">
                            Scope: {selectedMedDistricts.length > 0 ? `${selectedMedDistricts.length} Selected Districts` : (selectedDistrict === 'All' ? 'All Districts' : selectedDistrict)}
                          </span>
                          <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                            Total Patients: {totalPatientsCount} &bull; Total Strips: {totalStripsCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Multi-District Selection Deck */}
                    <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800">
                            🎯 Choose Districts to Export
                          </span>
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${selectedMedDistricts.length > 0 ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            {selectedMedDistricts.length} of {availableKpiDistricts.length} Selected
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleSelectAllMedDistricts}
                            disabled={isDownloadingMedicineReport}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-teal-100 hover:bg-teal-200 text-teal-800 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={handleClearMedDistricts}
                            disabled={isDownloadingMedicineReport}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* District Chips */}
                      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {availableKpiDistricts.map(dist => {
                          const isSelected = selectedMedDistricts.includes(dist);
                          return (
                            <button
                              key={dist}
                              type="button"
                              disabled={isDownloadingMedicineReport}
                              onClick={() => handleToggleMedDistrict(dist)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer disabled:opacity-50 ${
                                isSelected
                                  ? 'bg-teal-600 hover:bg-teal-700 text-white border-teal-600 shadow-xs shadow-teal-600/20'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                              }`}
                            >
                              <span>{isSelected ? '✓' : '+'}</span>
                              <span>{dist}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Live Queue Progress Banner */}
                      {medQueueProgress && (
                        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-teal-800 shadow-lg space-y-2 animate-fade-in">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <span className="flex items-center gap-2">
                              <span className="animate-spin text-sm">⏳</span>
                              <span>{medQueueProgress.status}</span>
                            </span>
                            <span className="font-mono text-teal-300">{medQueueProgress.percent}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-300 rounded-full"
                              style={{ width: `${medQueueProgress.percent}%` }}
                            ></div>
                          </div>
                          <p className="text-[10px] text-teal-300 font-medium">
                            Render memory protection active: generating one file at a time with 1-second server cooldown between requests.
                          </p>
                        </div>
                      )}

                      {/* Multi-District Download Action Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        {/* Option A: Combined Excel */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                          <div>
                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-1">
                              <span>📊</span>
                              <span>Download Combined Workbook (.xlsx)</span>
                            </span>
                            <p className="text-[11px] text-slate-500 font-medium">
                              Downloads a single 2-sheet workbook containing the <strong>{selectedMedDistricts.length > 0 ? `${selectedMedDistricts.length} selected` : 'all'} district(s)</strong> with patient detail logs and FO summaries.
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isDownloadingMedicineReport || (selectedMedDistricts.length === 0 && availableKpiDistricts.length === 0)}
                            onClick={handleDownloadMedicineReport}
                            className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                              isDownloadingMedicineReport
                                ? 'bg-teal-400 text-white cursor-wait animate-pulse'
                                : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white shadow-teal-600/20 cursor-pointer'
                            }`}
                          >
                            {isDownloadingMedicineReport ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Generating Medicine Workbook...</span>
                              </>
                            ) : (
                              <>
                                <span>📥</span>
                                <span>Download Selected ({selectedMedDistricts.length > 0 ? selectedMedDistricts.length : 'All'})</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Option B: One-by-One Queue */}
                        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 flex flex-col justify-between shadow-2xs">
                          <div>
                            <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 mb-1">
                              <span>📑</span>
                              <span>Download One-by-One (Queue)</span>
                            </span>
                            <p className="text-[11px] text-emerald-800 font-medium">
                              Downloads individual district `.xlsx` files with a 1-second pause between each file (guarantees zero memory spikes on Render).
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={isDownloadingMedicineReport || (selectedMedDistricts.length === 0 && availableKpiDistricts.length === 0)}
                            onClick={handleDownloadSequentialMedQueue}
                            className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                              isDownloadingMedicineReport
                                ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                                : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-emerald-600/20 cursor-pointer'
                            }`}
                          >
                            {isDownloadingMedicineReport ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Queue Running Safely...</span>
                              </>
                            ) : (
                              <>
                                <span>📑</span>
                                <span>Start Download Queue ({selectedMedDistricts.length > 0 ? selectedMedDistricts.length : availableKpiDistricts.length} Files)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* On-screen Breakdown Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-700">
                          📊 Field Officer Consumption Breakdown
                        </h5>
                        <span className="text-[11px] font-bold text-slate-500">
                          {summaryList.length} Active Officer{summaryList.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {summaryList.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <span className="text-3xl block mb-2">💊</span>
                          <p className="text-xs font-bold">No FDC medicine distributions logged for {selectedDistrict} in {month}.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-100/80 text-slate-600 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                                <th className="py-2.5 px-4">District</th>
                                <th className="py-2.5 px-4">FO Name</th>
                                <th className="py-2.5 px-4 text-center">Total Patients</th>
                                <th className="py-2.5 px-4 text-center bg-indigo-50/50 text-indigo-900">Adult IP</th>
                                <th className="py-2.5 px-4 text-center bg-indigo-50/50 text-indigo-900">Adult CP</th>
                                <th className="py-2.5 px-4 text-center bg-teal-50/50 text-teal-900">Pediatric IP</th>
                                <th className="py-2.5 px-4 text-center bg-teal-50/50 text-teal-900">Pediatric CP</th>
                                <th className="py-2.5 px-4 text-center bg-emerald-50 text-emerald-900 font-black">Total Strips</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {summaryList.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-4 font-bold text-slate-800">{row.district}</td>
                                  <td className="py-2.5 px-4 font-semibold text-slate-700">{row.fo_name}</td>
                                  <td className="py-2.5 px-4 text-center font-bold text-slate-800">{row.total_patients}</td>
                                  <td className="py-2.5 px-4 text-center text-indigo-700 font-semibold">{row.adult_ip}</td>
                                  <td className="py-2.5 px-4 text-center text-indigo-700 font-semibold">{row.adult_cp}</td>
                                  <td className="py-2.5 px-4 text-center text-teal-700 font-semibold">{row.pediatric_ip}</td>
                                  <td className="py-2.5 px-4 text-center text-teal-700 font-semibold">{row.pediatric_cp}</td>
                                  <td className="py-2.5 px-4 text-center font-black text-emerald-700 bg-emerald-50/50">{row.total_strips}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Tab 2: State Summary Excel */}
              {reportsStudioTab === "state_matrix" && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-sm font-black text-slate-800 mb-1">Consolidated State Performance Summary (.xlsx)</h4>
                    <p className="text-xs text-slate-500 font-medium mb-4">Executive 1-page table comparing Target, Notifications Achieved, Samples Tested, DBT velocity, and Travel KM.</p>
                    
                    <a
                      href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-state-summary?month=${month}&token=${getAdminToken()}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-xs shadow-md transition-all"
                    >
                      <span>📥</span> Download State Summary Sheet (.xlsx)
                    </a>
                  </div>
                </div>
              )}

              {/* Tab 3: Monthly Staff Attendance Dual-Sheet Workbook */}
              {reportsStudioTab === "staff_attendance" && (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 p-4 sm:p-5 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-emerald-950 mb-0.5">Staff Attendance (.xlsx) — Dual-Sheet Matrix &amp; Activity Log</h4>
                      <p className="text-xs text-emerald-700 font-medium">Sheet 1: Monthly Attendance Matrix (P, ML, CL, OD, A, WO, H). Sheet 2: Day-by-Day Activity Log with facility visits and travel KM.</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-3 py-1 rounded-full shrink-0 self-start sm:self-auto">
                      Month: {month}
                    </span>
                  </div>

                  {/* Multi-District Selection Deck */}
                  <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">
                          🎯 Choose Districts to Export
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${selectedAttendanceDistricts.length > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                          {selectedAttendanceDistricts.length} of {availableAttendanceDistricts.length} Selected
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSelectAllAttendanceDistricts}
                          disabled={isDownloadingAttendance}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAttendanceDistricts}
                          disabled={isDownloadingAttendance}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* District Chips */}
                    <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                      {availableAttendanceDistricts.map(dist => {
                        const isSelected = selectedAttendanceDistricts.includes(dist);
                        return (
                          <button
                            key={dist}
                            type="button"
                            disabled={isDownloadingAttendance}
                            onClick={() => handleToggleAttendanceDistrict(dist)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border active:scale-95 cursor-pointer disabled:opacity-50 ${
                              isSelected
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs shadow-emerald-600/20'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                            }`}
                          >
                            <span>{isSelected ? '✓' : '+'}</span>
                            <span>{dist}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Live Queue Progress Banner */}
                    {attendanceQueueProgress && (
                      <div className="bg-slate-900 text-white p-4 rounded-2xl border border-emerald-800 shadow-lg space-y-2 animate-fade-in">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="flex items-center gap-2">
                            <span className="animate-spin text-sm">⏳</span>
                            <span>{attendanceQueueProgress.status}</span>
                          </span>
                          <span className="font-mono text-emerald-300">{attendanceQueueProgress.percent}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-300 rounded-full"
                            style={{ width: `${attendanceQueueProgress.percent}%` }}
                          ></div>
                        </div>
                        <p className="text-[10px] text-emerald-300 font-medium">
                          Render memory protection active: generating one file at a time with 1-second server cooldown between requests.
                        </p>
                      </div>
                    )}

                    {/* Multi-District Download Action Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {/* Option A: Scoped .xlsx Download */}
                      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5 mb-1">
                            <span>📊</span>
                            <span>Download Scoped (.xlsx)</span>
                          </span>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Downloads a dual-sheet workbook for <strong>{selectedAttendanceDistricts.length > 0 ? `${selectedAttendanceDistricts.length} selected` : 'all'} district(s)</strong> with attendance matrix and activity logs.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingAttendance || (selectedAttendanceDistricts.length === 0 && availableAttendanceDistricts.length === 0)}
                          onClick={handleDownloadAttendanceSingleOrScoped}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isDownloadingAttendance
                              ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                              : 'bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white shadow-emerald-600/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingAttendance ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Generating Staff Attendance...</span>
                            </>
                          ) : (
                            <>
                              <span>📥</span>
                              <span>Download Selected ({selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts.length : 'All'})</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Option B: Sequential Queue */}
                      <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200/80 flex flex-col justify-between shadow-2xs">
                        <div>
                          <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5 mb-1">
                            <span>📑</span>
                            <span>Sequential Download Queue</span>
                          </span>
                          <p className="text-[11px] text-emerald-800 font-medium">
                            Downloads individual district `.xlsx` files with a 1-second pause between each file (guarantees zero memory spikes on Render).
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isDownloadingAttendance || (selectedAttendanceDistricts.length === 0 && availableAttendanceDistricts.length === 0)}
                          onClick={handleDownloadStaffAttendanceQueue}
                          className={`mt-3 w-full font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 ${
                            isDownloadingAttendance
                              ? 'bg-emerald-400 text-white cursor-wait animate-pulse'
                              : 'bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white shadow-emerald-700/20 cursor-pointer'
                          }`}
                        >
                          {isDownloadingAttendance ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              <span>Queue Running Safely...</span>
                            </>
                          ) : (
                            <>
                              <span>📑</span>
                              <span>Start Download Queue ({selectedAttendanceDistricts.length > 0 ? selectedAttendanceDistricts.length : availableAttendanceDistricts.length} Files)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: TB Cascade Conversion Funnel */}
              {reportsStudioTab === "cascade_funnel" && (() => {
                const presumptive = totals.presumptive || 1;
                const tests = totals.tests || 0;
                const notif = totals.notifications || 0;
                const dbt = totals.dbt || 0;
                const tpt = totals.tpt_treatment_start || 0;

                const testConversion = Math.min(100, Math.round((tests / presumptive) * 100));
                const dbtConversion = notif > 0 ? Math.min(100, Math.round((dbt / notif) * 100)) : 0;
                const tptConversion = notif > 0 ? Math.min(100, Math.round((tpt / notif) * 100)) : 0;

                return (
                  <div className="space-y-4">
                    <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800">
                      <h4 className="text-sm font-black text-emerald-400 mb-1">State TB Cascade Conversion Funnel</h4>
                      <p className="text-xs text-slate-400 font-medium">Tracking clinical progression from presumptive screening to treatment completion.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Presumptive ➔ Tested</span>
                        <p className="text-2xl font-black text-indigo-600">{testConversion}%</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">{tests} Tested / {presumptive} Presumptive</p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Notification ➔ DBT Seeded</span>
                        <p className="text-2xl font-black text-blue-600">{dbtConversion}%</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">{dbt} DBT / {notif} Notifications</p>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Notification ➔ TPT Start</span>
                        <p className="text-2xl font-black text-teal-600">{tptConversion}%</p>
                        <p className="text-[10px] font-bold text-slate-500 mt-1">{tpt} TPT / {notif} Notifications</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Tab 5: 1-Click WhatsApp State Bulletin */}
              {reportsStudioTab === "whatsapp_bulletin" && (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 p-5 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div>
                      <h4 className="text-sm font-black text-emerald-950 mb-1">WhatsApp Executive State Bulletin</h4>
                      <p className="text-xs text-emerald-800 font-medium">Ready-to-broadcast summary formatted with emojis, state totals &amp; district rankings.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={copyWhatsAppBulletin}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <span>📋</span>
                        <span>{copiedBulletin ? '✓ Copied Bulletin!' : 'Copy WhatsApp Bulletin'}</span>
                      </button>
                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(liveWhatsAppBulletin)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <span>📱</span>
                        <span>Open in WhatsApp Web</span>
                      </a>
                    </div>
                  </div>

                  <pre className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-2xl border border-slate-800 overflow-x-auto whitespace-pre-wrap select-all">
                    {liveWhatsAppBulletin}
                  </pre>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowReportsStudio(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close Studio</button>
            </div>

          </div>
        </div>
      )}

      {/* Upgraded Duplicate Audit Radar Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>🛡️</span> Duplicate Patient ID Radar &amp; Journey Tracker
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Month: {duplicateAudit?.month || duplicateScanData?.month || month}</p>
                  <button
                    type="button"
                    onClick={() => {
                      fetchDuplicateAudit();
                      fetchDuplicateScan(true);
                    }}
                    disabled={duplicateScanLoading}
                    className="text-slate-400 hover:text-slate-600 p-0.5 text-xs transition-transform active:scale-90"
                    title="Refresh Duplicate Radar and Inflation Scan"
                  >
                    <span className={duplicateScanLoading ? "animate-spin inline-block" : "inline-block"}>🔄</span>
                  </button>
                </div>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Radar Tabs */}
            <div className="flex gap-2 pb-3 border-b border-slate-100 flex-wrap">
              <button
                type="button"
                onClick={() => setDuplicateRadarTab('collisions')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'collisions' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🚨</span> Same-Category Double Entries ({duplicateAudit?.total_same_category_duplicates || 0})
              </button>
              <button
                type="button"
                onClick={() => setDuplicateRadarTab('journeys')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'journeys' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🛤️</span> Patient Cascade Journeys ({duplicateAudit?.total_cross_category || 0})
              </button>
              <button
                type="button"
                onClick={() => {
                  setDuplicateRadarTab('repair');
                  if (!duplicateScanData) fetchDuplicateScan();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'repair' ? 'bg-rose-700 text-white shadow-md shadow-rose-700/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🚨</span> Notification Inflation &amp; 1-Click Fix ({duplicateScanData?.total_inflated_count || 0})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 my-3">
              {duplicateRadarTab === 'collisions' ? (
                (!duplicateAudit) ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold text-xs">Loading duplicate collision audit...</p>
                  </div>
                ) : (duplicateAudit.same_category_duplicates && duplicateAudit.same_category_duplicates.length > 0) ? (
                  duplicateAudit.same_category_duplicates.map((dup, idx) => (
                    <div key={idx} className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-black text-rose-700 bg-white px-2.5 py-1 rounded-lg border border-rose-200">
                          ID #{dup.patient_id}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full">
                          Double Entry in: {dup.repeated_categories.join(', ')}
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {dup.occurrences.map((occ, oIdx) => (
                          <div key={oIdx} className="flex justify-between items-center text-xs bg-white px-3 py-1.5 rounded-xl border border-rose-100 font-semibold text-slate-700">
                            <span>👤 <strong>{occ.fo_name}</strong> ({occ.district})</span>
                            <span className="text-[10px] text-slate-500 font-bold">📅 {occ.date} &bull; <strong className="text-rose-600">{occ.category}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16">
                    <div className="text-4xl mb-2">🎉</div>
                    <p className="text-emerald-700 font-black text-sm">Shabash! 0 Double-Entry Duplicates Found.</p>
                    <p className="text-slate-400 text-xs mt-1">Kisi bhi officer ne same category me duplicate ID report nahi ki hai. Full data clean hai!</p>
                  </div>
                )
              ) : duplicateRadarTab === 'journeys' ? (
                (!duplicateAudit) ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold text-xs">Loading patient journey tracker...</p>
                  </div>
                ) : (duplicateAudit.cross_category_history && duplicateAudit.cross_category_history.length > 0) ? (
                  duplicateAudit.cross_category_history.map((dup, idx) => (
                    <div key={idx} className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-sm font-black text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-indigo-200">
                          ID #{dup.patient_id}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                          {dup.occurrence_count} Cascade Services
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {dup.occurrences.map((occ, oIdx) => (
                          <div key={oIdx} className="flex justify-between items-center text-xs bg-white px-3 py-1.5 rounded-xl border border-indigo-100 font-semibold text-slate-700">
                            <span>👤 <strong>{occ.fo_name}</strong> ({occ.district})</span>
                            <span className="text-[10px] text-slate-500 font-bold">📅 {occ.date} &bull; <strong className="text-indigo-600">{occ.category}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16 text-slate-400 font-bold text-xs">
                    Koi multi-service history data nahi hai.
                  </div>
                )
              ) : (
                /* Tab 3: duplicateRadarTab === 'repair' */
                duplicateScanLoading ? (
                  <div className="text-center py-16 flex flex-col items-center justify-center space-y-3">
                    <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold text-xs">Scanning monthly reports for duplicate notification IDs...</p>
                  </div>
                ) : (duplicateScanData && duplicateScanData.instances && duplicateScanData.instances.length > 0) ? (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200/80 flex items-start gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <h4 className="text-xs font-black text-rose-900 uppercase tracking-wide">
                          Notification Inflation Detected ({duplicateScanData.total_inflated_count || 0} Overcount)
                        </h4>
                        <p className="text-[11px] text-rose-700 mt-0.5 leading-relaxed">
                          These instances represent patient IDs reported on multiple dates, causing rollup inflation. Nikshay guidelines mandate that each TB diagnosis notification is counted strictly once per treatment episode. Click below to clean duplicate entries and automatically decrement the district rollup.
                        </p>
                      </div>
                    </div>

                    {duplicateScanData.instances.map((instance, idx) => {
                      const inflatedCount = instance.duplicate_ids?.length || 0;
                      const isThisRepairing = repairingDocId === instance.repeat_doc_id;

                      return (
                        <div key={instance.repeat_doc_id || idx} className="p-4 bg-white rounded-2xl border border-rose-200/80 shadow-xs hover:border-rose-300 transition-all space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="text-base">👤</span>
                              <div>
                                <span className="font-black text-xs text-slate-800">{instance.fo_name}</span>
                                <span className="text-[10px] text-slate-500 font-semibold ml-1.5 bg-slate-100 px-2 py-0.5 rounded-full">
                                  📍 {instance.district}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500 font-bold">
                                📅 Repeated Date: <span className="font-mono text-slate-700">{instance.repeat_date}</span>
                              </span>
                              <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide">
                                +{inflatedCount} inflated
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                              Duplicate Patient IDs ({inflatedCount})
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {instance.duplicate_ids.map((id, idIdx) => {
                                const orig = instance.original_occurrences?.find(o => String(o.id) === String(id));
                                return (
                                  <div
                                    key={idIdx}
                                    className="group relative inline-flex items-center gap-1 font-mono text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg"
                                    title={orig ? `First reported on ${orig.date} by ${orig.fo_name}` : `Patient ID #${id}`}
                                  >
                                    <span>#{id}</span>
                                    {orig && (
                                      <span className="text-[9px] text-rose-500 font-normal">
                                        (1st: {orig.date})
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400 font-medium">
                              Doc ID: <span className="font-mono">{instance.repeat_doc_id}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRepairDuplicate(instance)}
                              disabled={repairingDocId !== null}
                              className="bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shadow-xs shadow-rose-600/20 flex items-center gap-1.5 active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                              title={`Clean duplicate IDs and correct rollup (-${inflatedCount})`}
                            >
                              {isThisRepairing ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                  <span>Repairing...</span>
                                </>
                              ) : (
                                <>
                                  <span>🧹</span>
                                  <span>Clean &amp; Correct Rollup (-{inflatedCount})</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (duplicateScanData && duplicateScanData.instances && duplicateScanData.instances.length === 0) ? (
                  <div className="text-center py-16 bg-emerald-50/50 rounded-2xl border border-emerald-100 p-6">
                    <div className="text-4xl mb-2">🎉</div>
                    <p className="text-emerald-800 font-black text-sm">
                      🎉 0 Duplicate Notifications! Sabhi district rollups bilkul accurate hain.
                    </p>
                    <p className="text-emerald-600 text-xs mt-1">
                      Kisi bhi officer ne duplicate notification report nahi ki hai.
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400 font-bold text-xs space-y-2">
                    <p>Notification scan data available nahi hai.</p>
                    <button
                      type="button"
                      onClick={() => fetchDuplicateScan(true)}
                      className="inline-flex items-center gap-1 bg-rose-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-rose-700"
                    >
                      <span>🔄</span> Scan Now
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowDuplicateModal(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* FO Detailed IDs Inspector Modal */}
      {inspectingFO && (() => {
        const foRecords = rawRecords.filter(r => {
          if (!r.fo_name || !inspectingFO || !inspectingFO.fo_name) return false;
          const matchName = canonicalizeFo(r.fo_name, r.working_place, staffDirectory) === canonicalizeFo(inspectingFO.fo_name, inspectingFO.district, staffDirectory);
          if (!matchName) return false;
          if (!inspectingFO.district || inspectingFO.district === 'All') return true;
          return canonicalizeDistrict(r.working_place) === canonicalizeDistrict(inspectingFO.district);
        }).sort((a, b) => {
          const dateA = String(a.date || a.date_of_reporting || '');
          const dateB = String(b.date || b.date_of_reporting || '');
          return dateB.localeCompare(dateA); // Latest date first (e.g. 2026-09-09 before 2026-09-05)
        });
        const totalNotif = foRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
        const targetObj = targetsData.find(t => t.fo_name === inspectingFO.fo_name && (t.district === inspectingFO.district));
        const targetNum = targetObj ? Number(targetObj.target) : 0;
        const pct = targetNum > 0 ? Math.min(100, Math.round((totalNotif / targetNum) * 100)) : 0;

        const categoriesConfig = [
          { key: 'notification_ids', label: 'Notification' },
          { key: 'hiv_dm_ids', label: 'HIV & DM' },
          { key: 'dbt_ids', label: 'DBT' },
          { key: 'sample_collection_ids', label: 'Sample Col' },
          { key: 'sample_tested_ids', label: 'Sample Tested' },
          { key: 'outcome_assigned_ids', label: 'Outcome' },
          { key: 'home_visit_ids', label: 'Home Visit' },
          { key: 'contact_tracing_ids', label: 'Contact Trace' },
          { key: 'follow_up_ids', label: 'Follow Up' },
          { key: 'face_to_face_ids', label: 'Face to Face' },
          { key: 'presumptive_ids', label: 'Presumptive' },
          { key: 'documents_ids', label: 'Documents' },
          { key: 'fdc_provided_ids', label: 'FDC Provided' },
          { key: 'kit_consumption_ids', label: 'Kit Cons' },
          { key: 'differentiated_tb_ids', label: 'Diff TB' },
          { key: 'tpt_treatment_start_ids', label: 'TPT Start' },
          { key: 'tpt_presumptive_ids', label: 'TPT Presumptive' },
          { key: 'adhar_face_authentication_ids', label: 'Adhar Face' },
          { key: 'consent_with_id_ids', label: 'Consent ID' }
        ];

        // Filter records by search ID if typed
        const filteredDays = foRecords.filter(rec => {
          if (!foSearchId.trim()) return true;
          const query = foSearchId.trim().toLowerCase();
          return categoriesConfig.some(c => (rec[c.key] || []).some(id => String(id).toLowerCase().includes(query)));
        });

        const copyAllFoIds = () => {
          let msg = `*DFY MIS - Monthly Reported IDs Summary*\n`;
          msg += `Officer: ${inspectingFO.fo_name} (${inspectingFO.district})\n`;
          msg += `Month: ${month} | Total Reports: ${foRecords.length}\n\n`;

          foRecords.forEach(rec => {
            msg += `📅 *Date: ${rec.date}*\n`;
            categoriesConfig.forEach(cat => {
              const ids = rec[cat.key] || [];
              if (ids.length > 0) {
                msg += `  • *${cat.label} (${ids.length}):* ${ids.join(', ')}\n`;
              }
            });
            if (rec.visited_names && rec.visited_names.length > 0) {
              msg += `  • *Doctors/Stores:* ${rec.visited_names.join(', ')}\n`;
            }
            msg += `\n`;
          });

          if (navigator.clipboard) {
            navigator.clipboard.writeText(msg);
            setCopiedFoCategory('ALL');
            setTimeout(() => setCopiedFoCategory(null), 2500);
          }
        };

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
              
              {/* Modal Header */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-xl shrink-0">
                    {inspectingFO.fo_name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800">{inspectingFO.fo_name}</h3>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{inspectingFO.district} District &bull; Month: {month}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`text-xs font-black uppercase px-3 py-1.5 rounded-xl border ${pct >= 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    Target: {pct}% ({totalNotif}/{targetNum})
                  </span>
                  <button onClick={() => { setInspectingFO(null); setFoSearchId(""); }} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="py-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={foSearchId}
                    onChange={(e) => setFoSearchId(e.target.value)}
                    placeholder="Search 9-digit Patient ID in this officer's reports..."
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                  />
                  {foSearchId && (
                    <button onClick={() => setFoSearchId("")} className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 hover:text-slate-600">&times;</button>
                  )}
                </div>
                <button
                  onClick={copyAllFoIds}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all shrink-0 active:scale-95"
                >
                  {copiedFoCategory === 'ALL' ? '✓ Copied All!' : 'Copy All IDs'}
                </button>
                <button
                  onClick={() => {
                    const foDist = (inspectingFO.district && inspectingFO.district !== 'All') 
                      ? inspectingFO.district 
                      : (foRecords[0]?.working_place || (selectedDistrict !== 'All' ? selectedDistrict : ''));
                    setFeedDistrict(foDist);
                    setFeedFoName(inspectingFO.fo_name);
                    setFeedDate(new Date().toISOString().slice(0, 10));
                    setFeedCategoryInputs({});
                    setFeedRemarks(`Direct feed for ${inspectingFO.fo_name}`);
                    setFeedError('');
                    setFeedSuccess('');
                    setShowAdminFeedModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all shrink-0 active:scale-95 flex items-center gap-1 shadow-xs"
                  title="Feed / backfill date report for this Field Officer"
                >
                  <span>➕</span> Feed Date Data
                </button>
              </div>

              {/* Dates & Submitted IDs Accordion */}
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 my-2">
                {filteredDays.length > 0 ? (
                  filteredDays.map((rec, rIdx) => {
                    const dayIdsCount = categoriesConfig.reduce((sum, c) => sum + (rec[c.key] || []).length, 0);
                    return (
                      <div key={rIdx} className="bg-slate-50/80 rounded-2xl border border-slate-100 p-4 space-y-3">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                            <span>📅</span> {rec.date}
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">{dayIdsCount} IDs</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400">{rec.total_km} KM Travelled</span>
                            <button
                              type="button"
                              onClick={() => handleOpenEditDay(rec)}
                              className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ml-1"
                              title={`Edit entire day report for ${rec.date}`}
                            >
                              <span>✏️</span> Edit Day
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteDayModal({
                                isOpen: true,
                                district: rec.working_place || inspectingFO.district,
                                fo_name: inspectingFO.fo_name,
                                date: rec.date,
                                dayIdsCount: dayIdsCount,
                                km: rec.total_km || 0,
                                loading: false,
                                error: ""
                              })}
                              className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/60 px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer ml-1"
                              title={`Delete entire day report for ${rec.date}`}
                            >
                              <span>🗑️</span> Delete Day
                            </button>
                          </div>
                        </div>

                        {rec.visited_names && rec.visited_names.length > 0 && (
                          <div className="text-[11px] font-medium text-slate-600 bg-white p-2 rounded-xl border border-slate-100">
                            <span className="font-bold text-slate-400 uppercase text-[9px] block">Doctors / Stores:</span>
                            {rec.visited_names.join(', ')}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {categoriesConfig.map(cat => {
                            const ids = rec[cat.key] || [];
                            if (ids.length === 0) return null;
                            return (
                              <div key={cat.key} className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-[10px] font-black uppercase text-slate-500">{cat.label} ({ids.length})</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setAdminEditModal({ fo_name: inspectingFO.fo_name, district: rec.working_place || inspectingFO.district, date: rec.date, category: cat.key, action: 'add', oldId: '', newId: '', error: '' })}
                                      className="text-[9px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded"
                                      title="Add missing ID"
                                    >
                                      + Add ID
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (navigator.clipboard) {
                                          navigator.clipboard.writeText(ids.join('\n'));
                                          setCopiedFoCategory(`${rec.date}_${cat.key}`);
                                          setTimeout(() => setCopiedFoCategory(null), 2000);
                                        }
                                      }}
                                      className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800"
                                    >
                                      {copiedFoCategory === `${rec.date}_${cat.key}` ? '✓ Copied' : 'Copy'}
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                                  {ids.map((id, idIdx) => {
                                    const fdcItem = cat.key === 'fdc_provided_ids' && Array.isArray(rec.fdc_details) ? rec.fdc_details.find(d => d && d.id === id) : null;
                                    return (
                                      <div key={idIdx} className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${foSearchId && String(id).includes(foSearchId) ? 'bg-amber-100 border-amber-300 text-amber-900 ring-2 ring-amber-400' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                        <span>{id}</span>
                                        {fdcItem && (
                                          <span className="font-sans text-[8px] font-black text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-200">
                                            {fdcItem.fdc_type || 'FDC 4'} &bull; {fdcItem.strips || 1}S
                                          </span>
                                        )}
                                        <button
                                          onClick={() => setAdminEditModal({ fo_name: inspectingFO.fo_name, district: rec.working_place || inspectingFO.district, date: rec.date, category: cat.key, action: 'replace', oldId: id, newId: id, error: '' })}
                                          className="text-slate-400 hover:text-indigo-600 text-[9px]"
                                          title="Edit / Correct ID"
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={() => setAdminEditModal({ fo_name: inspectingFO.fo_name, district: rec.working_place || inspectingFO.district, date: rec.date, category: cat.key, action: 'delete', oldId: id, newId: '', error: '' })}
                                          className="text-slate-400 hover:text-red-500 text-[9px]"
                                          title="Delete ID"
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-slate-400 font-bold text-xs">
                    {foSearchId ? `Koi matching ID "${foSearchId}" nahi mili.` : "Is officer ka is mahine me koi report data nahi hai."}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button onClick={() => { setInspectingFO(null); setFoSearchId(""); }} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition-all">Close</button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Field Officer Attendance Modal (Attendance Intelligence Radar) */}
      {showAttendanceModal && attendance && (() => {
        const submittedList = attendance.submitted_fos || [...(attendance.submitted_full || []), ...(attendance.submitted_partial || [])];
        const missingList = attendance.missing_fos || [];
        const onLeaveList = attendance.on_leave_fos || [];

        // Fast lookup map for chronic defaulters
        const defaulterMap = {};
        chronicDefaulters.forEach(d => {
          const key = `${d.district.toLowerCase()}_${d.fo_name.toLowerCase()}`;
          defaulterMap[key] = d;
        });

        // 1. Filter by District Pill
        const districtMatchedMissing = attendanceDistrictFilter === 'All'
          ? missingList
          : missingList.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        const districtMatchedSubmitted = attendanceDistrictFilter === 'All'
          ? submittedList
          : submittedList.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        const districtMatchedOnLeave = attendanceDistrictFilter === 'All'
          ? onLeaveList
          : onLeaveList.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        const districtMatchedDefaulters = attendanceDistrictFilter === 'All'
          ? chronicDefaulters
          : chronicDefaulters.filter(fo => canonicalizeDistrict(fo.district) === attendanceDistrictFilter);

        // 2. Precompute time bracket counts for chips
        const timeCounts = { all: districtMatchedSubmitted.length, on_time: 0, late: 0, delayed: 0, early: 0, next_day: 0 };
        districtMatchedSubmitted.forEach(fo => {
          const cls = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
          if (timeCounts[cls.bracket] !== undefined) timeCounts[cls.bracket]++;
        });

        // 3. Filter Submitted by Time Bracket
        const timeFilteredSubmitted = attendanceTimeFilter === 'all'
          ? districtMatchedSubmitted
          : districtMatchedSubmitted.filter(fo => {
              const cls = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
              return cls.bracket === attendanceTimeFilter;
            });

        // 4. Quick Search Filter across tabs
        const filteredMissing = districtMatchedMissing.filter(fo => {
          if (inactiveStaffNamesSet.has(normalizeStaffKey(fo.district, fo.fo_name))) return false;
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || (fo.district || '').toLowerCase().includes(q);
        });

        const filteredSubmitted = timeFilteredSubmitted.filter(fo => {
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || (fo.district || '').toLowerCase().includes(q);
        });

        const filteredOnLeave = districtMatchedOnLeave.filter(fo => {
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || 
                 (fo.district || '').toLowerCase().includes(q) || 
                 (fo.status || '').toLowerCase().includes(q) ||
                 (fo.reason_type || '').toLowerCase().includes(q) ||
                 (fo.remark || '').toLowerCase().includes(q);
        });

        const filteredDefaulters = districtMatchedDefaulters.filter(fo => {
          if (!attendanceSearchQuery) return true;
          const q = attendanceSearchQuery.toLowerCase();
          return (fo.fo_name || '').toLowerCase().includes(q) || (fo.district || '').toLowerCase().includes(q);
        });

        const totalSubmitted = attendance.submitted_count || submittedList.length;
        const totalOnLeave = attendance.on_leave_count || onLeaveList.length;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-6 w-full max-w-3xl sm:max-w-4xl shadow-2xl border border-slate-100 h-[94vh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-fade-in my-auto font-sans">
              {/* Header */}
              <div className="flex justify-between items-start pb-2 mb-2 sm:pb-3 sm:mb-3 border-b border-slate-100 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <span>Field Officer Attendance Radar</span>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{attendance.date || attendanceDate}</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-bold tracking-wide mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>Total Active Staff: <strong className="text-slate-700">{attendance.total_staff}</strong></span>
                    <span>| Submitted: <strong className="text-emerald-600">{totalSubmitted}</strong></span>
                    <span>| Pending: <strong className="text-rose-500">{attendance.missing_count}</strong></span>
                    <span>| On Leave: <strong className="text-amber-600">{totalOnLeave}</strong></span>
                    {chronicDefaulters.length > 0 && (
                      <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1">
                        <span>⚠️</span> {chronicDefaulters.length} Defaulters (2+ Days)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fetchAttendance(true, attendanceDate)} 
                    disabled={isAttendanceLoading}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                    title="Live Refresh Attendance from Server"
                  >
                    <svg className={`w-4 h-4 ${isAttendanceLoading ? 'animate-spin text-emerald-600' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  </button>
                  <button onClick={() => setShowAttendanceModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer">&times;</button>
                </div>
              </div>

              {/* 📅 Date Navigation Bar (Instant In-Memory Derivation) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-1.5 sm:p-2.5 mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                    <span>📅</span> Date:
                  </span>
                  <input
                    type="date"
                    value={attendanceDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      if (newDate) {
                        setAttendanceDate(newDate);
                        fetchAttendance(false, newDate);
                      }
                    }}
                    className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 font-mono shadow-2xs cursor-pointer"
                  />
                  {isAttendanceLoading && (
                    <span className="text-[10px] font-bold text-indigo-600 animate-pulse flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
                      Syncing...
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(attendanceDate);
                      d.setDate(d.getDate() - 1);
                      const prevDate = d.toISOString().slice(0, 10);
                      setAttendanceDate(prevDate);
                      fetchAttendance(false, prevDate);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                    title="Previous Day"
                  >
                    <span>◀</span> Prev
                  </button>
                  <button
                    type="button"
                    disabled={attendanceDate === new Date().toISOString().slice(0, 10)}
                    onClick={() => {
                      const todayStr = new Date().toISOString().slice(0, 10);
                      setAttendanceDate(todayStr);
                      fetchAttendance(false, todayStr);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all shadow-2xs cursor-pointer active:scale-95 ${
                      attendanceDate === new Date().toISOString().slice(0, 10)
                        ? 'bg-indigo-600 text-white'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    disabled={attendanceDate >= new Date().toISOString().slice(0, 10)}
                    onClick={() => {
                      const d = new Date(attendanceDate);
                      d.setDate(d.getDate() + 1);
                      const nextDate = d.toISOString().slice(0, 10);
                      setAttendanceDate(nextDate);
                      fetchAttendance(false, nextDate);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 active:scale-95 ${
                      attendanceDate >= new Date().toISOString().slice(0, 10)
                        ? 'bg-slate-100 text-slate-300 border border-slate-100 cursor-not-allowed'
                        : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 cursor-pointer'
                    }`}
                    title="Next Day"
                  >
                    Next <span>▶</span>
                  </button>
                </div>
              </div>

              {/* 📊 District Attendance Rollup Scorecard Pills */}
              <div className="mb-2 sm:mb-2.5 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    District Rollup Radar ({districtAttendanceRollup.length} Districts)
                  </span>
                  {attendanceDistrictFilter !== 'All' && (
                    <button
                      onClick={() => setAttendanceDistrictFilter('All')}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                    >
                      Clear District Filter (Show All)
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar text-xs font-bold">
                  <button
                    onClick={() => setAttendanceDistrictFilter('All')}
                    className={`px-3 py-1 rounded-xl border transition-all shrink-0 cursor-pointer ${
                      attendanceDistrictFilter === 'All'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    All Districts ({totalSubmitted}/{attendance.total_staff})
                  </button>
                  {districtAttendanceRollup.map(d => {
                    const isSelected = attendanceDistrictFilter === d.district;
                    const isFull = d.pct === 100;
                    const isGood = d.pct >= 70;
                    return (
                      <button
                        key={d.district}
                        onClick={() => setAttendanceDistrictFilter(d.district)}
                        className={`px-2.5 py-1 rounded-xl border transition-all shrink-0 flex items-center gap-1.5 cursor-pointer text-[11px] ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-black'
                            : isFull
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 font-bold'
                            : isGood
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200 font-bold'
                            : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 font-bold'
                        }`}
                        title={`${d.district}: ${d.submitted} of ${d.total} submitted (${d.pct}%)`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : isFull ? 'bg-emerald-500' : isGood ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                        <span>{d.district}</span>
                        <span className={`text-[10px] px-1 py-0.2 rounded-md ${isSelected ? 'bg-indigo-700 text-white' : 'bg-white/80 text-slate-700'}`}>
                          {d.submitted}/{d.total}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* District Active Notice & 1-Click WhatsApp export */}
                {attendanceDistrictFilter !== 'All' && (
                  <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 text-xs animate-fade-in">
                    <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                      <span>📍</span> Filtered by District: <strong>{attendanceDistrictFilter}</strong>
                    </span>
                    <button
                      onClick={() => copyDistrictSpecificSummary(attendanceDistrictFilter)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1 rounded-lg transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                      title={`Copy ${attendanceDistrictFilter} Attendance for WhatsApp`}
                    >
                      <span>📲</span> Copy {attendanceDistrictFilter} WhatsApp
                    </button>
                  </div>
                )}
              </div>

              {/* Navigation Tabs (4 Tabs: Missing, Submitted, On Leave, Defaulters) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-2xl mb-2 sm:mb-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('missing')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'missing'
                      ? 'bg-white text-rose-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span className="truncate">Pending ({filteredMissing.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('submitted')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'submitted'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="truncate">Submitted ({filteredSubmitted.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('on_leave')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'on_leave'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  <span className="truncate">🏖️ On Leave ({filteredOnLeave.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveAttendanceTab('defaulters')}
                  className={`py-2 px-2 sm:px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    activeAttendanceTab === 'defaulters'
                      ? 'bg-white text-purple-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0"></span>
                  <span className="truncate flex items-center gap-1">
                    Defaulters ({filteredDefaulters.length})
                    {filteredDefaulters.length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                    )}
                  </span>
                </button>
              </div>

              {/* ⏰ Time Filter Chips (Rendered under Submitted Tab) */}
              {activeAttendanceTab === 'submitted' && (
                <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 mb-2 sm:mb-2.5 shrink-0">
                  <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-0.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 shrink-0 flex items-center gap-1">
                      <span>⏰</span> Time:
                    </span>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('all')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs font-bold ${
                        attendanceTimeFilter === 'all'
                          ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All Times ({timeCounts.all})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('on_time')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'on_time'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 font-bold'
                      }`}
                    >
                      <span>🟢</span>
                      <span>On-Time: 5 PM - 8 PM ({timeCounts.on_time})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('late')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'late'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                          : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-bold'
                      }`}
                    >
                      <span>🟡</span>
                      <span>Late: 8 PM - 10 PM ({timeCounts.late})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('delayed')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'delayed'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs font-black'
                          : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-bold'
                      }`}
                    >
                      <span>🔴</span>
                      <span>Night: &gt; 10 PM ({timeCounts.delayed})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttendanceTimeFilter('early')}
                      className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                        attendanceTimeFilter === 'early'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-black'
                          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 font-bold'
                      }`}
                    >
                      <span>ℹ️</span>
                      <span>Mid-Day: &lt; 5 PM ({timeCounts.early})</span>
                    </button>
                    {timeCounts.next_day > 0 && (
                      <button
                        type="button"
                        onClick={() => setAttendanceTimeFilter('next_day')}
                        className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer shrink-0 whitespace-nowrap text-xs flex items-center gap-1.5 ${
                          attendanceTimeFilter === 'next_day'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                            : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 font-bold'
                        }`}
                      >
                        <span>⏰</span>
                        <span>Next Day Morning: &lt; 10 AM ({timeCounts.next_day})</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Search */}
              <div className="mb-2 sm:mb-2.5 shrink-0">
                <div className="relative">
                  <input
                    type="text"
                    value={attendanceSearchQuery}
                    onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                    placeholder={`Search ${activeAttendanceTab === 'missing' ? 'pending' : activeAttendanceTab === 'submitted' ? 'submitted' : activeAttendanceTab === 'on_leave' ? 'on leave / absent' : 'defaulters'} by name or district...`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all pl-9"
                  />
                  <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                  {attendanceSearchQuery && (
                    <button 
                      onClick={() => setAttendanceSearchQuery('')} 
                      className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>

              {/* List Container */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-1 min-h-[300px] sm:min-h-[320px]">
                {activeAttendanceTab === 'missing' ? (
                  filteredMissing.length > 0 ? (
                    filteredMissing.map((fo, idx) => {
                      const defKey = `${(fo.district || '').toLowerCase()}_${(fo.fo_name || '').toLowerCase()}`;
                      const defInfo = defaulterMap[defKey];
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 bg-slate-50 hover:bg-rose-50/30 rounded-xl border border-slate-100 hover:border-rose-200 transition-colors gap-2 sm:gap-0">
                          <div>
                            <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{fo.fo_name}</span>
                              {defInfo && (
                                <span className="text-[10px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.2 rounded-md inline-flex items-center gap-0.5">
                                  <span>⚠️</span> {defInfo.consecutiveDays} Days Inactive
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fo.district} &bull; {fo.designation || 'Field Officer'}</p>
                          </div>
                          <div className="flex items-center flex-wrap gap-1.5 self-end sm:self-center shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full">
                              Not Submitted
                            </span>
                            <button
                              type="button"
                              onClick={() => setLeaveActionModal({
                                district: fo.district,
                                fo_name: fo.fo_name,
                                date: attendance.date || attendanceDate,
                                status: 'leave',
                                reason_type: 'Casual',
                                remark: ''
                              })}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold px-2.5 py-1 rounded-xl transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                              title="Mark Officer as On Leave or Absent"
                            >
                              <span>🏖️</span>
                              <span>Mark Leave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                      {attendanceSearchQuery ? 'Koi missing officer match nahi hua.' : '🎉 Sabhi Field Officers ne report submit kar di hai!'}
                    </div>
                  )
                ) : activeAttendanceTab === 'submitted' ? (
                  filteredSubmitted.length > 0 ? (
                    filteredSubmitted.map((fo, idx) => {
                      const timeClassification = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3 bg-slate-50 hover:bg-emerald-50/40 rounded-xl border border-slate-100 hover:border-emerald-200 transition-colors gap-2 sm:gap-0">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
                              ✓
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <span>{fo.fo_name}</span>
                                {fo.submission_count > 1 && (
                                  <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.2 rounded-md">
                                    {fo.submission_count} edits
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {fo.district} &bull; {fo.designation || 'Field Officer'}
                              </p>
                              {fo.admin_remark && (
                                <p className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200/80 px-2 py-0.5 rounded-lg mt-1 inline-flex items-center gap-1">
                                  <span>📋</span>
                                  <span>Remark: <strong>{fo.admin_remark}</strong></span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5 sm:gap-2 self-end sm:self-center">
                            {fo.total_ids !== undefined && (
                              <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                                {fo.total_ids} IDs
                              </span>
                            )}
                            {fo.is_next_day ? (
                              <span className="text-[11px] font-black tracking-wide text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                <span>⏰</span> {fo.submitted_label || ('Next day morning ' + fo.submitted_time)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-black tracking-wide text-emerald-800 bg-emerald-100/80 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs">
                                <span>⏰</span> {fo.submitted_time || 'Submitted'}
                              </span>
                            )}
                            <span className={`text-[10px] px-2 py-0.5 rounded-lg border shadow-2xs ${timeClassification.badgeClass}`}>
                              {timeClassification.shortLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAttendanceRemarkModal({
                                district: fo.district,
                                fo_name: fo.fo_name,
                                date: attendance?.date || attendanceDate,
                                action: 'remark',
                                remark: fo.admin_remark || '',
                                status: 'leave',
                                reason_type: 'Casual'
                              })}
                              className="bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-xl border border-indigo-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                              title="Add Inspection Remark or Override Leave"
                            >
                              <span>📝</span>
                              <span>Remark / Leave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs">
                      {attendanceSearchQuery ? 'Koi submitted officer match nahi hua.' : 'Is filter category mein koi officer nahi mila.'}
                    </div>
                  )
                ) : activeAttendanceTab === 'on_leave' ? (
                  filteredOnLeave.length > 0 ? (
                    filteredOnLeave.map((fo, idx) => {
                      const isAbsent = fo.status === 'absent';
                      const isWeeklyOff = fo.status === 'weekly_off';
                      const statusLabel = isAbsent ? '⚠️ Absent' : isWeeklyOff ? '📅 Weekly Off' : '🏖️ On Leave';
                      const badgeStyle = isAbsent
                        ? 'bg-rose-100 text-rose-800 border-rose-200'
                        : isWeeklyOff
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200';

                      return (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3.5 bg-slate-50 hover:bg-amber-50/30 rounded-xl border border-slate-200 hover:border-amber-300 transition-colors gap-3">
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shrink-0 mt-0.5 ${
                              isAbsent ? 'bg-rose-100 text-rose-700' : isWeeklyOff ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isAbsent ? '⚠️' : isWeeklyOff ? '📅' : '🏖️'}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-black text-slate-800">{fo.fo_name}</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border ${badgeStyle}`}>
                                  {statusLabel}
                                </span>
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                  {fo.reason_type || 'Casual'}
                                </span>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                {fo.district} &bull; {fo.designation || 'Field Officer'}
                              </p>
                              {fo.remark && (
                                <p className="text-xs text-slate-600 mt-1 italic bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/60 inline-block">
                                  "{fo.remark}"
                                </p>
                              )}
                              {fo.marked_by_name && (
                                <p className="text-[10px] text-slate-400 font-medium mt-1">
                                  Marked by <strong className="text-slate-600">{fo.marked_by_name}</strong> {fo.marked_at ? `on ${String(fo.marked_at).slice(0, 16)}` : ''}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5 self-end sm:self-center shrink-0">
                            <button
                              type="button"
                              onClick={() => handleExecuteUnmarkLeave(fo.district, fo.fo_name, attendance.date || attendanceDate)}
                              disabled={isSavingLeave}
                              className="bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-bold px-3 py-1.5 rounded-xl border border-rose-200 hover:border-rose-300 transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Revert leave status and move back to Pending"
                            >
                              <span>🔄</span>
                              <span>Revert Leave</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs space-y-1">
                      <div className="text-2xl">🏖️</div>
                      <p className="font-bold text-slate-700">Koi officer leave par nahi hai.</p>
                      <p className="text-slate-400">Sabhi officers active duty ya pending status mein hain.</p>
                    </div>
                  )
                ) : (
                  /* Defaulters / Absence Streak Tab */
                  filteredDefaulters.length > 0 ? (
                    filteredDefaulters.map((fo, idx) => (
                      <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 sm:p-3.5 bg-amber-50/50 hover:bg-amber-50 rounded-xl border border-amber-200 transition-colors gap-2 sm:gap-0">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm shrink-0 mt-0.5">
                            ⚠️
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800 flex items-center gap-2">
                              <span>{fo.fo_name}</span>
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${fo.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                {fo.consecutiveDays} Days Streak
                              </span>
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {fo.district} &bull; Field Officer
                            </p>
                            <p className="text-[11px] font-semibold text-slate-600 mt-1">
                              Missed Dates: <span className="font-mono text-rose-700 font-bold">{fo.missedDates.join(', ')}</span>
                            </p>
                          </div>
                        </div>

                        <div className="self-end sm:self-center flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAttendanceRemarkModal({
                              district: fo.district,
                              fo_name: fo.fo_name,
                              date: attendance?.date || attendanceDate,
                              action: 'override_leave',
                              remark: '',
                              status: 'absent',
                              reason_type: 'Uninformed'
                            })}
                            className="bg-white hover:bg-amber-50 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-xl border border-amber-200 transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95"
                            title="Add Remark or Mark Absent"
                          >
                            <span>📝</span>
                            <span>Remark / Leave</span>
                          </button>
                          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border shadow-2xs ${fo.severity === 'CRITICAL' ? 'bg-rose-600 text-white border-rose-700' : 'bg-amber-500 text-white border-amber-600'}`}>
                            {fo.severity === 'CRITICAL' ? 'Critical Action' : 'Pending Follow-up'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-slate-400 font-semibold text-xs space-y-1">
                      <div className="text-2xl">🎉</div>
                      <p className="font-black text-slate-700 text-sm">Shandar! Koi Chronic Defaulter Nahi Hai.</p>
                      <p className="text-slate-400">Sabhi active officers regular reporting kar rahe hain (no 2+ consecutive missed days).</p>
                    </div>
                  )
                )}
              </div>

              {/* Action Footer */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 mt-auto shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {activeAttendanceTab === 'missing' ? (
                    <button 
                      onClick={copyMissingReminder}
                      disabled={attendance.missing_count === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${attendance.missing_count > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>{copiedAttendance ? 'Reminder Copied!' : 'Copy WhatsApp Reminder'}</span>
                    </button>
                  ) : activeAttendanceTab === 'submitted' ? (
                    <button 
                      onClick={copySubmittedSummary}
                      disabled={totalSubmitted === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${totalSubmitted > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                      <span>{copiedAttendance ? 'Submitted List Copied!' : 'Copy Submitted List (WhatsApp)'}</span>
                    </button>
                  ) : activeAttendanceTab === 'on_leave' ? (
                    <button 
                      type="button"
                      onClick={copyOnLeaveSummary}
                      disabled={totalOnLeave === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${totalOnLeave > 0 ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <span>🏖️</span>
                      <span>{copiedAttendance ? 'Leave List Copied!' : 'Copy Leave List (WhatsApp)'}</span>
                    </button>
                  ) : (
                    <button 
                      onClick={copyDefaultersWarning}
                      disabled={chronicDefaulters.length === 0}
                      className={`flex items-center gap-2 font-bold text-xs py-2.5 px-4 sm:px-5 rounded-xl transition-all ${chronicDefaulters.length > 0 ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 active:scale-95 cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    >
                      <span>🚨</span>
                      <span>{copiedAttendance ? 'Alert Copied!' : 'Copy Defaulters Alert (WhatsApp)'}</span>
                    </button>
                  )}

                  {attendanceDistrictFilter !== 'All' && (
                    <button
                      onClick={() => copyDistrictSpecificSummary(attendanceDistrictFilter)}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                    >
                      <span>📲</span>
                      <span>Copy {attendanceDistrictFilter} Report</span>
                    </button>
                  )}
                </div>

                <button onClick={() => setShowAttendanceModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-5 rounded-xl transition-colors cursor-pointer">Close</button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 🏖️ Mark Leave / Absent Modal */}
      {leaveActionModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black text-lg shrink-0">
                  🏖️
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">Mark Leave / Absent</h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {leaveActionModal.fo_name} &bull; <span className="font-bold text-indigo-600">{leaveActionModal.district}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingLeave && setLeaveActionModal(null)}
                disabled={isSavingLeave}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={leaveActionModal.date || attendanceDate}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Status</label>
                <select
                  value={leaveActionModal.status || 'leave'}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="leave">🏖️ On Leave</option>
                  <option value="absent">⚠️ Absent / Uninformed</option>
                  <option value="weekly_off">📅 Weekly Off</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Reason Type</label>
                <select
                  value={leaveActionModal.reason_type || 'Casual'}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, reason_type: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="Medical">Medical (Health / Illness)</option>
                  <option value="Casual">Casual (Emergency / Family)</option>
                  <option value="Official Work">Official Work / Field Training</option>
                  <option value="Personal">Personal Work</option>
                  <option value="Uninformed">Uninformed Absence</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Remark / Notes (Optional)</label>
                <textarea
                  rows="2"
                  value={leaveActionModal.remark || ''}
                  onChange={(e) => setLeaveActionModal(prev => ({ ...prev, remark: e.target.value }))}
                  placeholder="e.g. Fever, informed over call in morning"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLeaveActionModal(null)}
                disabled={isSavingLeave}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteMarkLeave}
                disabled={isSavingLeave}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md shadow-amber-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingLeave ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round"/></svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>Confirm Leave</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📝 Unified Attendance Remark / Leave Override Modal */}
      {attendanceRemarkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[115] flex items-center justify-center p-3 sm:p-4 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-lg shrink-0">
                  📝
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    Attendance Remark &amp; Leave
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    {attendanceRemarkModal.fo_name} &bull; <span className="font-bold text-indigo-600">{attendanceRemarkModal.district}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingAttendanceRemark && setAttendanceRemarkModal(null)}
                disabled={isSavingAttendanceRemark}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Segmented Action Toggle */}
            <div className="bg-slate-100 p-1 rounded-2xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAttendanceRemarkModal(prev => ({ ...prev, action: 'remark' }))}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  attendanceRemarkModal.action === 'remark'
                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>📋</span>
                <span>Inspection Remark</span>
              </button>
              <button
                type="button"
                onClick={() => setAttendanceRemarkModal(prev => ({ ...prev, action: 'override_leave' }))}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  attendanceRemarkModal.action === 'override_leave'
                    ? 'bg-white text-amber-700 shadow-sm border border-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>⚠️</span>
                <span>Override to Leave</span>
              </button>
            </div>

            {/* Context Notice */}
            {attendanceRemarkModal.action === 'remark' ? (
              <div className="bg-indigo-50/80 border border-indigo-100 rounded-2xl p-3 text-xs text-indigo-900 flex items-start gap-2">
                <span className="text-sm shrink-0">ℹ️</span>
                <p className="text-[11px] leading-relaxed">
                  Keeps report submitted. Records official inspection note on this day's attendance without voiding submission.
                </p>
              </div>
            ) : (
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <span className="text-sm shrink-0">⚠️</span>
                <p className="text-[11px] leading-relaxed">
                  Overrides this day's attendance status to Leave or Absent in official records and FO calendar.
                </p>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Date</label>
                <input
                  type="date"
                  value={attendanceRemarkModal.date || attendanceDate}
                  onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {attendanceRemarkModal.action === 'override_leave' && (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Status</label>
                    <select
                      value={attendanceRemarkModal.status || 'leave'}
                      onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, status: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="leave">🏖️ On Leave</option>
                      <option value="absent">⚠️ Absent / Uninformed</option>
                      <option value="weekly_off">📅 Weekly Off</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Reason Type</label>
                    <select
                      value={attendanceRemarkModal.reason_type || 'Casual'}
                      onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, reason_type: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    >
                      <option value="Medical">Medical (Health / Illness)</option>
                      <option value="Casual">Casual (Emergency / Family)</option>
                      <option value="Official Work">Official Work / Field Training</option>
                      <option value="Personal">Personal Work</option>
                      <option value="Uninformed">Uninformed Absence</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Remark / Note <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows="3"
                  value={attendanceRemarkModal.remark || ''}
                  onChange={(e) => setAttendanceRemarkModal(prev => ({ ...prev, remark: e.target.value }))}
                  placeholder={
                    attendanceRemarkModal.action === 'remark'
                      ? "e.g. Verified with Dr. Sharma / 3 IDs confirmed on spot"
                      : "e.g. Staff called in sick / Family emergency"
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAttendanceRemarkModal(null)}
                disabled={isSavingAttendanceRemark}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAttendanceRemark}
                disabled={isSavingAttendanceRemark}
                className={`px-5 py-2 rounded-xl text-white font-black text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                  attendanceRemarkModal.action === 'remark'
                    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                }`}
              >
                {isSavingAttendanceRemark ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round"/></svg>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    <span>{attendanceRemarkModal.action === 'remark' ? 'Save Remark' : 'Override Attendance'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📝 Admin & Sub-Admin Backdated Data Feeding Modal */}
      {showAdminFeedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-2xl border border-slate-100 max-h-[92vh] flex flex-col animate-fade-in my-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-black shrink-0">
                  📝
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    Feed Field Officer Data
                  </h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    {currentUser?.role === 'SUPER_ADMIN' ? 'Super Admin Portal' : `Sub-Admin Portal (${(currentUser?.allowed_districts || []).join(', ')})`}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowAdminFeedModal(false);
                  setFeedError('');
                  setFeedSuccess('');
                }} 
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Context Callout */}
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-3 mb-4 text-xs text-indigo-900 flex items-start gap-2 shrink-0">
              <span className="text-sm shrink-0">💡</span>
              <div className="text-[11px] leading-relaxed">
                Feed or backfill patient IDs for any Field Officer on <strong>any date</strong>. If a report already exists for that date, newly fed IDs will be safely merged. All targets, KPIs, and monthly metrics recalculate automatically.
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleAdminFeedSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              {/* Row 1: District, FO, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* District Dropdown */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    District <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={feedDistrict}
                    onChange={(e) => {
                      setFeedDistrict(e.target.value);
                      setFeedFoName('');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">-- Select District --</option>
                    {availableDistrictsForFeed.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Field Officer Dropdown / Input */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Field Officer <span className="text-red-500">*</span>
                  </label>
                  {availableFosForFeed.length > 0 ? (
                    <select
                      value={feedFoName}
                      onChange={(e) => setFeedFoName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    >
                      <option value="">-- Select Officer --</option>
                      {availableFosForFeed.map(fo => (
                        <option key={fo} value={fo}>{fo}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={feedFoName}
                      onChange={(e) => setFeedFoName(e.target.value)}
                      placeholder="e.g. Rajesh Kumar"
                      className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  )}
                </div>

                {/* Reporting Date */}
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Date of Reporting <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={feedDate}
                    onChange={(e) => setFeedDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    required
                  />
                </div>
              </div>

              {/* All-In-One Indicator Category Input Section */}
              <div className="space-y-4 pt-1">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <span>📋</span> Patient Indicator IDs (Multi-Category Concurrent Input)
                    </label>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                      Paste or type 9-digit Patient IDs directly into any category. You can fill multiple categories at once before saving.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedShowAllCategories(prev => !prev)}
                    className="text-[11px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    {feedShowAllCategories ? '− Show Primary Indicators (8)' : '+ Show All Indicators (20)'}
                  </button>
                </div>

                {/* Concurrent Category Input Grid (Responsive 3-Column Smooth Flow) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(feedShowAllCategories ? feedCategoriesConfig : feedCategoriesConfig.filter(c => c.isPrimary)).map(cat => {
                    const currentVal = feedCategoryInputs[cat.key] || '';
                    const is8or9 = (cat.key === 'fdc_provided_ids' || cat.key === 'outcome_assigned_ids');
                    const tokenRegex = is8or9 ? /^\d{8,9}$/ : /^\d{9}$/;
                    const tokens = currentVal.split(/[\s,;\n\r\t]+/).map(t => t.trim()).filter(Boolean);
                    const validTokens = Array.from(new Set(tokens.filter(t => tokenRegex.test(t))));
                    const invalidTokens = tokens.filter(t => !tokenRegex.test(t));

                    return (
                      <div 
                        key={cat.key} 
                        className={`p-3 rounded-2xl border transition-all ${
                          validTokens.length > 0 
                            ? 'bg-emerald-50/40 border-emerald-200' 
                            : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Header for Category */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </span>
                          <div className="flex items-center gap-1">
                            {validTokens.length > 0 && (
                              <span className="text-[10px] font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full shadow-2xs">
                                ✓ {validTokens.length} IDs
                              </span>
                            )}
                            {invalidTokens.length > 0 && (
                              <span className="text-[10px] font-black bg-rose-600 text-white px-2 py-0.5 rounded-full">
                                ⚠️ {invalidTokens.length} Invalid
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Textarea for pasting */}
                        <textarea
                          rows={3}
                          value={currentVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFeedCategoryInputs(prev => ({
                              ...prev,
                              [cat.key]: val
                            }));
                          }}
                          placeholder={`Paste 9-digit IDs for ${cat.label}... (comma/newline separated)`}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 font-mono text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-300 placeholder:font-sans custom-scrollbar"
                        />

                        {/* Category Footer: Clear button & status */}
                        <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                          <span>{validTokens.length > 0 ? `${validTokens.length} valid 9-digit ID(s)` : 'No IDs added'}</span>
                          {currentVal && (
                            <button
                              type="button"
                              onClick={() => setFeedCategoryInputs(prev => ({ ...prev, [cat.key]: '' }))}
                              className="text-slate-400 hover:text-red-500 font-bold underline cursor-pointer"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Remarks / Note */}
              <div className="pt-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Feeding Remarks / Note (Optional)
                </label>
                <input
                  type="text"
                  value={feedRemarks}
                  onChange={(e) => setFeedRemarks(e.target.value)}
                  placeholder="e.g. Backfilled from WhatsApp register / Verified by DTO"
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Premium Live Submission Feedback */}
              {feedLoading && (
                <div className="p-4 bg-gradient-to-r from-indigo-50/95 via-sky-50/95 to-teal-50/95 border border-indigo-200/90 rounded-2xl flex items-center gap-3.5 shadow-xs animate-pulse">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900">Validating IDs &amp; Syncing to Cloud Database...</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase tracking-wider">Cloud Stream</span>
                    </div>
                    <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                      Checking district registry, merging indicators and recording audit trail. Please wait.
                    </p>
                  </div>
                </div>
              )}

              {/* Error Alert */}
              {feedError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-800 flex items-start gap-2 animate-fade-in shadow-2xs">
                  <span className="text-base shrink-0">⚠️</span>
                  <div className="flex-1">
                    <p className="font-bold">{feedError}</p>
                    <p className="text-[10px] text-rose-600 font-normal mt-0.5">If problem persists, check network or retry with fewer IDs.</p>
                  </div>
                </div>
              )}

              {/* Success Banner & Post-Save Actions */}
              {feedSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-900 space-y-3 animate-fade-in">
                  <div className="flex items-start gap-2">
                    <span className="text-lg shrink-0">✅</span>
                    <div className="flex-1">
                      <p className="font-black text-emerald-950 text-sm">{feedSuccess}</p>
                      <p className="text-emerald-700 text-[11px] font-medium mt-0.5">
                        The dashboard and field reports have been refreshed. You can feed another date for the same officer below, or close when done.
                      </p>
                    </div>
                  </div>

                  {/* Fast Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        setFeedCategoryInputs({});
                        setFeedRemarks('');
                        setFeedSuccess('');
                        setFeedError('');
                        // Date stays as current or user can change; district & fo stay selected!
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-4 py-2 rounded-xl shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>➕</span>
                      <span>Feed Another Date for {feedFoName}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminFeedModal(false);
                        setFeedCategoryInputs({});
                        setFeedRemarks('');
                        setFeedSuccess('');
                        setFeedError('');
                      }}
                      className="bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs px-4 py-2 rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      ✓ Done / Close
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Actions Footer */}
              {(() => {
                let totalReady = 0;
                feedCategoriesConfig.forEach(cat => {
                  const raw = feedCategoryInputs[cat.key] || '';
                  const is8or9 = (cat.key === 'fdc_provided_ids' || cat.key === 'outcome_assigned_ids');
                  const tokenRegex = is8or9 ? /^\d{8,9}$/ : /^\d{9}$/;
                  const validCount = raw.split(/[\s,;\n\r\t]+/).filter(t => tokenRegex.test(t.trim())).length;
                  totalReady += validCount;
                });

                return (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs font-bold text-slate-600">
                      Total Ready: <span className="font-mono font-black text-indigo-600 text-sm">{totalReady}</span> Patient IDs
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdminFeedModal(false);
                          setFeedError('');
                          setFeedSuccess('');
                        }}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={feedLoading}
                        className={`px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                          feedLoading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20 active:scale-95'
                        }`}
                      >
                        {feedLoading ? (
                          <>
                            <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                            <span>Saving &amp; Updating...</span>
                          </>
                        ) : (
                          <>
                            <span>✓</span>
                            <span>Save All Indicators for {feedDate || 'Date'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* Dynamic Monthly Targets Modal */}
      {showTargetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            {/* Modal Header with Month & District Pickers */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">🎯</span>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">Dynamic Monthly Targets</h2>
                </div>
                <p className="text-xs text-slate-500 font-medium">Harr mahine ke liye alag target configure karein (Bihar Total: 6,357)</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Month Picker */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs">
                  <span className="text-[10px] font-black uppercase text-purple-600">Month:</span>
                  <input 
                    type="month" 
                    value={targetModalMonth} 
                    onChange={(e) => {
                      const newM = e.target.value;
                      setTargetModalMonth(newM);
                      loadTargets(targetModalDistrict, newM);
                    }}
                    className="text-xs font-black text-slate-800 outline-none bg-transparent cursor-pointer"
                  />
                </div>

                {/* District Filter */}
                <select 
                  value={targetModalDistrict} 
                  onChange={(e) => {
                    setTargetModalDistrict(e.target.value);
                    loadTargets(e.target.value, targetModalMonth);
                  }}
                  className="bg-white border border-slate-200 text-slate-700 font-bold text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-purple-500 shadow-xs"
                >
                  <option value="All">All Districts ({targetModalDistricts.length})</option>
                  {targetModalDistricts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <button onClick={() => setShowTargetModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none ml-1">&times;</button>
              </div>
            </div>

            {/* Custom Target Action Bar */}
            <div className="px-5 py-3 bg-purple-50/60 border-b border-purple-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-900">
                <span>⚡ Custom Bulk Setter for {targetModalDistrict === 'All' ? 'All Permitted Districts' : targetModalDistrict}:</span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="number"
                  placeholder="Set Officer Target"
                  value={bulkTargetValue}
                  onChange={(e) => setBulkTargetValue(e.target.value)}
                  className="w-36 bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = Number(bulkTargetValue);
                    if (val > 0) {
                      setTargetsData(prev => prev.map(t => {
                        if (targetModalDistrict === 'All' || t.district === targetModalDistrict) {
                          return { ...t, target: val };
                        }
                        return t;
                      }));
                      setBulkTargetValue("");
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Staff List with Targets and District Total Indicators */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
              {(targetModalDistrict === 'All' ? targetModalDistricts : [targetModalDistrict]).map(dist => {
                const officers = staffDirectory[dist] || [];
                const distTotal = officers.reduce((sum, fo) => {
                  const tData = targetsData.find(t => t.fo_name === fo && t.district === dist);
                  return sum + (tData ? (Number(tData.target) || 0) : 50);
                }, 0);

                return (
                  <div key={dist} className="space-y-2.5 bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-purple-600"></span>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">{dist} District ({officers.length} Staff)</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full border border-purple-200">
                          District Total: {distTotal}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {officers.map(fo => {
                        const tData = targetsData.find(t => t.fo_name === fo && t.district === dist);
                        const currentTarget = tData ? tData.target : 50;
                        return (
                          <div key={fo} className="flex justify-between items-center bg-white border border-slate-100 hover:border-purple-200 p-3 rounded-xl transition-colors shadow-2xs">
                            <div className="truncate mr-2">
                              <span className="font-bold text-xs text-slate-800 block truncate">{fo}</span>
                              <span className="text-[10px] font-semibold text-slate-400">{dist}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-bold text-slate-400">Target:</span>
                              <input 
                                type="number" 
                                value={currentTarget} 
                                onChange={(e) => handleTargetChange(dist, fo, e.target.value)} 
                                className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-center font-black text-xs text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner" 
                                placeholder="50" 
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/80 flex flex-wrap justify-between items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">
                Saving will apply targets strictly to <strong className="text-purple-700">{targetModalMonth}</strong>.
              </span>
              <div className="flex items-center gap-3 ml-auto">
                <button onClick={() => setShowTargetModal(false)} className="px-4 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
                <button 
                  onClick={saveAllTargets} 
                  disabled={isSavingTargets}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-2"
                >
                  {isSavingTargets ? 'Saving...' : `Save ${targetModalMonth} Targets`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 👥 Admin Users & Roles Management Suite (Super Admin Only) */}
      {showAdminUsersModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">👥</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">Admin Users &amp; Roles Management</h2>
                  <p className="text-xs text-slate-500 font-medium">Super Admin Authority: Create MIS logins, assign permitted districts, and toggle permissions</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUserFormModal({
                      mode: 'create',
                      user_id: '',
                      username: '',
                      name: '',
                      password: '',
                      role: 'SUB_ADMIN',
                      allowed_districts: ['All'],
                      permissions: {
                        can_edit_targets: false,
                        can_manage_staff: false,
                        can_edit_patient_ids: false,
                        can_export_reports: true
                      },
                      error: '',
                      loading: false
                    });
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                >
                  <span>➕</span>
                  <span>Create Admin User</span>
                </button>
                <button onClick={() => setShowAdminUsersModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none ml-1">&times;</button>
              </div>
            </div>

            {/* Users Table */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
              {loadingAdminUsers ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs">Loading Admin Accounts...</div>
              ) : adminUsersList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs">No admin accounts found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">User / ID</th>
                        <th className="py-2.5 px-3">Name</th>
                        <th className="py-2.5 px-3">Role</th>
                        <th className="py-2.5 px-3">Allowed Districts</th>
                        <th className="py-2.5 px-3">Permissions</th>
                        <th className="py-2.5 px-3">Last Login</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {adminUsersList.map(u => (
                        <tr key={u.user_id || u.username} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-mono font-bold text-slate-800">
                            {u.username}
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-700">
                            {u.name}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${u.role === 'SUPER_ADMIN' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                              {u.role === 'SUPER_ADMIN' ? '👑 Super Admin' : '🛡️ Sub Admin'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-[11px] font-semibold text-slate-600">
                              {Array.isArray(u.allowed_districts) && u.allowed_districts.includes('All') 
                                ? 'All (22 Districts)' 
                                : Array.isArray(u.allowed_districts) ? u.allowed_districts.join(', ') : 'All'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1">
                              {u.role === 'SUPER_ADMIN' ? (
                                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-200">Full Master Access</span>
                              ) : (
                                <>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${u.permissions?.can_edit_targets ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-400 line-through border-slate-200'}`}>Targets</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${u.permissions?.can_manage_staff ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-400 line-through border-slate-200'}`}>Staff</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${u.permissions?.can_edit_patient_ids ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-400 line-through border-slate-200'}`}>Edit IDs</span>
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${u.permissions?.can_export_reports ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 line-through border-slate-200'}`}>Exports</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[10px] font-mono text-slate-400">
                            {u.last_login || 'Never'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setUserFormModal({
                                    mode: 'edit',
                                    user_id: u.user_id || u.username,
                                    username: u.username,
                                    name: u.name || '',
                                    password: '',
                                    role: u.role || 'SUB_ADMIN',
                                    allowed_districts: u.allowed_districts || ['All'],
                                    permissions: u.permissions || {
                                      can_edit_targets: false,
                                      can_manage_staff: false,
                                      can_edit_patient_ids: false,
                                      can_export_reports: true
                                    },
                                    error: '',
                                    loading: false
                                  });
                                }}
                                className="bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 px-2.5 py-1 rounded-lg font-bold text-xs transition-colors"
                              >
                                Edit
                              </button>
                              {u.username !== 'admin' && (
                                <button
                                  type="button"
                                  onClick={() => deleteAdminUser(u.user_id || u.username)}
                                  className="bg-red-50 hover:bg-red-500 hover:text-white text-red-600 px-2 py-1 rounded-lg font-bold text-xs transition-colors"
                                  title="Delete User"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex justify-end">
              <button onClick={() => setShowAdminUsersModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 px-5 rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* User Create / Edit Form Sub-Modal */}
      {userFormModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
              <h3 className="text-base font-black text-slate-800">
                {userFormModal.mode === 'create' ? '➕ Create New Admin Account' : `✏️ Edit Account: ${userFormModal.username}`}
              </h3>
              <button onClick={() => setUserFormModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>

            <form onSubmit={saveAdminUser} className="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
              {userFormModal.error && (
                <div className="bg-red-50 text-red-600 p-2.5 rounded-xl text-xs font-bold border border-red-100">{userFormModal.error}</div>
              )}

              {userFormModal.mode === 'create' && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Username (Login ID)</label>
                  <input
                    type="text"
                    required
                    value={userFormModal.username}
                    onChange={(e) => setUserFormModal({ ...userFormModal, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                    placeholder="e.g. mis_buxar or admin_gaya"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Full Name / Display Name</label>
                <input
                  type="text"
                  required
                  value={userFormModal.name}
                  onChange={(e) => setUserFormModal({ ...userFormModal, name: e.target.value })}
                  placeholder="e.g. Buxar Lead MIS Officer"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                  {userFormModal.mode === 'create' ? 'Password' : 'New Password (Leave blank to keep existing)'}
                </label>
                <input
                  type="password"
                  required={userFormModal.mode === 'create'}
                  value={userFormModal.password}
                  onChange={(e) => setUserFormModal({ ...userFormModal, password: e.target.value })}
                  placeholder={userFormModal.mode === 'create' ? 'Enter password' : '••••••••'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Account Role</label>
                <select
                  value={userFormModal.role}
                  onChange={(e) => setUserFormModal({ ...userFormModal, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="SUB_ADMIN">Sub Admin / District MIS (Restricted)</option>
                  <option value="SUPER_ADMIN">Super Admin (Full Master Authority)</option>
                </select>
              </div>

              {/* Permitted Districts */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Permitted Districts</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (userFormModal.allowed_districts.includes('All')) {
                        setUserFormModal({ ...userFormModal, allowed_districts: [] });
                      } else {
                        setUserFormModal({ ...userFormModal, allowed_districts: ['All'] });
                      }
                    }}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    {userFormModal.allowed_districts.includes('All') ? 'Deselect All' : 'Select All (Statewide)'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200 custom-scrollbar">
                  {Object.keys(staffDirectory).sort().map(d => {
                    const isChecked = userFormModal.allowed_districts.includes('All') || userFormModal.allowed_districts.includes(d);
                    return (
                      <label key={d} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let curr = userFormModal.allowed_districts.includes('All') 
                              ? Object.keys(staffDirectory) 
                              : [...userFormModal.allowed_districts];
                            if (e.target.checked) {
                              if (!curr.includes(d)) curr.push(d);
                            } else {
                              curr = curr.filter(x => x !== d && x !== 'All');
                            }
                            setUserFormModal({ ...userFormModal, allowed_districts: curr });
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="truncate">{d}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Granular Tool Permissions */}
              {userFormModal.role !== 'SUPER_ADMIN' && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Granular Permissions</label>
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer">
                      <span>🎯 Edit Monthly Targets</span>
                      <input
                        type="checkbox"
                        checked={userFormModal.permissions?.can_edit_targets || false}
                        onChange={(e) => setUserFormModal({
                          ...userFormModal,
                          permissions: { ...userFormModal.permissions, can_edit_targets: e.target.checked }
                        })}
                        className="rounded text-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer">
                      <span>👥 Manage Staff &amp; Reset PINs</span>
                      <input
                        type="checkbox"
                        checked={userFormModal.permissions?.can_manage_staff || false}
                        onChange={(e) => setUserFormModal({
                          ...userFormModal,
                          permissions: { ...userFormModal.permissions, can_manage_staff: e.target.checked }
                        })}
                        className="rounded text-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer">
                      <span>✏️ Modify / Delete Patient IDs</span>
                      <input
                        type="checkbox"
                        checked={userFormModal.permissions?.can_edit_patient_ids || false}
                        onChange={(e) => setUserFormModal({
                          ...userFormModal,
                          permissions: { ...userFormModal.permissions, can_edit_patient_ids: e.target.checked }
                        })}
                        className="rounded text-indigo-600"
                      />
                    </label>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 cursor-pointer">
                      <span>📥 Download Excel Reports &amp; Workbooks</span>
                      <input
                        type="checkbox"
                        checked={userFormModal.permissions?.can_export_reports || false}
                        onChange={(e) => setUserFormModal({
                          ...userFormModal,
                          permissions: { ...userFormModal.permissions, can_export_reports: e.target.checked }
                        })}
                        className="rounded text-indigo-600"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUserFormModal(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={userFormModal.loading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold text-xs shadow-md shadow-indigo-600/20 active:scale-95 transition-all"
                >
                  {userFormModal.loading ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📜 Administrative Activity Audit Radar Modal (Super Admin Only) */}
      {showAuditModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📜</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800">Activity Audit Trail</h2>
                  <p className="text-xs text-slate-500 font-medium">Real-Time Master Log of all Target updates, Patient ID edits, PIN resets, and logins</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black px-2.5 py-1.5 rounded-xl flex items-center gap-1 shadow-2xs">
                  <span>🛡️</span>
                  <span>Retention: 30 Days (Auto-Pruned)</span>
                </span>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={handleManualPruneAuditLogs}
                    disabled={isPruningAudit}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    title="Manually purge logs older than 30 days immediately"
                  >
                    <span>🧹</span>
                    <span>{isPruningAudit ? "Pruning..." : "Prune Old (>30d)"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={exportAuditLogsExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                  title="Download complete audit log report as Excel .xlsx"
                >
                  <span>📥</span>
                  <span>Export Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => fetchAuditLogs()}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                >
                  <span className={loadingAuditLogs ? "animate-spin" : ""}>🔄</span>
                  <span>Refresh</span>
                </button>
                <button onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none ml-1">&times;</button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="px-5 py-3 bg-amber-50/50 border-b border-amber-100 flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-black text-amber-900 uppercase">Filters:</span>
              
              {/* Action Filter */}
              <select
                value={auditFilterAction}
                onChange={(e) => {
                  setAuditFilterAction(e.target.value);
                  fetchAuditLogs(e.target.value, undefined, undefined, undefined);
                }}
                className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
              >
                <option value="All">All Actions</option>
                <option value="LOGIN_FAILED">🚨 Failed Logins / Intruder Attempts</option>
                <option value="LOGIN_SUCCESS">🔓 Successful Logins</option>
                <option value="TARGET_UPDATED">🎯 Target Updates</option>
                <option value="ID_EDITED">✏️ ID Edits / Deletions</option>
                <option value="ADMIN_USER_CREATED">➕ User Created</option>
                <option value="PERMISSIONS_UPDATED">🛡️ Permissions Changed</option>
                <option value="ADMIN_USER_DELETED">🗑️ User Deleted</option>
                <option value="PIN_RESET">🔑 PIN Resets</option>
                <option value="REPORT_DOWNLOADED">📥 Report Downloads</option>
              </select>

              {/* District Filter */}
              <select
                value={auditFilterDistrict}
                onChange={(e) => {
                  setAuditFilterDistrict(e.target.value);
                  fetchAuditLogs(undefined, e.target.value, undefined, undefined);
                }}
                className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
              >
                <option value="All">All Districts</option>
                {Object.keys(staffDirectory).sort().map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Actor / User Filter */}
              <select
                value={auditFilterUser}
                onChange={(e) => {
                  setAuditFilterUser(e.target.value);
                  fetchAuditLogs(undefined, undefined, e.target.value, undefined);
                }}
                className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
              >
                <option value="All">All Actors</option>
                <option value="admin">Super Admin (admin)</option>
                {adminUsersList && adminUsersList.filter(u => u.user_id !== 'admin').map(u => (
                  <option key={u.user_id} value={u.user_id}>{u.name || u.username} ({u.user_id})</option>
                ))}
                <option value="system">System Automated</option>
              </select>

              {/* Quick Security Radar Filter Button */}
              <button
                type="button"
                onClick={() => {
                  const nextAction = auditFilterAction === 'LOGIN_FAILED' ? 'All' : 'LOGIN_FAILED';
                  setAuditFilterAction(nextAction);
                  fetchAuditLogs(nextAction, undefined, undefined, undefined);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 cursor-pointer ${
                  auditFilterAction === 'LOGIN_FAILED'
                    ? 'bg-rose-600 text-white ring-2 ring-rose-400'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                }`}
                title="1-Click Security Radar: Filter failed login attempts"
              >
                <span>🚨</span>
                <span>Security Radar</span>
              </button>

              {/* Search Bar */}
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  placeholder="Search user, ID, IP, details..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchAuditLogs(undefined, undefined, undefined, auditSearchQuery);
                    }
                  }}
                  className="bg-white border border-amber-200 text-slate-800 text-xs rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 w-44 sm:w-56"
                />
                <button
                  type="button"
                  onClick={() => fetchAuditLogs(undefined, undefined, undefined, auditSearchQuery)}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 custom-scrollbar">
              {loadingAuditLogs ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs">Loading Audit Radar Logs...</div>
              ) : auditLogsList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs">No audit records found matching criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-black uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">Timestamp (IST)</th>
                        <th className="py-2.5 px-3">Actor / Admin</th>
                        <th className="py-2.5 px-3">Action Type</th>
                        <th className="py-2.5 px-3">District &amp; Officer</th>
                        <th className="py-2.5 px-3">Details / Location / IP / Device</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogsList.map((log, idx) => {
                        const isFailedLogin = log.action_type === 'LOGIN_FAILED' || log.action_type === 'LOGIN_BLOCKED';
                        const clientDevice = (log.diff && log.diff.device) || '';
                        const clientIp = log.ip_address || (log.diff && log.diff.ip) || '';
                        const clientLocation = log.location || (log.diff && log.diff.location) || '';
                        const formattedTime = formatAuditTimestamp(log.timestamp, log.timestamp_formatted);

                        return (
                          <tr key={idx} className={`transition-colors ${isFailedLogin ? 'bg-rose-50/80 hover:bg-rose-100/70 border-l-4 border-l-rose-500' : 'hover:bg-slate-50/70'}`}>
                            <td className="py-3 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap font-bold">
                              {formattedTime}
                            </td>
                            <td className="py-3 px-3">
                              <span className={`font-bold block ${isFailedLogin ? 'text-rose-800' : 'text-slate-800'}`}>
                                {log.user_name || log.user_id || 'System'}
                              </span>
                              <span className={`text-[9px] font-black uppercase ${isFailedLogin ? 'text-rose-500' : 'text-indigo-600'}`}>
                                {log.role || 'SUPER_ADMIN'} {log.user_id && log.user_id !== log.user_name ? `(${log.user_id})` : ''}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                isFailedLogin ? 'bg-rose-600 text-white shadow-xs' :
                                log.action_type === 'LOGIN_SUCCESS' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                log.action_type === 'TARGET_UPDATED' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                                log.action_type === 'ID_EDITED' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                log.action_type === 'PIN_RESET' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                log.action_type?.includes('USER') ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                                'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {log.action_type?.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-semibold text-slate-700 block">{log.district || 'Statewide'}</span>
                              {log.target_officer && (
                                <span className="text-[10px] text-slate-400 font-medium">{log.target_officer}</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <p className={`font-medium max-w-md ${isFailedLogin ? 'text-rose-950 font-semibold' : 'text-slate-700'}`}>
                                {log.details}
                              </p>
                              {(clientIp || clientLocation || clientDevice) && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {clientIp && (
                                    <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                      🌐 IP: {clientIp}
                                    </span>
                                  )}
                                  {clientLocation && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                                      📍 {clientLocation}
                                    </span>
                                  )}
                                  {clientDevice && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">
                                      {clientDevice}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Showing {auditLogsList.length} audit records</span>
              <button onClick={() => setShowAuditModal(false)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 px-5 rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Unread Urgent Broadcast Alert Popup Modal */}
      {unreadBroadcastPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 w-full max-w-lg animate-scale-up">
            <div className={`p-6 text-white ${
              unreadBroadcastPopup.priority === 'HIGH' ? 'bg-gradient-to-r from-rose-600 to-red-600' :
              unreadBroadcastPopup.priority === 'MEDIUM' ? 'bg-gradient-to-r from-amber-500 to-orange-600' :
              'bg-gradient-to-r from-indigo-600 to-purple-600'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-3xl">
                  {unreadBroadcastPopup.priority === 'HIGH' ? '🚨' : unreadBroadcastPopup.priority === 'MEDIUM' ? '⚠️' : '📢'}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/20 text-white">
                  {unreadBroadcastPopup.priority || 'MEDIUM'} PRIORITY
                </span>
              </div>
              <h3 className="text-xl font-black mt-3 leading-tight tracking-tight">
                {unreadBroadcastPopup.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-white/90">
                <span>👤 {unreadBroadcastPopup.created_by_user}</span>
                <span>&bull;</span>
                <span>🎯 {unreadBroadcastPopup.target_audience === 'FIELD_STAFF' ? 'Field Staff' : unreadBroadcastPopup.target_audience === 'SUB_ADMINS' ? 'Sub-Admins' : 'All Teams'}</span>
                <span>&bull;</span>
                <span>📍 {unreadBroadcastPopup.target_districts?.includes('All') ? 'Statewide' : unreadBroadcastPopup.target_districts?.join(', ')}</span>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-sm text-slate-800 font-medium leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                {unreadBroadcastPopup.message}
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  onClick={() => dismissBroadcastPopup(unreadBroadcastPopup.id)}
                  className={`w-full py-3.5 rounded-xl font-black text-sm text-white shadow-lg active:scale-95 transition-all uppercase tracking-wider ${
                    unreadBroadcastPopup.priority === 'HIGH' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' :
                    unreadBroadcastPopup.priority === 'MEDIUM' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30' :
                    'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
                  }`}
                >
                  ✓ Acknowledge &amp; Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Studio Modal */}
      {showBroadcastStudio && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-scale-up">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-md shadow-indigo-600/20">
                  📢
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                    Central Broadcast Studio
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Broadcast instant alerts, directives &amp; urgent instructions to field staff &amp; sub-admins.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!newBroadcastModal && (
                  <button
                    onClick={() => {
                      const allowed = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
                        ? currentUser.allowed_districts
                        : ['All'];
                      setNewBroadcastModal({
                        title: '',
                        message: '',
                        priority: 'MEDIUM',
                        target_audience: 'ALL',
                        target_districts: allowed,
                        loading: false,
                        error: ''
                      });
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 active:scale-95"
                  >
                    <span>➕</span>
                    <span>Compose Broadcast</span>
                  </button>
                )}
                <button
                  onClick={() => setShowBroadcastStudio(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none ml-2"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              {/* Compose Form */}
              {newBroadcastModal && (
                <form onSubmit={handleCreateBroadcast} className="bg-indigo-50/60 rounded-2xl p-5 border border-indigo-100 space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-indigo-100/80 pb-3">
                    <h4 className="text-sm font-black text-indigo-950 flex items-center gap-2">
                      <span>✍️</span> Compose New Broadcast Notice
                    </h4>
                    <button
                      type="button"
                      onClick={() => setNewBroadcastModal(null)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>

                  {newBroadcastModal.error && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-xl">
                      {newBroadcastModal.error}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                        Urgency / Priority Level
                      </label>
                      <select
                        value={newBroadcastModal.priority}
                        onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="HIGH">🚨 HIGH (Urgent Modal Popup on Login)</option>
                        <option value="MEDIUM">⚠️ MEDIUM (Notice Banner &amp; Alert)</option>
                        <option value="INFO">📢 INFO (General Announcement)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                        Target Audience
                      </label>
                      <select
                        value={newBroadcastModal.target_audience}
                        onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, target_audience: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="ALL">👥 Everyone (Field Staff &amp; Sub-Admins)</option>
                        <option value="FIELD_STAFF">🩺 Field Officers (Field Staff App Only)</option>
                        <option value="SUB_ADMINS">🛡️ Sub-Admins (Admin Portal Only)</option>
                      </select>
                    </div>
                  </div>

                  {/* Target Districts */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1.5">
                      Target Districts {currentUser?.role === 'SUB_ADMIN' && '(Restricted to your assigned districts)'}
                    </label>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap gap-2 max-h-36 overflow-y-auto custom-scrollbar">
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            const isAll = newBroadcastModal.target_districts.includes('All');
                            setNewBroadcastModal(prev => ({
                              ...prev,
                              target_districts: isAll ? [] : ['All']
                            }));
                          }}
                          className={`text-xs font-black px-3 py-1.5 rounded-lg border transition-all ${
                            newBroadcastModal.target_districts.includes('All')
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          🌐 Statewide (All Districts)
                        </button>
                      )}
                      {districts.filter(d => d !== 'All').map(d => {
                        const isSelected = newBroadcastModal.target_districts.includes(d) || (isSuperAdmin && newBroadcastModal.target_districts.includes('All'));
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              let current = newBroadcastModal.target_districts.filter(x => x !== 'All');
                              if (current.includes(d)) {
                                current = current.filter(x => x !== d);
                              } else {
                                current.push(d);
                              }
                              setNewBroadcastModal(prev => ({
                                ...prev,
                                target_districts: current
                              }));
                            }}
                            className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      Announcement Title
                    </label>
                    <input
                      type="text"
                      value={newBroadcastModal.title}
                      onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g. Urgent: Complete Missing DBT & Cult/DST IDs by 6 PM"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                      Announcement Message Body
                    </label>
                    <textarea
                      rows={3}
                      value={newBroadcastModal.message}
                      onChange={(e) => setNewBroadcastModal(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Type the full announcement message here. Will be shown on staff login popup and notice board..."
                      className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setNewBroadcastModal(null)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={newBroadcastModal.loading}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-black shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                    >
                      {newBroadcastModal.loading ? 'Publishing...' : '🚀 Publish Broadcast'}
                    </button>
                  </div>
                </form>
              )}

              {/* Broadcasts History List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Active &amp; Past Broadcasts ({broadcastsList.length})
                  </h4>
                  <button
                    onClick={fetchAllBroadcasts}
                    disabled={loadingBroadcasts}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                  >
                    <span className={loadingBroadcasts ? "animate-spin" : ""}>🔄</span> Refresh
                  </button>
                </div>

                {loadingBroadcasts ? (
                  <div className="text-center py-10 text-slate-400 font-bold text-xs">Loading broadcasts...</div>
                ) : broadcastsList.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 font-bold text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No broadcasts created yet. Click "+ Compose Broadcast" to send an alert.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {broadcastsList.map((b) => {
                      const isHigh = b.priority === 'HIGH';
                      const isMed = b.priority === 'MEDIUM';
                      const isAuthor = isSuperAdmin || b.created_by_user === currentUser?.username || b.created_by_user === currentUser?.name;

                      return (
                        <div key={b.id} className="p-4 bg-white hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                isHigh ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                isMed ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              }`}>
                                {b.priority || 'MEDIUM'}
                              </span>
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                🎯 {b.target_audience === 'FIELD_STAFF' ? 'Field Staff' : b.target_audience === 'SUB_ADMINS' ? 'Sub-Admins' : 'Everyone'}
                              </span>
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                📍 {b.target_districts?.includes('All') ? 'Statewide' : b.target_districts?.join(', ')}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium ml-auto sm:ml-0">
                                {b.created_at ? new Date(b.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                            <h5 className="text-sm font-black text-slate-800">{b.title}</h5>
                            <p className="text-xs text-slate-600 font-medium whitespace-pre-wrap">{b.message}</p>
                            <p className="text-[10px] text-slate-400 font-semibold">
                              Created by: <strong className="text-slate-600">{b.created_by_user}</strong> ({b.created_by_role === 'SUPER_ADMIN' ? 'Super Admin' : 'Sub-Admin'})
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center justify-end">
                            {isAuthor && (
                              <button
                                onClick={() => handleDeleteBroadcast(b.id)}
                                className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 border border-rose-200 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-2xs active:scale-95 flex items-center gap-1"
                                title="Permanently delete broadcast notice"
                              >
                                <span>🗑️</span>
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">DFY Central Alert Radar</span>
              <button
                onClick={() => setShowBroadcastStudio(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 px-5 rounded-xl transition-colors"
              >
                Close Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL 0A: DAILY NOTIFICATION VERIFICATION TRAY (RAPID NIKSHAY CROSS-CHECK) --- */}
      {/* ========================================================================= */}
      {showNotifTrayModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[92vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-600">📋</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-800">Daily Notification Verification Tray</h3>
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Rapid Nikshay Tool
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">
                    Daily reported TB notifications for <strong className="text-slate-700 font-mono">{month}</strong> • Reverse chronological rolling order (newest on top)
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setAppGuideActiveTopic('notif_tray');
                    setShowAppGuideModal(true);
                  }}
                  className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Open Step-by-Step SOP Guide for Nikshay Verification & 24-Col Excel"
                >
                  <span>📖</span>
                  <span>Verification SOP</span>
                </button>
                <button 
                  onClick={() => setShowNotifTrayModal(false)} 
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
                  title="Close Tray"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Transient Success Feedback Banner */}
            {notifTrayCopiedNotice && (
              <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold p-3 rounded-2xl flex items-center gap-2 animate-bounce">
                <span className="text-base">✓</span>
                <span>{notifTrayCopiedNotice}</span>
              </div>
            )}

            {/* Quick KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Total in Tray</div>
                <div className="text-xl font-black text-amber-900 mt-0.5 font-mono">{notifTrayData.allIds.length}</div>
                <div className="text-[10px] text-amber-700/80 font-medium mt-0.5">
                  Unique Patient IDs ({notifTrayData.allItems.length} entries)
                </div>
              </div>

              <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Latest Reported Day</div>
                <div className="text-xl font-black text-emerald-900 mt-0.5 font-mono">
                  {notifTrayData.latestDateFormatted || 'No records'}
                </div>
                <div className="text-[10px] text-emerald-700/80 font-medium mt-0.5">
                  {notifTrayData.lastDayIds.length} ID(s) on latest date
                </div>
              </div>

              <div className="bg-sky-50/80 border border-sky-200/90 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">Active Field Officers</div>
                <div className="text-xl font-black text-sky-900 mt-0.5 font-mono">{notifTrayData.uniqueFOCount}</div>
                <div className="text-[10px] text-sky-700/80 font-medium mt-0.5">Reporting notifications</div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">Selected District(s)</div>
                <div className="text-xl font-black text-slate-800 mt-0.5 truncate" title={notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All') ? 'All Districts' : notifTrayDistricts.join(', ')}>
                  {notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All') 
                    ? 'All Districts' 
                    : notifTrayDistricts.length === 1 
                      ? notifTrayDistricts[0] 
                      : `${notifTrayDistricts.length} Districts`}
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                  Filter scope active
                </div>
              </div>
            </div>

            {/* 4 Instant 1-Click Copy Action Buttons */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚡</span>
                <span>Instant 1-Click Clipboard Actions (No Download Waiting):</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Action 1: Copy Last Day IDs 1-per-line */}
                <button
                  type="button"
                  onClick={() => {
                    if (notifTrayData.lastDayIds.length === 0) {
                      alert('No IDs found on latest day to copy.');
                      return;
                    }
                    copyToClipboardWithFallback(
                      notifTrayData.lastDayIds.join('\n'),
                      `Copied ${notifTrayData.lastDayIds.length} Last Day ID(s) (1-per-line) to clipboard!`
                    );
                  }}
                  disabled={notifTrayData.lastDayIds.length === 0}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
                  title="Copy latest day's IDs separated by newlines for Nikshay search bar or single Excel column"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-1.5">
                      <span>📋</span>
                      <span>Copy Last Day IDs</span>
                    </span>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                      {notifTrayData.lastDayIds.length} IDs
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-100 font-medium">
                    1-per-line (`\n`) • Single Excel column ya Nikshay Portal search bar ke liye
                  </p>
                </button>

                {/* Action 2: Copy Last Day 24-Cols Excel Table */}
                <button
                  type="button"
                  onClick={() => {
                    if (notifTrayData.lastDayItems.length === 0) {
                      alert('No records found on latest day to copy.');
                      return;
                    }
                    const tsv = build24ColTsv(notifTrayData.lastDayItems);
                    copyToClipboardWithFallback(
                      tsv,
                      `Copied ${notifTrayData.lastDayItems.length} Last Day row(s) in 24-Column Excel format!`
                    );
                  }}
                  disabled={notifTrayData.lastDayItems.length === 0}
                  className="bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
                  title="Copy latest day's rows in standard 24-column TSV format. Paste directly in Excel with Ctrl+V"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-1.5">
                      <span>📑</span>
                      <span>Copy Last Day Table</span>
                    </span>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                      24 Columns
                    </span>
                  </div>
                  <p className="text-[10px] text-teal-100 font-medium">
                    Full 24-Cols Excel Format • Direct cell-by-cell `Ctrl + V` paste
                  </p>
                </button>

                {/* Action 3: Copy All Month IDs 1-per-line */}
                <button
                  type="button"
                  onClick={() => {
                    if (notifTrayData.allIds.length === 0) {
                      alert('No IDs in tray to copy.');
                      return;
                    }
                    copyToClipboardWithFallback(
                      notifTrayData.allIds.join('\n'),
                      `Copied ${notifTrayData.allIds.length} Month ID(s) (1-per-line) to clipboard!`
                    );
                  }}
                  disabled={notifTrayData.allIds.length === 0}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
                  title="Copy all unique IDs in the filtered tray separated by newlines"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-1.5">
                      <span>📋</span>
                      <span>Copy All Month IDs</span>
                    </span>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                      {notifTrayData.allIds.length} IDs
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-100 font-medium">
                    1-per-line (`\n`) • Mahine ke sabhi unique notification IDs
                  </p>
                </button>

                {/* Action 4: Copy All Month 24-Cols Excel Table */}
                <button
                  type="button"
                  onClick={() => {
                    if (notifTrayData.allItems.length === 0) {
                      alert('No records in tray to copy.');
                      return;
                    }
                    const tsv = build24ColTsv(notifTrayData.allItems);
                    copyToClipboardWithFallback(
                      tsv,
                      `Copied ${notifTrayData.allItems.length} Month row(s) in 24-Column Excel format!`
                    );
                  }}
                  disabled={notifTrayData.allItems.length === 0}
                  className="bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 text-white p-3 rounded-2xl shadow-xs transition-all active:scale-98 text-left cursor-pointer flex flex-col justify-between space-y-1.5 group disabled:opacity-50"
                  title="Copy all rows in the filtered tray in 24-column TSV format for Excel"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-1.5">
                      <span>📑</span>
                      <span>Copy All Month Table</span>
                    </span>
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                      {notifTrayData.allItems.length} Rows
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-200 font-medium">
                    Complete Monthly Master Table • All 24 columns formatted for Excel
                  </p>
                </button>
              </div>
            </div>

            {/* Multi-District Selection Deck for Notification Tray */}
            <div className="bg-slate-50 border border-slate-200/80 p-3.5 sm:p-4 rounded-2xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800">
                    🎯 Filter by District(s)
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    notifTrayDistricts.length > 0 && !notifTrayDistricts.includes('All') 
                      ? 'bg-amber-600 text-white' 
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All')
                      ? 'All Districts'
                      : `${notifTrayDistricts.length} of ${availableKpiDistricts.length} Selected`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleClearNotifDistricts}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-colors cursor-pointer ${
                      notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All')
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                  >
                    All Districts
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectAllNotifDistricts}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors cursor-pointer"
                  >
                    Select All
                  </button>
                  {notifTrayDistricts.length > 0 && !notifTrayDistricts.includes('All') && (
                    <button
                      type="button"
                      onClick={handleClearNotifDistricts}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-100 hover:bg-rose-200 text-rose-800 transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* District Chips */}
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-0.5">
                {availableKpiDistricts.map(dist => {
                  const isSelected = notifTrayDistricts.includes(dist);
                  return (
                    <button
                      key={dist}
                      type="button"
                      onClick={() => handleToggleNotifDistrict(dist)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border active:scale-95 cursor-pointer ${
                        isSelected
                          ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600 shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-2xs'
                      }`}
                    >
                      <span>{isSelected ? '✓' : '+'}</span>
                      <span>{dist}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Search Bar */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 p-2.5 rounded-2xl">
              <span className="text-slate-400 text-xs ml-1">🔍</span>
              <input
                type="text"
                value={notifTraySearch}
                onChange={(e) => setNotifTraySearch(e.target.value)}
                placeholder="Search by Episode ID or Officer Name in selected districts..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
              />
              {notifTraySearch && (
                <button
                  type="button"
                  onClick={() => setNotifTraySearch('')}
                  className="text-xs text-slate-400 hover:text-slate-600 px-2 font-bold"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Live Data Preview Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <div className="bg-slate-100/90 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Notification Records Preview ({notifTrayData.allItems.filter(i => {
                  if (!notifTraySearch.trim()) return true;
                  const q = notifTraySearch.trim().toLowerCase();
                  return i.id.toLowerCase().includes(q) || i.fo_name.toLowerCase().includes(q);
                }).length} shown)</span>
                <span className="text-[10px] text-slate-400 font-normal">Sorted Newest Date &rarr; Oldest Date</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 sticky top-0 z-10 text-[11px]">
                    <tr>
                      <th className="p-2.5 w-12 text-center">#</th>
                      <th className="p-2.5">Date (DD-MM-YYYY)</th>
                      <th className="p-2.5">Field Officer</th>
                      <th className="p-2.5">District</th>
                      <th className="p-2.5">Episode ID</th>
                      <th className="p-2.5">Audit Recency</th>
                      <th className="p-2.5 text-right">Quick Copy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {notifTrayData.allItems
                      .filter(item => {
                        if (!notifTraySearch.trim()) return true;
                        const q = notifTraySearch.trim().toLowerCase();
                        return item.id.toLowerCase().includes(q) || item.fo_name.toLowerCase().includes(q);
                      })
                      .slice(0, 300)
                      .map((item, idx) => (
                        <tr key={`${item.id}-${idx}`} className="hover:bg-amber-50/40 transition-colors">
                          <td className="p-2.5 text-center font-mono text-slate-400">{idx + 1}</td>
                          <td className="p-2.5 font-mono font-bold text-slate-700">{item.date_formatted}</td>
                          <td className="p-2.5 font-medium text-slate-800">{item.fo_name}</td>
                          <td className="p-2.5 text-slate-600">{item.district}</td>
                          <td className="p-2.5 font-mono font-black text-amber-700">#{item.id}</td>
                          <td className="p-2.5">
                            {item.days_elapsed === 0 ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                Today (Sync Pending)
                              </span>
                            ) : item.days_elapsed <= 3 ? (
                              <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-200">
                                {item.days_elapsed}d ago (&le;72h Grace)
                              </span>
                            ) : (
                              <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-200">
                                {item.days_elapsed}d ago (&gt;72h Check)
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => copyToClipboardWithFallback(item.id, `Copied ID #${item.id}!`)}
                              className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition-all cursor-pointer"
                              title="Copy this single ID"
                            >
                              Copy ID
                            </button>
                          </td>
                        </tr>
                      ))}

                    {notifTrayData.allItems.length === 0 && (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-slate-400 italic">
                          No notification IDs reported for {notifTrayDistricts.length === 0 || notifTrayDistricts.includes('All') ? 'selected month' : notifTrayDistricts.join(', ')}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Footer with SOP Note */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>
                💡 <strong>Reminder:</strong> Nikshay portal par ID na milne par pehle 72-hour grace lag check karein.
              </span>
              <button
                type="button"
                onClick={() => {
                  setAppGuideActiveTopic('notif_tray');
                  setShowAppGuideModal(true);
                }}
                className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
              >
                Read 24-Column Excel &amp; Verification Manual &rarr;
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL 0B: CENTRALIZED ADMIN & SUB-ADMIN SOP HELP MANUAL --- */}
      {/* ========================================================================= */}
      {showAppGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-5xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[92vh] flex flex-col">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-white border border-teal-200/90 rounded-2xl p-1 shrink-0 shadow-sm flex items-center justify-center overflow-hidden">
                  <img src="/dfy-logo.png" alt="Doctors For You" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">DFY TB MIS — Admin SOP &amp; Feature Guide</h3>
                  <p className="text-xs text-slate-500 font-medium">Standard Operating Procedures for Super Admins &amp; District Sub-Admins</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAppGuideModal(false)} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
                title="Close Guide"
              >
                &times;
              </button>
            </div>

            {/* Keyword Search Bar */}
            <div className="shrink-0 bg-slate-50 border border-slate-200 rounded-2xl p-3 flex items-center gap-2">
              <span className="text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={appGuideSearch}
                onChange={(e) => setAppGuideSearch(e.target.value)}
                placeholder="Search topics (e.g. Nikshay, 24 columns, 72 hours, PIN reset, targets, duplicate)..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {appGuideSearch && (
                <button
                  type="button"
                  onClick={() => setAppGuideSearch('')}
                  className="text-xs text-slate-400 hover:text-slate-600 font-bold px-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Two-Column Body: Navigation Tabs + Content Viewer */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-hidden min-h-[420px]">
              
              {/* Left Navigation Sidebar */}
              <div className="md:col-span-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 space-y-1.5 overflow-y-auto max-h-[500px]">
                {[
                  { key: 'visual_sops', label: 'Visual Bento SOP Workflows', icon: '🧩', desc: 'Attendance, Reconciler & Excel Workflows' },
                  { key: 'notif_tray', label: 'Daily Notification Tray', icon: '📋', desc: 'Nikshay cross-check & 24-col copy' },
                  { key: 'reconciler', label: 'Nikshay Reconciler & Ledger', icon: '⚖️', desc: 'State dumps & 72h truth engine' },
                  { key: 'daily_reports', label: 'FO Daily Reports & Edits', icon: '🔍', desc: 'Attendance, 24h edit window' },
                  { key: 'targets', label: 'Targets & Daily Progression', icon: '🎯', desc: 'Target allocation & trajectory' },
                  { key: 'staff', label: 'Staff Directory & Duty PINs', icon: '👥', desc: 'Officer onboarding & PIN reset' },
                  { key: 'duplicate_radar', label: 'Duplicate Radar & 1-Click Fix', icon: '🛡️', desc: 'Cross-date duplicates & 1-click repair' },
                  { key: 'excel_reports', label: 'Excel Reports & State KPI', icon: '📊', desc: '33-sheet KPI, Nikshay & dumps' },
                  { key: 'audit_trail', label: 'Admin vs Sub-Admin (RBAC)', icon: '📜', desc: 'District boundary protection & logs' },
                  { key: 'faqs', label: 'Field FAQs & Troubleshooting', icon: '❓', desc: 'Top operational questions' }
                ]
                  .filter(topic => {
                    if (!appGuideSearch.trim()) return true;
                    const q = appGuideSearch.trim().toLowerCase();
                    return topic.label.toLowerCase().includes(q) || topic.desc.toLowerCase().includes(q) || topic.key.toLowerCase().includes(q);
                  })
                  .map(topic => (
                    <button
                      key={topic.key}
                      type="button"
                      onClick={() => setAppGuideActiveTopic(topic.key)}
                      className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                        appGuideActiveTopic === topic.key
                          ? 'bg-indigo-600 text-white shadow-xs font-bold'
                          : 'hover:bg-slate-200/70 text-slate-700 font-medium'
                      }`}
                    >
                      <span className="text-base p-1 rounded-lg bg-white/10 shrink-0">{topic.icon}</span>
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold truncate">{topic.label}</div>
                        <div className={`text-[10px] truncate ${appGuideActiveTopic === topic.key ? 'text-indigo-100' : 'text-slate-500'}`}>
                          {topic.desc}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>

              {/* Right Content Panel */}
              <div className="md:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 overflow-y-auto max-h-[500px] space-y-4 text-slate-700 text-xs leading-relaxed">
                
                {/* TOPIC 0: Visual Bento SOP Workflows */}
                {appGuideActiveTopic === 'visual_sops' && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                      <span className="text-xl">🧩</span>
                      <div>
                        <h4 className="text-sm font-black text-slate-900">DFY TB MIS &mdash; Visual Bento SOP Workflows</h4>
                        <p className="text-[11px] text-slate-500 font-medium">Standard Operating Procedures for Attendance, Reconciler &amp; Excel Reports</p>
                      </div>
                    </div>

                    {/* FLOWCHART 1: Attendance Monitoring & Retroactive Remarks */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-indigo-50 text-indigo-700 rounded-xl">⚡</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Attendance Monitoring Workflow</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Morning &amp; Evening Attendance Monitoring, Bulletins &amp; Overrides</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                          Live Radar &amp; Remarks
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">📡</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Open Attendance Radar</strong>
                          <p className="text-[10px] text-slate-600">Assigned canonical districts ka live attendance view.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">⏰</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Stealth 10 AM Cutoff &amp; Timestamps</strong>
                          <p className="text-[10px] text-slate-600">&lt;10 AM reports count for yesterday with Next Day Morning badge.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">⚠️</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Review Defaulters</strong>
                          <p className="text-[10px] text-slate-600">Missing staff aur 3+ din ke chronic absent streak filter.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">📢</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">1-Click WhatsApp Reminder</strong>
                          <p className="text-[10px] text-slate-600">District-wise formatted bulletin WhatsApp par copy &amp; send.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">✏️</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Add Remark / Mark Leave</strong>
                          <p className="text-[10px] text-slate-600">Past ya current date par remark aur status override with live FO sync.</p>
                        </div>
                      </div>
                    </div>

                    {/* FLOWCHART 2: Nikshay Reconciler & Direct Patient Contact */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-emerald-50 text-emerald-700 rounded-xl">⚖️</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Nikshay Reconciler Workflow</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Nikshay Reconciler &amp; Direct Patient Contact Engine</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Monotonic Ledger
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">📤</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Upload Nikshay Excel</strong>
                          <p className="text-[10px] text-slate-600">State dump (.xlsx / .csv) portal upload by Super Admin.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">🔍</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Automatic Header Match</strong>
                          <p className="text-[10px] text-slate-600">24+ NTEP headers auto-mapped without schema errors.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">🔒</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Monotonic Ledger Sync</strong>
                          <p className="text-[10px] text-slate-600">Verified DBT &amp; tests permanently locked in Firestore.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">📋</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Actionable Pending Lists</strong>
                          <p className="text-[10px] text-slate-600">Unresolved patients pushed to FO Pending Hub.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">📞</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">1-Tap Call Patient from Drawer</strong>
                          <p className="text-[10px] text-slate-600">Direct dialer link &amp; clipboard phone copy inside drawer.</p>
                        </div>
                      </div>
                    </div>

                    {/* FLOWCHART 3: Dual-Sheet Staff Attendance Export Workflow */}
                    <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base p-1.5 bg-teal-50 text-teal-700 rounded-xl">📊</span>
                          <div>
                            <h5 className="text-xs font-black text-slate-900">Dual-Sheet Staff Attendance Export Workflow</h5>
                            <p className="text-[10px] text-slate-500 font-medium">Historical Attendance Corrections &amp; Monthly Export</p>
                          </div>
                        </div>
                        <span className="text-[9px] font-bold uppercase bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">
                          1s Sequential Queue
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                            <span className="text-sm">📅</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Select Past Date in Radar</strong>
                          <p className="text-[10px] text-slate-600">Past dates inspect karein, staff ka submitted data review karein.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                            <span className="text-sm">📝</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Attach Remark / Leave</strong>
                          <p className="text-[10px] text-slate-600">P, ML, CL, OD, A status override aur supervisor remarks save karein.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                            <span className="text-sm">🔄</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">FO Calendar Live Sync</strong>
                          <p className="text-[10px] text-slate-600">Field officer ke profile calendar me turant status update ho jata hai.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                            <span className="text-sm">🎯</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Report Studio: Multi-District Queue</strong>
                          <p className="text-[10px] text-slate-600">Target districts select karein, 1000ms cooldown queue ke saath.</p>
                        </div>

                        <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="w-4 h-4 rounded-full bg-teal-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                            <span className="text-sm">📑</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-900 block leading-tight">Dual-Sheet Attendance Workbook (.xlsx)</strong>
                          <p className="text-[10px] text-slate-600">Sheet 1: Monthly Matrix; Sheet 2: Granular Activity Log.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 1: Daily Notification Tray */}
                {appGuideActiveTopic === 'notif_tray' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📋</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Daily Notification Tray &amp; Nikshay Cross-Verification</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Zero-RAM client-side verification engine with 1-click clipboard formats</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        24-Col Excel &bull; 0ms Filter
                      </span>
                    </div>

                    {/* 4-Stage Bento Flowchart */}
                    <div className="bg-gradient-to-br from-amber-50/60 to-slate-50 border border-amber-200/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>4-Stage Notification Verification Sequence</span>
                        </h5>
                        <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                          SOP 1 ➔ 2 ➔ 3 ➔ 4
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* Stage 1 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">Stage 01</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Open Notification Tray</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Dashboard top header se Notification Tray kholein. Live notification ID count aur date range preview check karein.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">
                            <span>➔ District Filter</span>
                          </div>
                        </div>

                        {/* Stage 2 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">Stage 02</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Filter Canonical District</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Single ya multi-district chip deck se filter karein. Sub-Admins strictly assigned districts tak isolated rehte hain.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">
                            <span>➔ Quick Copy</span>
                          </div>
                        </div>

                        {/* Stage 3 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">Stage 03</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">1-Click 24-Col Excel Copy</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              24-Column Excel Copy dabayein. Sl No, FO Name, Date (DD-MM-YYYY), District, aur ID pre-filled copy honge.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">
                            <span>➔ Nikshay Portal</span>
                          </div>
                        </div>

                        {/* Stage 4 */}
                        <div className="bg-white border border-amber-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Stage 04</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Mark Done in Nikshay</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Nikshay Portal par IDs cross-verify karein. Verification complete hote hi status confirmed ho jata hai.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>✔ Completed</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dual Clipboard Format Comparison Bento */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>📋</span>
                            <span>Copy Last Day IDs (1-per-line)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">Single Column</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Jab aapko kal ya aaj report hui nayi notification IDs ko Nikshay portal search bar me ek-ek karke check karna ho, ya Excel ke kisi column me row-by-row paste karna ho:
                        </p>
                        <div className="bg-white border border-slate-200 rounded-xl p-2 text-[10px] text-slate-700 space-y-0.5">
                          <div>&bull; <strong>Action:</strong> IDs newline (`\n`) separated clipboard me save hoti hain.</div>
                          <div>&bull; <strong>Excel Paste:</strong> Kisi ek cell par `Ctrl+V` karein, har ID alag row me baithegi.</div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>📑</span>
                            <span>24-Column Excel Format (Master Sheet)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Standardized Sheet</span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Official Nikshay register format me Sl No, FO Name, Date (DD-MM-YYYY), District, aur Episode ID ke saath 19 blank clinical columns tab-delimited copy hote hain.
                        </p>
                        <div className="bg-slate-900 text-slate-200 p-2 rounded-xl font-mono text-[9px] truncate">
                          Sl No | FO Name | Date (DD-MM-YYYY) | District | TBU Name | ... | ID
                        </div>
                      </div>
                    </div>

                    {/* Bento Alert Card: 72h Grace Lag Rule */}
                    <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl space-y-1.5 text-rose-950">
                      <div className="font-black text-xs flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Zaroori Nirdesh: 72-Hour Government Portal Sync Lag Rule</span>
                      </div>
                      <p className="text-[11px] text-rose-900 leading-relaxed">
                        Agar koi ID portal par search karne par nahi mil rahi hai, toh <strong>turant Field Officer ko fraud declare na karein</strong>. Government Nikshay portal me health center se server par data aane me <strong>24 se 72 ghante (3 din)</strong> ka lag hota hai.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-bold">
                        <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-lg">
                          &le; 72h Grace: Pending Sync me rakhein
                        </span>
                        <span className="bg-rose-100 text-rose-900 border border-rose-300 px-2.5 py-0.5 rounded-lg">
                          &gt; 72h Check: Portal search bar me manual confirm karein
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 2: Nikshay Reconciler & Cumulative Ledger */}
                {appGuideActiveTopic === 'reconciler' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">⚖️</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Nikshay Reconciler &amp; Permanent Cumulative Ledger</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Cross-matching field reports with official government NTEP portal dumps</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                        Monotonic Truth Engine
                      </span>
                    </div>

                    {/* 4-Step Bento Data Pipeline */}
                    <div className="bg-gradient-to-br from-emerald-50/60 to-slate-50 border border-emerald-200/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                          <span>🔄</span>
                          <span>4-Step Reconciler Pipeline &amp; Verification Flow</span>
                        </h5>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Pipeline 1 ➔ 2 ➔ 3 ➔ 4
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {/* Step 1 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Step 01</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">State Monthly Dump Upload</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Super Admin official Nikshay state dump (.xlsx / .csv) upload karte hain. 24+ NTEP headers auto-mapped.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>➔ Cross-Check</span>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Step 02</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">5-Indicator Reconciliation</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Multi-Indicator Cross-Check: Notification, HIV Screening, Diabetes, DBT Bank Linkage, aur UDST test verify hote hain.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>➔ Lock Ledger</span>
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">Step 03</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Monotonic Ledger Sync</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Permanent Cumulative Ledger: Verified records permanently Firestore me lock ho jate hain aur future dumps me degrade nahi hote.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-emerald-700">
                            <span>➔ Action Pending</span>
                          </div>
                        </div>

                        {/* Step 4 */}
                        <div className="bg-white border border-emerald-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                          <div className="flex items-center justify-between">
                            <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                            <span className="text-[9px] font-bold text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded-md">Step 04</span>
                          </div>
                          <div>
                            <strong className="text-xs font-black text-slate-900 block">Actionable Pending &amp; 1-Tap Call</strong>
                            <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                              Unresolved patients FO Pending Hub me sync hote hain; Direct Patient Contact drawer se 1-Tap Call aur copy uplabdh hai.
                            </p>
                          </div>
                          <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-teal-700">
                            <span>✔ Field Ready</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* RBAC Boundary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">👑</span>
                          <strong className="text-xs font-black text-emerald-950">Super Admin Privileges</strong>
                        </div>
                        <p className="text-[11px] text-emerald-900 leading-relaxed">
                          Pure Bihar ke sabhi 22+ districts ka official Nikshay state dump upload karke statewide reconciliation run karne ka adhikar sirf Super Admin ke paas hai.
                        </p>
                      </div>

                      <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🛡️</span>
                          <strong className="text-xs font-black text-sky-950">District Sub-Admin Privileges</strong>
                        </div>
                        <p className="text-[11px] text-sky-900 leading-relaxed">
                          Sub-Admins dumps upload nahi kar sakte; wo apne-apne district ka <strong>11-Column Discrepancy Review Sheet (.xlsx)</strong> download karke field follow-up karwa sakte hain.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 3: FO Daily Reports & Edit Window */}
                {appGuideActiveTopic === 'daily_reports' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🔍</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">FO Daily Reports, Inspection &amp; Stealth 10 AM Cutoff</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Operational mechanics of daily submission ingestion, morning grace &amp; historical editing</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                        Stealth 10 AM Engine
                      </span>
                    </div>

                    {/* 3-Card Bento Flowchart Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Card 1: Stealth 10 AM Cutoff Engine */}
                      <div className="bg-gradient-to-br from-amber-50/70 to-slate-50 border border-amber-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-amber-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                          <span className="text-[9px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full">Attendance Grace</span>
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>⏰</span>
                            <span>Stealth 10:00 AM Reporting Cutoff Engine</span>
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Submissions completed before <strong>10:00 AM IST</strong> unconditionally map to <strong>Yesterday (D-1 / beete huye kal ki date)</strong> with prominent <code className="bg-amber-100 text-amber-900 px-1 rounded font-bold text-[10px]">⏰ Next day morning HH:MM AM</code> badge. Submissions &ge; 10:00 AM count for Today.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-amber-100 text-[10px] font-bold text-amber-800">
                          <span>✔ Eliminates Morning Attendance Skew</span>
                        </div>
                      </div>

                      {/* Card 2: 24-Hour Self-Correction Window */}
                      <div className="bg-gradient-to-br from-indigo-50/70 to-slate-50 border border-indigo-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                          <span className="text-[9px] font-bold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-full">FO Self-Correction</span>
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>⏱️</span>
                            <span>24-Hour Edit Window &amp; Missing IDs</span>
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Field Officers ko report submit karne ke baad <strong>24 ghante</strong> tak profile calendar se corrections, remarks update, ya <strong>+ Add Missing Patient ID</strong> selector se IDs add karne ki anumati hoti hai. 24h baad form automatically lock ho jata hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-indigo-100 text-[10px] font-bold text-indigo-800">
                          <span>✔ Strict Anti-Tampering Lock</span>
                        </div>
                      </div>

                      {/* Card 3: Inspect All IDs & Full Day Report Editor */}
                      <div className="bg-gradient-to-br from-teal-50/70 to-slate-50 border border-teal-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                          <span className="text-[9px] font-bold text-teal-900 bg-teal-100 px-2 py-0.5 rounded-full">Admin Audit Dossier</span>
                        </div>
                        <div>
                          <h5 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <span>✏️</span>
                            <span>Inspect All IDs &amp; Full Day Report Editor</span>
                          </h5>
                          <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                            Master Table me kisi bhi officer par click karke chronological dossier kholein. Admin <strong>Edit Day</strong> se KM, doctor visits, remarks aur patient IDs modify kar sakte hain with atomic district rollup recalculation.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-teal-100 text-[10px] font-bold text-teal-800">
                          <span>✔ Atomic Recalculation Guard</span>
                        </div>
                      </div>
                    </div>

                    {/* Anti-Corruption Shield */}
                    <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-slate-700">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base p-1.5 bg-slate-200 rounded-xl">🛡️</span>
                        <div>
                          <strong className="text-xs font-bold text-slate-900 block">Blank Report Prevention:</strong>
                          <span className="text-[11px] text-slate-600">Koi bhi officer 0 IDs ke saath blank form submit nahi kar sakta, jab tak ki valid meeting/camp Remark ya Doctor Visit darj na ho.</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-800 px-2.5 py-1 rounded-xl shrink-0">Zero Ghost Entries</span>
                    </div>
                  </div>
                )}

                {/* TOPIC 4: Targets & Performance Analytics */}
                {appGuideActiveTopic === 'targets' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🎯</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Monthly Targets &amp; Progression Trends</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Target allocation, run-rate velocity, Sunday buffers and month-end forecasting</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full border border-purple-200">
                        Dynamic Pacing Studio
                      </span>
                    </div>

                    {/* 4-Card Bento Flowchart Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Step 1 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded-md">Stage 01</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Monthly Target Allocation</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Mahine ki shuruat me har district aur individual officer ko TB notification target assign kiya jata hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-purple-700">
                          <span>➔ Daily Velocity</span>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded-md">Stage 02</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Daily Pace Calculation</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Run-Rate Velocity: Remaining target ko remaining working days se divide karke daily required pace auto-calculate hota hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-purple-700">
                          <span>➔ Calendar Buffer</span>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-purple-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1.5 py-0.5 rounded-md">Stage 03</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Sunday &amp; Holiday Buffer</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Calendar engine automatically sabhi Sundays aur declared government holidays ko filter karke realistic pace deta hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-purple-700">
                          <span>➔ Studio Forecast</span>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="bg-white border border-purple-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                          <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded-md">Stage 04</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Forecast Model &amp; Studio</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Performance Studio ka Horizontal Bar Chart 22 districts ko top performers se lagging districts tak rank karta hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-indigo-700">
                          <span>✔ Trajectory Ready</span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Tips Bento */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                      <strong className="text-xs font-black text-slate-900 block">Progression Trend Analytics (Day 1 se 30/31):</strong>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Line chart pure mahine me daily progression dikhata hai ki kis din peak reporting aayi. Bar Chart view me direct number labels target bar par visible rehte hain, jabki Grid view me individual officers ka drill-down milta hai.
                      </p>
                    </div>
                  </div>
                )}

                {/* TOPIC 5: Staff Directory & Duty PINs */}
                {appGuideActiveTopic === 'staff' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">👥</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Staff Directory &amp; Duty PIN Management</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Officer credentials, designation management, and consonant-collapsed inactive defense</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                        Zero-Ghost Roster
                      </span>
                    </div>

                    {/* 4-Card Bento Sequence Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {/* Step 1 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">1</span>
                          <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md">Step 01</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Onboard Officer &amp; Role</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Staff Directory me naya officer add karein aur Designation assign karein (FO, DC, STS, TBHV, LT).
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-blue-700">
                          <span>➔ Assign Duty PIN</span>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">2</span>
                          <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md">Step 02</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">4-Digit Duty PIN</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Officer ke mobile login aur attendance authentication ke liye secure 4-Digit Duty PIN generate hota hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-blue-700">
                          <span>➔ Reset Support</span>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">3</span>
                          <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded-md">Step 03</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Reset PIN in 1-Click</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            PIN bhoolne par Staff Directory me &lsquo;Reset PIN&rsquo; par click karke naya 4-digit code set karein, bina delay.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-blue-700">
                          <span>➔ Lifecycle Guard</span>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="bg-white border border-blue-200/90 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center">4</span>
                          <span className="text-[9px] font-bold text-rose-800 bg-rose-100 px-1.5 py-0.5 rounded-md">Step 04</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Deactivation &amp; Inactive Guard</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Consonant-Collapsed normalization defense ensures inactive staff past history rehti hai lekin defaulters me 0 ghosting hoti hai.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-rose-700">
                          <span>✔ Protected</span>
                        </div>
                      </div>
                    </div>

                    {/* Security Callout Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5 text-slate-700 text-[11px]">
                      <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                        <span>🔒</span>
                        <span>Inactive Staff PIN Lockout &amp; Historical Safety</span>
                      </div>
                      <p className="leading-relaxed">
                        Deactivated officers ka account `/verify-pin` par strictly locked rehta hai aur wo naya report submit nahi kar sakte. Unke purane sabhi reports, monthly rollups aur audit history 100% surakshit rehte hain.
                      </p>
                    </div>
                  </div>
                )}

                {/* TOPIC 6: Duplicate Radar & 1-Click Auto-Repair */}
                {appGuideActiveTopic === 'duplicate_radar' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🛡️</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Duplicate Patient Radar &amp; 1-Click Auto-Repair Suite</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Multi-tier collision detection, cross-district guards, and atomic rollup recalculation</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-200">
                        Atomic Prune Engine
                      </span>
                    </div>

                    {/* 3-Tier Detection Bento Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                              <span>⚠️</span>
                              <span>Same-Day Check</span>
                            </span>
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">Tier 1</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-800 block">Within District Collision</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Agar ek hi district me do alag officers ne ek hi din same patient ID submit ki hai, toh yahan alert dikhta hai for immediate field audit.
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 pt-1 border-t border-slate-200">Local District Scope</span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                              <span>🌐</span>
                              <span>Cross-District</span>
                            </span>
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded">Tier 2</span>
                          </div>
                          <strong className="text-[11px] font-bold text-slate-800 block">Between Districts Collision</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Agar ek patient ID Bihar ke do alag districts (e.g. Patna aur Gaya) me submit hui hai, toh State Coordinator OPD slip se verify karke retain karte hain.
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 pt-1 border-t border-slate-200">Statewide Scope</span>
                      </div>

                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex flex-col justify-between space-y-2">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                              <span>🚨</span>
                              <span>Inflation Radar</span>
                            </span>
                            <span className="text-[9px] font-bold text-rose-900 bg-rose-200 px-1.5 py-0.5 rounded">Tier 3</span>
                          </div>
                          <strong className="text-[11px] font-bold text-rose-900 block">Cross-Date Inflation</strong>
                          <p className="text-[10px] text-rose-800 mt-1 leading-normal">
                            Field Officer dwara purani dates ke patients dobara notification box me repeat karne par count inflate ho jata hai. Iska 1-Click Fix uplabdh hai.
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-rose-700 pt-1 border-t border-rose-200">1-Click Auto-Repair</span>
                      </div>
                    </div>

                    {/* 5-Step 1-Click Auto-Repair Bento Flowchart */}
                    <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-black text-rose-950 flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>1-Click Auto-Repair Execution Pipeline</span>
                        </h5>
                        <span className="text-[10px] font-bold text-rose-900 bg-rose-200/80 px-2 py-0.5 rounded-full">
                          Atomic Decrement
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">1</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Earliest Valid Date</strong>
                          <p className="text-[9px] text-slate-600">First submission date record bilkul safe rehta hai.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">2</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Duplicate Stripped</strong>
                          <p className="text-[9px] text-slate-600">Baad wali date se repeat notification ID hat jati hai.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">3</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Atomic Rollup Recalculation</strong>
                          <p className="text-[9px] text-slate-600">Increment(-N) se district rollup count turant theek ho jata hai.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">4</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">Other Work Safe</strong>
                          <p className="text-[9px] text-slate-600">Visits, FDC dawai, DBT, aur KM bilkul safe rehte hain.</p>
                        </div>

                        <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1">
                          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white font-mono text-[9px] font-bold flex items-center justify-center">5</span>
                          <strong className="text-[10px] font-bold text-slate-900 block">RBAC Boundary</strong>
                          <p className="text-[9px] text-slate-600">Sub-Admin sirf apne district me run kar sakta hai (403 guard).</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 7: Excel Reports & Statewide Exports */}
                {appGuideActiveTopic === 'excel_reports' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📊</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">State Excel Reports &amp; 33-Sheet KPI Export</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Enterprise multi-sheet workbooks, Nikshay 24-col exports, and concurrency memory guards</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full border border-teal-200">
                        Zero-RAM Spike
                      </span>
                    </div>

                    {/* 4-Card Bento Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-indigo-50 text-indigo-700 rounded-lg">📈</span>
                          <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 px-1.5 py-0.5 rounded-md">33 Sheets</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">State KPI Workbook</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Sheet 1 statewide ranking aur 32 district sheets with custom styling, borders aur cohort breakdown.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-indigo-700">Executive Report</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-teal-50 text-teal-700 rounded-lg">📑</span>
                          <span className="text-[9px] font-bold text-teal-800 bg-teal-100 px-1.5 py-0.5 rounded-md">Dual-Sheet</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Dual-Sheet Staff Attendance</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Sheet 1 monthly attendance matrix with P/L/A colors; Sheet 2 granular activity log with next-day morning notes.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-teal-700">Attendance Studio</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-amber-50 text-amber-700 rounded-lg">📋</span>
                          <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-md">24 Columns</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Nikshay 24-Column Sheet</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Notification Tray se direct download, official Nikshay portal columns me structured for rapid verification.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-amber-700">Govt Format</div>
                      </div>

                      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="text-base p-1 bg-slate-100 text-slate-700 rounded-lg">🗄️</span>
                          <span className="text-[9px] font-bold text-slate-800 bg-slate-200 px-1.5 py-0.5 rounded-md">Raw Dump</span>
                        </div>
                        <div>
                          <strong className="text-xs font-black text-slate-900 block">Raw Field Activity Dump</strong>
                          <p className="text-[10px] text-slate-600 mt-1 leading-normal">
                            Har Field Officer ke per-day logs, GPS travel kilometers, clinic remarks, aur doctor visits ka granular data.
                          </p>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 text-[10px] font-bold text-slate-700">Complete Audit</div>
                      </div>
                    </div>

                    {/* Server RAM Guard Bento */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-emerald-950">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base p-1.5 bg-emerald-100 rounded-xl">🛡️</span>
                        <div>
                          <strong className="text-xs font-bold block">Concurrency Semaphore &amp; Server RAM Guard:</strong>
                          <span className="text-[11px] text-emerald-900 leading-normal">
                            Heavy Excel exports backend me <code className="bg-white/80 px-1 rounded font-mono font-bold text-[10px]">asyncio.Semaphore(1)</code>, 1000ms Sequential Queue cooldown, aur explicit garbage collection se chalte hain, taaki 512MB Render server par 0% RAM spike ho.
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-white text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-xl shrink-0">RAM Guard Active</span>
                    </div>
                  </div>
                )}

                {/* TOPIC 8: Roles & Audit Trail */}
                {appGuideActiveTopic === 'audit_trail' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">📜</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Multi-Admin Roles, District Boundaries &amp; Audit Logs</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Role-based access control (RBAC), canonical district isolation, and tamper-evident logging</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full border border-indigo-200">
                        RBAC Isolation
                      </span>
                    </div>

                    {/* Dual-Column Bento Comparison Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-purple-950 flex items-center gap-1.5">
                            <span>👑</span>
                            <span>Super Admin (Statewide Scope)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-purple-900 bg-purple-200 px-2 py-0.5 rounded-full">Full Scope</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-purple-950 text-[11px] pl-1 leading-relaxed">
                          <li>Pure Bihar ke sabhi 22+ districts ka complete access.</li>
                          <li>Official Nikshay State Excel Dumps upload karna.</li>
                          <li>Sub-Admin accounts create aur manage karna.</li>
                          <li>Statewide monthly targets aur declared holidays configure karna.</li>
                        </ul>
                      </div>

                      <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <strong className="text-xs font-black text-sky-950 flex items-center gap-1.5">
                            <span>🛡️</span>
                            <span>District Sub-Admin (Isolated Scope)</span>
                          </strong>
                          <span className="text-[9px] font-bold text-sky-900 bg-sky-200 px-2 py-0.5 rounded-full">Guarded Scope</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-sky-950 text-[11px] pl-1 leading-relaxed">
                          <li>Sirf unke assigned canonical districts ka data dikhta hai.</li>
                          <li>Apne district ke FOs ki reports review aur PIN reset.</li>
                          <li>Apne district ka Duplicate Radar 1-Click Auto-Repair.</li>
                          <li>Doosre districts ka data access ya modify karna strictly <strong>403 Forbidden</strong>.</li>
                        </ul>
                      </div>
                    </div>

                    {/* 3-Stage Security Architecture Bento Sequence */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2.5">
                      <strong className="text-xs font-black text-slate-900 block">Security Architecture &amp; Tamper-Evident Audit Trail:</strong>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <strong className="text-slate-900 font-bold block">1. Cross-District Isolation</strong>
                          <p className="text-slate-600">Backend har write endpoint par canonical district boundaries validate karta hai.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <strong className="text-slate-900 font-bold block">2. Disk Snapshot Shield</strong>
                          <p className="text-slate-600">Sub-Admin single-district queries kabhi statewide disk backup caches ko overwrite nahi karti.</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <strong className="text-slate-900 font-bold block">3. Tamper-Evident Audit Ledger</strong>
                          <p className="text-slate-600">Har target change, report edit, PIN reset ya duplicate repair actor username, IP, aur IST timestamp ke saath permanently darj hota hai.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TOPIC 9: FAQs & Solutions */}
                {appGuideActiveTopic === 'faqs' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">❓</span>
                        <div>
                          <h4 className="text-sm font-black text-slate-900">Frequently Asked Questions (Admin FAQs)</h4>
                          <p className="text-[11px] text-slate-500 font-medium">Quick answers to frequent administrative, operational, and technical questions</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        Quick Troubleshooting
                      </span>
                    </div>

                    {/* 6-Card Responsive Bento FAQ Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q1: Duplicate 1-Click Fix chalane ke baad agar FO bole ki patient ki visit genuine thi?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Chinta ki baat nahi hai! 1-Click Fix sirf duplicate &ldquo;TB Notification count&rdquo; ko theek karta hai. Us din ki Home Visit, FDC dawai, aur Travel KM report me waise hi safe rehte hain.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q2: Notification ID Nikshay portal par nahi mil rahi hai, kya karein?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Pehle check karein ki reporting kitne din pehle hui hai. Agar 3 din (&le;72h) se kam huye hain, toh Government server sync hone ka wait karein. Agar 3 din se purana hai, tabhi Nikshay search bar me manually cross-check karein.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q3: FO ka Duty PIN reset kaise karein?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          <strong>Staff Directory</strong> tab me jayein, us officer ke naam ke aage bane `Reset PIN` button par click karein aur naya 4-digit PIN enter karke save karein. FO naye PIN se turant login kar sakta hai.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q4: Subah 8:30 AM par submit hui report kal ke attendance me kyu dikh rahi hai?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Stealth 10:00 AM Cutoff ke tehat, subah 10:00 AM se pehle submit huye reports kal (yesterday) ke duty me count hote hain aur unpar &lsquo;⏰ Next day morning&rsquo; badge lagta hai. Isse attendance accurate rehti hai.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q5: Render server par extra load toh nahi padega?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Nahi, yeh Guide, Bento Flowcharts aur Notification Tray 100% Client-Side React me operate karte hain. Iska Render ke 512MB RAM aur CPU par 0.00% load padta hai.
                        </p>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <strong className="text-slate-900 font-black block text-xs">Q6: Hatae gaye staff defaulters list me kyu nahi aate?</strong>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          Consonant-collapsed normalization aur direct staffList status lookup se inactive staff deactivation date ke baad expected attendance roster se automatically exclude ho jate hain.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>DFY Bihar MIS Operations Standard &bull; Version 2.8.3</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAppGuideModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-1.5 rounded-xl transition-all cursor-pointer"
              >
                Close Guide
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* --- MODAL 1: NIKSHAY OFFICIAL CSV/EXCEL RECONCILER & CUMULATIVE LEDGER --- */}
      {showNikshayModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2 bg-emerald-50 rounded-2xl border border-emerald-200">⚖️</span>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Nikshay Reconciler & Cumulative Ledger</h3>
                  <p className="text-xs text-slate-500 font-medium">Cross-match Nikshay dumps and permanently protect verified clinical indicators</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowNikshayModal(false);
                  setNikshayResult(null);
                  setNikshayFile(null);
                  setNikshayError('');
                }} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* View Mode Switcher + Live Nikshay Sync Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setLedgerViewMode('reconcile')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    ledgerViewMode === 'reconcile'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>⚡</span>
                  <span>Monthly Reconciler</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerViewMode('ledger');
                    if (!ledgerData) fetchCumulativeLedger(1, ledgerSearch, ledgerDistrict);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    ledgerViewMode === 'ledger'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>🔒</span>
                  <span>Permanent Cumulative Ledger</span>
                  {ledgerData?.total_in_collection !== undefined && (
                    <span className="ml-1 bg-emerald-800 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                      {ledgerData.total_in_collection}
                    </span>
                  )}
                </button>
              </div>

              {/* 🕒 Last Data Sync Status - Prominently Displayed Right Here */}
              {nikshaySyncStatus && nikshaySyncStatus.has_sync ? (
                <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/90 px-3.5 py-1.5 rounded-2xl shadow-2xs self-start sm:self-auto">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-semibold">Last Data Synced:</span>
                    <span className="font-mono font-black text-emerald-800 bg-white border border-emerald-300 px-2 py-0.5 rounded-md shadow-2xs">
                      {nikshaySyncStatus.synced_at_ist}
                    </span>
                    {nikshaySyncStatus.synced_by && (
                      <span className="text-slate-400 text-[10px] font-medium hidden md:inline">
                        • by {nikshaySyncStatus.synced_by}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-[11px] text-slate-500 font-medium self-start sm:self-auto">
                  <span className="text-xs">🕒</span>
                  <span>Last Data Synced: <strong className="text-slate-600">Pending / No Dump Yet</strong></span>
                </div>
              )}
            </div>

            {nikshayError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">
                ⚠️ {nikshayError}
              </div>
            )}

            {/* MODE A: MONTHLY FILE RECONCILER */}
            {ledgerViewMode === 'reconcile' && (
              <div className="space-y-5">
                {/* 🕒 Persistent Nikshay Sync Status Banner - Visible to All Roles */}
                {nikshaySyncStatus && nikshaySyncStatus.has_sync && (
                  <div className="bg-slate-900 text-white border border-slate-800 rounded-3xl p-5 shadow-md space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                      <div className="flex items-start sm:items-center gap-3">
                        <span className="text-2xl p-2 bg-slate-800 rounded-2xl border border-slate-700">🕒</span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">Nikshay Registry Last Synchronized:</span>
                            <span className="text-xs font-black text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded-lg">
                              {nikshaySyncStatus.synced_at_ist || 'Active'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-medium mt-1">
                            Updated by <strong className="text-slate-200">{nikshaySyncStatus.synced_by}</strong> • Target Month: <strong className="text-slate-200 font-mono">{nikshaySyncStatus.month || 'Current'}</strong> {nikshaySyncStatus.filename && (<span className="text-slate-500">• File: <span className="font-mono text-slate-400">{nikshaySyncStatus.filename}</span></span>)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full self-start sm:self-auto flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Statewide Verification Active</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Verified on Nikshay</div>
                        <div className="text-lg font-black text-emerald-400 mt-0.5 font-mono">{nikshaySyncStatus.total_matched || 0}</div>
                        <div className="text-[10px] text-emerald-400/80 font-medium mt-0.5">Permanent Ledger Locked</div>
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sync Grace (&le;72h)</div>
                        <div className="text-lg font-black text-amber-400 mt-0.5 font-mono">{nikshaySyncStatus.total_grace_under_72h || 0}</div>
                        <div className="text-[10px] text-amber-400/80 font-medium mt-0.5">Portal Sync In Progress</div>
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Missing &gt;72h Alert</div>
                        <div className="text-lg font-black text-rose-400 mt-0.5 font-mono">{nikshaySyncStatus.total_flagged_over_72h || 0}</div>
                        <div className="text-[10px] text-rose-400/80 font-medium mt-0.5">Manual Check Required</div>
                      </div>
                      <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3">
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Match Accuracy</div>
                        <div className="text-lg font-black text-cyan-400 mt-0.5 font-mono">{nikshaySyncStatus.match_rate_pct || 0}%</div>
                        <div className="text-[10px] text-cyan-400/80 font-medium mt-0.5">Field Alignment Ratio</div>
                      </div>
                    </div>
                  </div>
                )}

                {isSubAdmin ? (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">📋</span>
                        <h4 className="text-base font-black text-emerald-950">District Discrepancy & Verification Review Sheet</h4>
                      </div>
                      <p className="text-xs font-semibold text-emerald-800 mt-1 max-w-xl leading-relaxed">
                        Download your district's actionable Nikshay Discrepancy review workbook (.xlsx). It separates confirmed ID matches needing indicator action from unverified/aging IDs (&gt;3 days) to resolve with Field Officers.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetDist = selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts?.[0] || 'Jamui');
                        window.open(`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/nikshay/download-review-sheet?district=${encodeURIComponent(targetDist)}&token=${getAdminToken()}`, "_blank");
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black px-5 py-3 rounded-2xl shadow-md shadow-emerald-700/20 active:scale-95 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      <span>📥</span>
                      <span>Download {selectedDistrict !== 'All' ? selectedDistrict : (currentUser?.allowed_districts?.[0] || '')} Review Sheet (.xlsx)</span>
                    </button>
                  </div>
                ) : (
                /* Upload & Filter Form (Super Admin) */
                <form onSubmit={handleReconcileNikshay} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Target Month</label>
                      <input 
                        type="month" 
                        value={nikshayMonth} 
                        onChange={(e) => setNikshayMonth(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">District Filter</label>
                      <select 
                        value={nikshayDistrict} 
                        onChange={(e) => setNikshayDistrict(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-500 block mb-1">Nikshay File (.xlsx / .csv)</label>
                      <input 
                        type="file" 
                        accept=".xlsx,.xls,.csv" 
                        onChange={(e) => setNikshayFile(e.target.files[0] || null)}
                        className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={nikshayLoading || !nikshayFile}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                    >
                      {nikshayLoading ? 'Processing Nikshay Data...' : '⚡ Run Reconciliation Match'}
                    </button>
                  </div>
                </form>
                )}

                {/* Reconciliation Results Display */}
                {nikshayResult && (
                  <div className="space-y-5">
                    {/* Detected Source Metadata Banner */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-emerald-50/80 border border-emerald-200 px-4 py-2.5 rounded-2xl text-xs font-bold text-emerald-800">
                      <div className="flex items-center gap-2">
                        <span className="text-base">📑</span>
                        <span>Source: Sheet <strong>"{nikshayResult.summary?.detected_sheet || 'mastersheet'}"</strong> | ID Column: <strong className="font-mono text-emerald-950">"{nikshayResult.summary?.detected_id_column}"</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-600 text-white text-[10px] px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                          {nikshayResult.summary?.is_mastersheet_format ? 'Consolidated Master Dataset' : 'Standard Sheet'}
                        </span>
                        <button
                          type="button"
                          onClick={handleDownloadReviewSheet}
                          disabled={reviewExporting}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                          title="Download Excel review sheet of flagged discrepancies for staff 1-on-1 meeting"
                        >
                          <span>📥</span>
                          <span>{reviewExporting ? 'Exporting...' : 'Review Sheet (.xlsx)'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNikshayResult(null);
                            setNikshayFile(null);
                            setNikshayError('');
                          }}
                          className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-bold px-3 py-1 rounded-lg transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1"
                          title="Clear results and upload another file"
                        >
                          <span>🔄</span>
                          <span>Upload New File</span>
                        </button>
                      </div>
                    </div>

                    {/* Permanent Cumulative Ledger Notice Banner */}
                    {nikshayResult.summary?.cumulative_ledger && (
                      <div className="bg-emerald-100/80 border border-emerald-300 px-4 py-2.5 rounded-2xl text-xs font-bold text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🔒</span>
                          <span>
                            <strong>Cumulative Ledger Synced:</strong> {nikshayResult.summary.cumulative_ledger.newly_locked_or_upgraded || 0} indicators permanently locked into database. (Matched indicators are NEVER erased!)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLedgerViewMode('ledger');
                            fetchCumulativeLedger(1, '', nikshayDistrict);
                          }}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap"
                        >
                          View Permanent Ledger &rarr;
                        </button>
                      </div>
                    )}

                    {/* Top KPI Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                      <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Nikshay Total</span>
                        <span className="text-xl font-black text-slate-800">{nikshayResult.summary?.total_nikshay_uploaded || 0}</span>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500 block">DFY Reported</span>
                        <span className="text-xl font-black text-indigo-700">{nikshayResult.summary?.total_dfy_reported || 0}</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Match Rate</span>
                        <span className="text-xl font-black text-emerald-700">{nikshayResult.summary?.match_rate_pct || 0}%</span>
                        <span className="text-[10px] text-emerald-600 font-bold block">({nikshayResult.summary?.matched_count || 0} matched)</span>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 block">⚠️ Flagged Review</span>
                        <span className="text-xl font-black text-rose-700">{nikshayResult.summary?.flagged_review_count || 0}</span>
                        <span className="text-[10px] text-rose-600 font-bold block">&gt; 3 days lag</span>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">⏳ 72h Grace</span>
                        <span className="text-xl font-black text-blue-700">{nikshayResult.summary?.grace_window_count || 0}</span>
                        <span className="text-[10px] text-blue-600 font-bold block">≤ 3 days sync lag</span>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">Ready for Portal</span>
                        <span className="text-xl font-black text-amber-700">{nikshayResult.summary?.ready_for_portal_count || 0}</span>
                        <span className="text-[10px] text-amber-600 font-bold block">DFY completed</span>
                      </div>
                    </div>

                    {/* 4-Indicator Cascade Comparison Grid */}
                    {nikshayResult.summary?.cascade && (
                      <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">⚡ 4-Indicator Cascade Cross-Concordance</span>
                          <span className="text-[10px] text-slate-400 font-semibold">Government Nikshay vs DFY Field Reality</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {/* HIV & DM */}
                          <div className="bg-white border border-purple-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-purple-900 flex items-center gap-1"><span>🩺</span> HIV & DM</span>
                              <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.hiv_dm?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.hiv_dm?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-purple-700">{nikshayResult.summary.cascade.hiv_dm?.dfy_done || 0}</strong></span>
                            </div>
                          </div>

                          {/* DBT Bank */}
                          <div className="bg-white border border-amber-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-900 flex items-center gap-1"><span>💳</span> DBT Bank</span>
                              <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.dbt?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.dbt?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-amber-700">{nikshayResult.summary.cascade.dbt?.dfy_done || 0}</strong></span>
                            </div>
                          </div>

                          {/* UDST Testing */}
                          <div className="bg-white border border-emerald-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-emerald-900 flex items-center gap-1"><span>🔬</span> UDST Lab</span>
                              <span className="text-[10px] font-black bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.udst?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.udst?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-emerald-700">{nikshayResult.summary.cascade.udst?.dfy_done || 0}</strong></span>
                            </div>
                          </div>

                          {/* Contact Tracing */}
                          <div className="bg-white border border-blue-200 p-3 rounded-xl space-y-1 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-blue-900 flex items-center gap-1"><span>👥</span> Contact Tracing</span>
                              <span className="text-[10px] font-black bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {nikshayResult.summary.cascade.contact_tracing?.ready_for_portal || 0} Ready
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex justify-between pt-1 border-t border-slate-100">
                              <span>Nikshay: <strong className="text-slate-800">{nikshayResult.summary.cascade.contact_tracing?.nikshay_done || 0}</strong></span>
                              <span>DFY: <strong className="text-blue-700">{nikshayResult.summary.cascade.contact_tracing?.dfy_done || 0}</strong></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sub-tabs Navigation */}
                    <div className="border-b border-slate-200 flex flex-wrap gap-1">
                      <button
                        onClick={() => setNikshayActiveTab('flagged_review')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'flagged_review' ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        ⚠️ Flagged Discrepancies ({nikshayResult.summary?.flagged_review_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('grace_window')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'grace_window' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        ⏳ 72h Grace Window ({nikshayResult.summary?.grace_window_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('ready_for_portal')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'ready_for_portal' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        ⭐ Ready for Nikshay Portal ({nikshayResult.summary?.ready_for_portal_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('missing_in_dfy')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'missing_in_dfy' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Missing in DFY MIS ({nikshayResult.summary?.missing_in_dfy_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('only_in_dfy')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'only_in_dfy' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Only in DFY / Typos ({nikshayResult.summary?.only_in_dfy_count || 0})
                      </button>
                      <button
                        onClick={() => setNikshayActiveTab('urgent_field_action')}
                        className={`pb-2 text-xs font-bold border-b-2 transition-all px-2.5 cursor-pointer ${nikshayActiveTab === 'urgent_field_action' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        🚨 High Risk Dropout ({nikshayResult.summary?.urgent_field_action_count || 0})
                      </button>
                    </div>

                    {/* Tab: Flagged Discrepancies (>3 Days) */}
                    {nikshayActiveTab === 'flagged_review' && (
                      <div className="space-y-2.5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900">
                          <div>
                            <p className="font-bold text-amber-950 flex items-center gap-1.5">
                              <span>⚠️</span>
                              <span>Staff Review List (Reported &gt; 3 Days Ago)</span>
                            </p>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              In cases me reporting kiye hue 3 din se zyada ho chuke hain par Nikshay portal par indicator blank hai ya ID match nahi hui. District Coordinator in cases par staff se 1-on-1 review karein. (Staff target par koi penalty nahi hai).
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleDownloadReviewSheet}
                            disabled={reviewExporting}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all whitespace-nowrap active:scale-95 cursor-pointer flex items-center gap-1 self-end sm:self-center"
                          >
                            <span>📥</span>
                            <span>{reviewExporting ? 'Exporting...' : 'Export Excel'}</span>
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Category</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Field Officer</th>
                                <th className="p-2">Date &amp; Aging</th>
                                <th className="p-2">Services Claimed</th>
                                <th className="p-2">Nikshay Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_flagged_discrepancies || []).map((item, i) => (
                                <tr key={i} className="hover:bg-amber-50/50">
                                  <td className="p-2 font-mono font-bold text-amber-900">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setJourneySearchId(item.id);
                                        setShowJourneyModal(true);
                                        handleFetchJourney(item.id);
                                      }}
                                      className="hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>🔍</span>
                                      <span>#{item.id}</span>
                                    </button>
                                  </td>
                                  <td className="p-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                      item.category_type === 'matched_indicator_pending'
                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                        : 'bg-rose-100 text-rose-800 border border-rose-200'
                                    }`}>
                                      {item.category || 'Discrepancy'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-slate-700 font-semibold">{item.district || '-'}</td>
                                  <td className="p-2 text-slate-800 font-bold">{item.fo_name || '-'}</td>
                                  <td className="p-2 font-mono text-[11px]">
                                    <div className="text-slate-600">{item.date || '-'}</div>
                                    <div className="text-rose-600 font-bold text-[10px]">({item.days_elapsed} days pending)</div>
                                  </td>
                                  <td className="p-2">
                                    <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                                      {item.services_claimed || '-'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-[11px] text-amber-700 font-bold">
                                    {item.nikshay_status || 'Pending'}
                                  </td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_flagged_discrepancies || []).length === 0 && (
                                <tr>
                                  <td colSpan="7" className="p-6 text-center text-emerald-600 font-bold">
                                    ✓ Shabaash! No discrepancies &gt; 3 days old detected.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab: 72h Grace Window (<= 3 Days) */}
                    {nikshayActiveTab === 'grace_window' && (
                      <div className="space-y-2.5">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-900">
                          <p className="font-bold text-blue-950 flex items-center gap-1.5">
                            <span>⏳</span>
                            <span>72-Hour Server Sync Grace Window (Reported ≤ 3 Days Ago)</span>
                          </p>
                          <p className="text-[11px] text-blue-800 mt-0.5">
                            Yeh sabhi reports pichle 72 ghanto ke andar submit hui hain. Sarkari Nikshay server entry aur sync me 2-3 din ka samay lagta hai, isliye inhe koi discrepancy nahi mana gaya hai.
                          </p>
                        </div>

                        <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Category</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Field Officer</th>
                                <th className="p-2">Date Reported</th>
                                <th className="p-2">Services Claimed</th>
                                <th className="p-2">Sync Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_grace_window || []).map((item, i) => (
                                <tr key={i} className="hover:bg-blue-50/40">
                                  <td className="p-2 font-mono font-bold text-blue-900">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setJourneySearchId(item.id);
                                        setShowJourneyModal(true);
                                        handleFetchJourney(item.id);
                                      }}
                                      className="hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>🔍</span>
                                      <span>#{item.id}</span>
                                    </button>
                                  </td>
                                  <td className="p-2">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                                      {item.category || 'Grace Period'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-slate-700 font-semibold">{item.district || '-'}</td>
                                  <td className="p-2 text-slate-800 font-bold">{item.fo_name || '-'}</td>
                                  <td className="p-2 font-mono text-[11px]">
                                    <div className="text-slate-600">{item.date || '-'}</div>
                                    <div className="text-blue-600 font-semibold text-[10px]">({item.days_elapsed}d ago)</div>
                                  </td>
                                  <td className="p-2">
                                    <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded">
                                      {item.services_claimed || '-'}
                                    </span>
                                  </td>
                                  <td className="p-2">
                                    <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                      ⏳ Awaiting Portal Sync
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_grace_window || []).length === 0 && (
                                <tr>
                                  <td colSpan="7" className="p-6 text-center text-slate-400 italic">
                                    No recent submissions awaiting sync.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 1: Ready for Nikshay Portal Update */}
                    {nikshayActiveTab === 'ready_for_portal' && (
                      <div className="space-y-2">
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-medium">
                          🎯 <strong>Action for DTO / District Coordinator:</strong> In sabhi patients ke service documents DFY Field Officers ne already collect kar liye hain. Inhe Nikshay portal par turant Update/Validated mark karein!
                        </p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Patient Name</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Services Completed by DFY</th>
                                <th className="p-2">Officer</th>
                                <th className="p-2">Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_ready_for_portal || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-2 font-mono font-bold text-amber-900">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setJourneySearchId(item.id);
                                        setShowJourneyModal(true);
                                        handleFetchJourney(item.id);
                                      }}
                                      className="hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                      <span>🔍</span>
                                      <span>#{item.id}</span>
                                    </button>
                                  </td>
                                  <td className="p-2 text-slate-800 font-bold">{item.name}</td>
                                  <td className="p-2 text-slate-600">{item.district}</td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {(item.services_ready || []).map((s, idx) => (
                                        <span key={idx} className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                          {s}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="p-2 text-slate-600">{item.fo_name || '-'}</td>
                                  <td className="p-2 text-slate-400 font-mono text-[11px]">{item.date || '-'}</td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_ready_for_portal || []).length === 0 && (
                                <tr>
                                  <td colSpan="6" className="p-6 text-center text-slate-400 italic">
                                    No pending portal updates detected for this dataset.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: Missing in DFY MIS */}
                    {nikshayActiveTab === 'missing_in_dfy' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-medium">These patient IDs exist in Nikshay portal but were never reported in DFY MIS by field staff this month:</p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Patient Name</th>
                                <th className="p-2">Phone</th>
                                <th className="p-2">District</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(nikshayResult.preview_missing_in_dfy_details || nikshayResult.preview_missing_in_dfy || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 font-mono">
                                  <td className="p-2 font-bold text-rose-700">#{typeof item === 'object' && item !== null ? item.id : String(item)}</td>
                                  <td className="p-2 font-sans text-slate-800 font-semibold">{typeof item === 'object' && item !== null ? (item.name || 'Patient') : 'Patient'}</td>
                                  <td className="p-2 text-slate-600">{typeof item === 'object' && item !== null ? (item.phone || '-') : '-'}</td>
                                  <td className="p-2 font-sans text-slate-600">{typeof item === 'object' && item !== null ? (item.district || '-') : '-'}</td>
                                </tr>
                              ))}
                              {(!nikshayResult.preview_missing_in_dfy_details && !nikshayResult.preview_missing_in_dfy || (nikshayResult.preview_missing_in_dfy_details || nikshayResult.preview_missing_in_dfy || []).length === 0) && (
                                <tr>
                                  <td colSpan="4" className="p-6 text-center text-emerald-600 font-bold">
                                    ✓ 100% matched! All Nikshay patients are reported in DFY MIS.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Only in DFY MIS */}
                    {nikshayActiveTab === 'only_in_dfy' && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-medium">These patient IDs were entered by field officers in DFY MIS but are not in this Nikshay export (check for typos):</p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Patient ID</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Field Officer</th>
                                <th className="p-2">Date</th>
                                <th className="p-2">Services Logged</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(nikshayResult.preview_only_in_dfy || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50 font-mono">
                                  <td className="p-2 font-bold text-indigo-700">#{item.id}</td>
                                  <td className="p-2 font-sans text-slate-700">{item.district}</td>
                                  <td className="p-2 font-sans text-slate-700">{item.fo_name}</td>
                                  <td className="p-2 text-slate-500">{item.date}</td>
                                  <td className="p-2 font-sans text-[11px] text-slate-600">{(item.services || []).join(', ')}</td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_only_in_dfy || []).length === 0 && (
                                <tr>
                                  <td colSpan="5" className="p-6 text-center text-slate-400 italic">
                                    No unrecognized DFY IDs detected.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: Urgent Action (Pending in both) */}
                    {nikshayActiveTab === 'urgent_field_action' && (
                      <div className="space-y-2">
                        <p className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-xl font-medium">
                          ⚠️ <strong>High Risk Dropout:</strong> In patients ke 2 ya zyada clinical cascade services Nikshay aur DFY dono me pending hain. Field Officers ko immediate home visit ke liye assign karein.
                        </p>
                        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-600 font-bold">
                              <tr>
                                <th className="p-2">Episode ID</th>
                                <th className="p-2">Patient Name</th>
                                <th className="p-2">District</th>
                                <th className="p-2">Pending Cascade Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                              {(nikshayResult.preview_urgent_field_action || []).map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50">
                                  <td className="p-2 font-mono font-bold text-red-900">#{item.id}</td>
                                  <td className="p-2 text-slate-800 font-bold">{item.name}</td>
                                  <td className="p-2 text-slate-600">{item.district || '-'}</td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-1">
                                      {(item.pending_actions || []).map((a, idx) => (
                                        <span key={idx} className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                          {a} Missing
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {(nikshayResult.preview_urgent_field_action || []).length === 0 && (
                                <tr>
                                  <td colSpan="4" className="p-6 text-center text-emerald-600 font-bold">
                                    ✓ Zero high-risk dropout patients!
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MODE B: PERMANENT CUMULATIVE LEDGER EXPLORER */}
            {ledgerViewMode === 'ledger' && (
              <div className="space-y-4">
                {/* Ledger Header & Search Controls */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            fetchCumulativeLedger(1, ledgerSearch, ledgerDistrict);
                          }
                        }}
                        placeholder="Search Episode ID, Name, Phone..."
                        className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => fetchCumulativeLedger(1, ledgerSearch, ledgerDistrict)}
                        disabled={ledgerLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap"
                      >
                        {ledgerLoading ? 'Searching...' : '🔍 Search'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={ledgerDistrict}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLedgerDistrict(val);
                          fetchCumulativeLedger(1, ledgerSearch, val);
                        }}
                        className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={handleExportCumulativeLedger}
                        disabled={ledgerExporting}
                        className="bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                        title="Download entire verified ledger as Excel"
                      >
                        <span>📥</span>
                        <span>{ledgerExporting ? 'Exporting...' : 'Export Excel'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Ledger KPI Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  <div className="bg-emerald-50/80 border border-emerald-200 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 block">Total Locked</span>
                    <span className="text-xl font-black text-emerald-800">{ledgerData?.total_in_collection || 0}</span>
                    <span className="text-[10px] text-emerald-600 font-bold block">Permanent Records</span>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 block">HIV & DM</span>
                    <span className="text-xl font-black text-purple-700">{ledgerData?.metrics?.hiv_dm_verified || 0}</span>
                    <span className="text-[10px] text-purple-500 font-bold block">Screened & Locked</span>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">DBT Bank</span>
                    <span className="text-xl font-black text-amber-700">{ledgerData?.metrics?.bank_validated || 0}</span>
                    <span className="text-[10px] text-amber-500 font-bold block">Validated & Locked</span>
                  </div>
                  <div className="bg-teal-50 border border-teal-100 p-3 rounded-2xl text-center">
                    <span className="text-[10px] font-black uppercase tracking-wider text-teal-600 block">UDST Tested</span>
                    <span className="text-xl font-black text-teal-700">{ledgerData?.metrics?.udst_done || 0}</span>
                    <span className="text-[10px] text-teal-500 font-bold block">Lab Confirmed</span>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl text-center col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">Contact Tracing</span>
                    <span className="text-xl font-black text-blue-700">{ledgerData?.metrics?.contact_tracing_done || 0}</span>
                    <span className="text-[10px] text-blue-500 font-bold block">Household Covered</span>
                  </div>
                </div>

                {/* Ledger Patients Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5">Episode ID</th>
                          <th className="p-2.5">Patient Name / Phone</th>
                          <th className="p-2.5">District</th>
                          <th className="p-2.5">Permanently Verified Indicators</th>
                          <th className="p-2.5">Outcome</th>
                          <th className="p-2.5">Last Synced</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {(ledgerData?.patients || []).map((pt, i) => (
                          <tr key={i} className="hover:bg-emerald-50/40 transition-colors">
                            <td className="p-2.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setJourneySearchId(pt.patient_id);
                                  setShowJourneyModal(true);
                                  handleFetchJourney(pt.patient_id);
                                }}
                                className="font-mono font-black text-emerald-800 hover:text-emerald-950 underline decoration-dotted flex items-center gap-1 cursor-pointer"
                                title="View complete longitudinal journey"
                              >
                                <span>🔍</span>
                                <span>#{pt.patient_id}</span>
                              </button>
                            </td>
                            <td className="p-2.5">
                              <span className="font-bold text-slate-800 block">{pt.patient_name || 'Patient'}</span>
                              <span className="text-[11px] text-slate-400 font-mono">{pt.phone || '-'}</span>
                            </td>
                            <td className="p-2.5 text-slate-600 font-medium">{pt.district || '-'}</td>
                            <td className="p-2.5">
                              <div className="flex flex-wrap gap-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.hiv_dm_tested || pt.hiv_tested || pt.dm_tested
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  🩺 HIV/DM: {pt.hiv_dm_tested || pt.hiv_tested || pt.dm_tested ? '✓' : '—'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.bank_validated
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  💳 DBT: {pt.bank_validated ? '✓' : '—'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.udst_done
                                    ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  🔬 UDST: {pt.udst_done ? '✓' : '—'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  pt.contact_tracing_done
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'bg-slate-100 text-slate-400'
                                }`}>
                                  👥 CT: {pt.contact_tracing_done ? '✓' : '—'}
                                </span>
                              </div>
                            </td>
                            <td className="p-2.5 text-slate-600 text-[11px]">{pt.treatment_outcome || '-'}</td>
                            <td className="p-2.5 text-slate-400 font-mono text-[11px]">
                              {pt.last_reconciled_at?.slice(0, 10) || pt.first_verified_at?.slice(0, 10) || '-'}
                            </td>
                          </tr>
                        ))}
                        {(!ledgerData?.patients || ledgerData.patients.length === 0) && (
                          <tr>
                            <td colSpan="6" className="p-8 text-center text-slate-400 italic">
                              {ledgerLoading ? 'Loading cumulative ledger records...' : 'No permanently verified patients recorded yet for this filter.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Toolbar */}
                  {ledgerData && ledgerData.total_pages > 1 && (
                    <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">
                        Showing page <strong>{ledgerData.page}</strong> of <strong>{ledgerData.total_pages}</strong> ({ledgerData.total_records} matching patients)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={ledgerData.page <= 1 || ledgerLoading}
                          onClick={() => fetchCumulativeLedger(ledgerData.page - 1, ledgerSearch, ledgerDistrict)}
                          className="bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 text-slate-700 px-3 py-1 rounded-lg font-bold cursor-pointer transition-all"
                        >
                          &larr; Prev
                        </button>
                        <button
                          type="button"
                          disabled={ledgerData.page >= ledgerData.total_pages || ledgerLoading}
                          onClick={() => fetchCumulativeLedger(ledgerData.page + 1, ledgerSearch, ledgerDistrict)}
                          className="bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-300 text-slate-700 px-3 py-1 rounded-lg font-bold cursor-pointer transition-all"
                        >
                          Next &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 2: PATIENT LONGITUDINAL JOURNEY TIMELINE DRAWER --- */}
      {/* ========================================================================= */}
      {showJourneyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2 bg-sky-50 rounded-2xl border border-sky-200">🔍</span>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Patient Journey Timeline</h3>
                  <p className="text-xs text-slate-500 font-medium">Trace complete end-to-end clinical history of any patient ID</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowJourneyModal(false);
                  setJourneyResult(null);
                  setJourneySearchId('');
                  setJourneyError('');
                }} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Search Bar */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleFetchJourney();
              }} 
              className="flex gap-2"
            >
              <input 
                type="text" 
                required 
                value={journeySearchId} 
                onChange={(e) => setJourneySearchId(e.target.value.trim())} 
                placeholder="Enter 9-digit Nikshay ID (e.g. 102938475)..." 
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-500" 
              />
              <button 
                type="submit" 
                disabled={journeyLoading || !journeySearchId} 
                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                {journeyLoading ? 'Searching...' : 'Search'}
              </button>
            </form>

            {journeyError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold p-3 rounded-xl">
                ⚠️ {journeyError}
              </div>
            )}

            {/* Journey Timeline Content */}
            {journeyResult && (
              <div className="space-y-4">
                <div className="bg-sky-50/70 border border-sky-100 p-3 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-mono font-black text-sm text-sky-900">Patient #{journeyResult.patient_id}</span>
                      <p className="text-[11px] text-slate-500">
                        {journeyResult.metadata?.district} | Officer: {journeyResult.metadata?.primary_fo || 'Field Officer'}
                      </p>
                    </div>
                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${journeyResult.is_complete ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'}`}>
                      {journeyResult.is_complete ? '✓ Treatment Completed' : '⚡ Active In Care'}
                    </span>
                  </div>

                  {(journeyResult.metadata?.patient_name || journeyResult.metadata?.phone) && (
                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-sky-200/50">
                      {journeyResult.metadata?.patient_name && (
                        <span className="text-xs font-black text-slate-800 flex items-center gap-1 bg-white/80 px-2.5 py-1 rounded-lg border border-sky-200/60">
                          <span>👤</span> {journeyResult.metadata.patient_name}
                        </span>
                      )}
                      {journeyResult.metadata?.phone && (
                        <div className="flex items-center gap-1.5">
                          <a 
                            href={`tel:${journeyResult.metadata.phone}`}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                          >
                            <span>📞 Call</span>
                            <span className="font-mono">{journeyResult.metadata.phone}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(journeyResult.metadata.phone);
                                showToast("Phone number copied!", "info");
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer transition-colors"
                            title="Copy Phone"
                          >
                            📋
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative pl-6 border-l-2 border-indigo-200 space-y-4 my-2">
                  {(journeyResult.journey || []).map((step, idx) => (
                    <div key={idx} className="relative">
                      {/* Step Dot */}
                      <span className={`absolute -left-[31px] top-0.5 w-6 h-6 rounded-full bg-white border-2 ${step.category === 'nikshay_verified' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-indigo-500 text-indigo-700'} flex items-center justify-center text-xs shadow-sm`}>
                        {step.icon}
                      </span>
                      <div className={step.category === 'nikshay_verified' ? 'bg-emerald-50/70 border border-emerald-200 p-2.5 rounded-xl shadow-2xs' : ''}>
                        <div className="flex items-center justify-between">
                          <h4 className={`text-xs font-black ${step.category === 'nikshay_verified' ? 'text-emerald-950' : 'text-slate-800'}`}>{step.action}</h4>
                          <span className="font-mono text-[10px] text-slate-400">{step.date}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Logged by: <span className={`font-bold ${step.category === 'nikshay_verified' ? 'text-emerald-800' : 'text-slate-700'}`}>{step.fo_name}</span> ({step.district})
                        </p>
                      </div>
                    </div>
                  ))}

                  {(journeyResult.journey || []).length === 0 && (
                    <p className="text-xs text-slate-500 py-4 italic">No clinical milestones found for this patient ID yet.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 💾 Automated Daily Cloud Backups & Disaster Recovery Modal (Super Admin Only) */}
      {showBackupModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-fade-in">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/80 to-blue-50/80">
              <div className="flex items-center gap-3">
                <span className="text-2xl p-2.5 bg-white rounded-2xl shadow-xs border border-indigo-100">💾</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-800 flex items-center gap-2">
                    <span>Cloud Database Backups</span>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-200">Option A: Smart Daily</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Automated snapshots saved to private Google Cloud Storage (Mumbai, India) with 30-day retention
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowBackupModal(false); setBackupActionMsg(''); setRestoreTargetFile(null); }}
                className="w-9 h-9 rounded-full bg-white hover:bg-slate-100 text-slate-500 font-bold flex items-center justify-center shadow-xs border border-slate-200 cursor-pointer transition-all"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              {/* Today's Backup Status Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Today's Automated Backup</span>
                  <div className="flex items-center gap-2 pt-1">
                    {backupStatus?.today_backup_exists ? (
                      <>
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-sm font-black text-emerald-700">✓ Up-to-Date &amp; Active</span>
                      </>
                    ) : (
                      <>
                        <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                        <span className="text-sm font-black text-amber-700">Pending Daily Run</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono pt-1">
                    {backupStatus?.today_backup_filename || "Will auto-generate on first sync"}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cloud Storage Bucket</span>
                  <div className="text-sm font-black text-indigo-900 pt-1 flex items-center gap-1.5">
                    <span>🇮🇳</span>
                    <span>Mumbai, India</span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono truncate pt-1" title={backupStatus?.bucket_name}>
                    gs://{backupStatus?.bucket_name || "dfy-mis-backups-2026"}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Retention &amp; Cost</span>
                  <div className="text-sm font-black text-slate-800 pt-1">
                    30 Days Retention
                  </div>
                  <p className="text-[11px] text-emerald-600 font-bold pt-1">
                    100% Free Tier (~32 KB/day)
                  </p>
                </div>
              </div>

              {/* Action Banner / Message */}
              {backupActionMsg && (
                <div className="bg-indigo-50/80 border border-indigo-200 text-indigo-900 text-xs font-bold p-3 rounded-xl flex items-center justify-between">
                  <span>{backupActionMsg}</span>
                  <button onClick={() => setBackupActionMsg('')} className="text-indigo-500 hover:text-indigo-800">&times;</button>
                </div>
              )}

              {/* Action Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/40 border border-indigo-100 p-4 rounded-2xl">
                <div>
                  <h4 className="text-xs font-black text-slate-800">On-Demand Database Snapshot</h4>
                  <p className="text-[11px] text-slate-500">Take an immediate full backup of all reports, patients, and staff before major changes.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchBackupStatus}
                    disabled={backupLoading}
                    className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span className={backupLoading ? "animate-spin" : ""}>🔄</span>
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={handleTriggerBackupNow}
                    disabled={backupTriggerLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>{backupTriggerLoading ? "⏳" : "⚡"}</span>
                    <span>{backupTriggerLoading ? "Generating Snapshot..." : "Backup Now"}</span>
                  </button>
                </div>
              </div>

              {/* Snapshots Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <span>📦</span>
                    <span>Available Snapshots in Cloud Storage ({backupStatus?.backups?.length || 0})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 font-medium">Auto-pruned after 30 days</span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200">
                        <tr>
                          <th className="p-3">Snapshot File</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Size</th>
                          <th className="p-3">Documents</th>
                          <th className="p-3">Source</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {backupLoading && (!backupStatus || !backupStatus.backups) ? (
                          <tr>
                            <td colSpan="6" className="p-6 text-center text-slate-400">
                              <span className="animate-spin inline-block mr-2">⏳</span> Loading backups list from Google Cloud Storage...
                            </td>
                          </tr>
                        ) : (backupStatus?.backups || []).length === 0 ? (
                          <tr>
                            <td colSpan="6" className="p-6 text-center text-slate-400 italic">
                              No cloud backups found yet. Click "Backup Now" above to generate the first snapshot!
                            </td>
                          </tr>
                        ) : (
                          (backupStatus.backups || []).map((b, idx) => (
                            <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                              <td className="p-3 font-mono font-bold text-slate-800 flex items-center gap-2">
                                <span className="text-base">🗜️</span>
                                <span>{b.filename}</span>
                              </td>
                              <td className="p-3 text-slate-600 font-mono text-[11px]">{b.date || b.created_at?.slice(0, 10) || "—"}</td>
                              <td className="p-3 font-mono font-bold text-indigo-700">{b.size_kb} KB</td>
                              <td className="p-3 text-slate-600 font-bold">{b.total_documents ? b.total_documents.toLocaleString() : "—"}</td>
                              <td className="p-3">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${b.source === 'automated_daily' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                  {b.source === 'automated_daily' ? 'Automated Daily' : 'Manual Admin'}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleDownloadBackup(b.filename)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-2xs active:scale-95"
                                    title="Download compressed backup file (.json.gz) to your PC"
                                  >
                                    <span>📥</span>
                                    <span>Download</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRestoreTargetFile(b.filename);
                                      setRestoreConfirmText('');
                                    }}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                                    title="Emergency Disaster Restore"
                                  >
                                    <span>♻️</span>
                                    <span>Restore</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Emergency Restore Drawer / Modal Section */}
              {restoreTargetFile && (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                      <span>⚠️</span>
                      <span>Disaster Recovery Restore: {restoreTargetFile}</span>
                    </h4>
                    <button onClick={() => setRestoreTargetFile(null)} className="text-rose-400 hover:text-rose-700 font-bold">&times;</button>
                  </div>
                  <p className="text-[11px] text-rose-800 font-medium">
                    Restoring from this snapshot will safely merge all backed up reports, targets, and staff records back into the live Firestore database.
                    To confirm authorization, type <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-rose-300 text-rose-900">RESTORE-CONFIRM</span> below:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={restoreConfirmText}
                      onChange={(e) => setRestoreConfirmText(e.target.value)}
                      placeholder="Type RESTORE-CONFIRM here..."
                      className="flex-1 bg-white border border-rose-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-rose-900 outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <button
                      onClick={handleExecuteRestore}
                      disabled={restoreLoading || restoreConfirmText.trim() !== 'RESTORE-CONFIRM'}
                      className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                    >
                      {restoreLoading ? "Restoring..." : "Execute Restore"}
                    </button>
                  </div>
                </div>
              )}

              {/* Safety Guarantee Footer Note */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-start gap-2.5">
                <span className="text-lg">🛡️</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">Enterprise Disaster Protection:</strong> Daily backups are stored in a separate, isolated Google Cloud Storage container with strict access controls. No field report or patient record can be permanently lost.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🏆 Bihar Statewide Top Performers Poster Studio Modal */}
      {showTopPerformersModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-slate-950 text-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-indigo-900/60 animate-fade-in my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/80">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🏆</span>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                    Bihar Top Performers Studio
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                      Statewide Broadcast
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Gamified leaderboards across all 38 districts &amp; frontline field officers for WhatsApp sharing
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowTopPerformersModal(false)}
                className="text-slate-400 hover:text-white text-2xl font-bold p-1 leading-none transition-colors cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Controls bar: Timeframe Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Timeframe:</span>
                  <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setTopPerformersPeriod('weekly');
                        fetchTopPerformers('weekly');
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        topPerformersPeriod === 'weekly'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Weekly (7 Days)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopPerformersPeriod('fortnightly');
                        fetchTopPerformers('fortnightly');
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        topPerformersPeriod === 'fortnightly'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      15 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTopPerformersPeriod('monthly');
                        fetchTopPerformers('monthly');
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                        topPerformersPeriod === 'monthly'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Monthly ({month})
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>📅 Range: <strong className="text-white font-mono">{topPerformersData?.start_date || `${month}-01`}</strong> to <strong className="text-white font-mono">{topPerformersData?.end_date || 'Today'}</strong></span>
                </div>
              </div>

              {/* High-Resolution Live Poster Card Preview */}
              <div className="relative rounded-3xl p-6 border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-indigo-950 to-teal-950 text-white shadow-2xl overflow-hidden">
                {/* Glow spheres */}
                <div className="absolute top-0 right-10 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-10 w-72 h-72 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

                {/* Poster Header */}
                <div className="text-center relative z-10 space-y-1 mb-6">
                  <div className="text-xs uppercase tracking-widest font-black text-teal-400">
                    DOCTORS FOR YOU • BIHAR TB ELIMINATION MISSION
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    🏆 STATEWIDE TOP PERFORMERS
                  </h3>
                  <div className="inline-block mt-2 px-4 py-1 rounded-full bg-white/10 border border-yellow-400/30 text-yellow-300 font-bold text-xs">
                    {topPerformersPeriod === 'weekly' 
                      ? 'WEEKLY SPRINT (LAST 7 DAYS)' 
                      : topPerformersPeriod === 'fortnightly' 
                      ? '15-DAY PERFORMANCE DRIVE' 
                      : `MONTHLY LEADERBOARD (${month})`}
                  </div>
                </div>

                {/* Poster Columns: Districts & Staff */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
                  {/* Left Column: Top 5 Districts */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🏛️</span>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">Top 5 Districts</h4>
                          <p className="text-[10px] text-slate-400">Statewide Target Achievement</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Target %</span>
                    </div>

                    <div className="space-y-2">
                      {loadingTopPerformers ? (
                        <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                      ) : (topPerformersData?.top_districts || []).length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                      ) : (
                        (topPerformersData?.top_districts || []).slice(0, 5).map((d, i) => (
                          <div 
                            key={i} 
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              i === 0 
                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-100' 
                                : i === 1 
                                ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                                : i === 2 
                                ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                                : 'bg-white/5 border-white/5 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 text-center text-base font-black">
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                              </span>
                              <div>
                                <span className="font-bold text-sm text-white block">{d.district}</span>
                                <span className="text-[10px] text-sky-300 font-mono font-semibold">{d.notifications} notifications</span>
                              </div>
                            </div>
                            <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${d.percentage >= 100 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                              {d.percentage}%
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Top 5 Field Officers */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">👤</span>
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-purple-400">Top 5 Field Officers</h4>
                          <p className="text-[10px] text-slate-400">Frontline Notifications Champion</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">Volume</span>
                    </div>

                    <div className="space-y-2">
                      {loadingTopPerformers ? (
                        <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                      ) : (topPerformersData?.top_staff || []).length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                      ) : (
                        (topPerformersData?.top_staff || []).slice(0, 5).map((s, i) => (
                          <div 
                            key={i} 
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              i === 0 
                                ? 'bg-purple-500/20 border-purple-500/40 text-purple-100' 
                                : i === 1 
                                ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                                : i === 2 
                                ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                                : 'bg-white/5 border-white/5 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-6 text-center text-base font-black shrink-0">
                                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                              </span>
                              <div className="truncate">
                                <span className="font-bold text-sm text-white block truncate">{s.fo_name}</span>
                                <span className="text-[10px] text-purple-300 font-medium">📍 {s.district}</span>
                              </div>
                            </div>
                            <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono shrink-0">
                              {s.notifications} notifs
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Poster Preview Footer */}
                <div className="mt-4 pt-3 border-t border-white/10 text-center text-[10px] text-slate-400 relative z-10">
                  State TB Mission Bihar • Doctors For You MIS
                </div>
              </div>

              {/* Hidden 1200x1350 Canvas for HD PNG Export */}
              <canvas ref={topPerformersCanvasRef} className="hidden" />
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 sm:p-5 border-t border-white/10 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                HD 1200x1350 PNG card generated on-the-fly via client HTML5 canvas. Zero server memory load.
              </span>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setShowTopPerformersModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleShareTopPerformersWhatsApp}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>📲</span>
                  <span>Share on WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTopPerformersPoster}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>⬇️</span>
                  <span>Download Poster (PNG)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`px-4 py-3 rounded-2xl shadow-xl border text-xs font-bold flex items-center gap-2 ${toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : toast.type === 'info' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
            <span>{toast.type === 'error' ? '⚠️' : toast.type === 'info' ? 'ℹ️' : '✓'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

    </div>
  );
}

