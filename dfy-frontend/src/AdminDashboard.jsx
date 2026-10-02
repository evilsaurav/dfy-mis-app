import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getCachedDashboardData, setCachedDashboardData, clearCachedDashboardData, clearAllAdminCache } from './adminCache';
import { getOperationalMonth, getPreviousMonth } from './utils/operationalMonth';

// Export & Re-export domain constants & helpers
export {
  feedCategoriesConfig, formatAuditTimestamp, TOP_PERFORMER_MESSAGES,
  CANONICAL_DISTRICT_MAP, DEFAULT_BIHAR_DISTRICTS, canonicalizeDistrict,
  canonicalizeFo, normalizeStaffKey, isOfficerNameMatch, parseTargetVal
} from './utils/districtHelpers';

import {
  feedCategoriesConfig, formatAuditTimestamp, TOP_PERFORMER_MESSAGES,
  CANONICAL_DISTRICT_MAP, DEFAULT_BIHAR_DISTRICTS, canonicalizeDistrict,
  canonicalizeFo, normalizeStaffKey, isOfficerNameMatch, parseTargetVal
} from './utils/districtHelpers';

// Custom Hooks
import { useAdminAnalytics } from './hooks/useAdminAnalytics';
import { useReportDownloads } from './hooks/useReportDownloads';
import { useAdminAttendance } from './hooks/useAdminAttendance';
import { useAdminModals } from './hooks/useAdminModals';

// Extracted Header, Tabs & Modals
import AdminHeader from './components/Admin/AdminHeader';
import OverviewTab from './components/Admin/tabs/OverviewTab';
import StaffPacingTab from './components/Admin/tabs/StaffPacingTab';
import DistrictBenchmarksTab from './components/Admin/tabs/DistrictBenchmarksTab';
import AdminLogin from './components/Admin/AdminLogin';
import AdminModals from './components/Admin/AdminModals';

export default function AdminDashboard() {
  // 1. Base Authentication & Core Data States
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      return localStorage.getItem('dfy_admin_auth') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const u = localStorage.getItem('dfy_admin_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  });
  const [loginUsername, setLoginUsername] = useState('');
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => getOperationalMonth().operationalMonth);
  const [rawRecords, setRawRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isColdStarting, setIsColdStarting] = useState(false);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // 2. Navigation & Filter States
  const [activeMainTab, setActiveMainTab] = useState('overview'); // 'overview' | 'staff_pacing' | 'district_benchmarks'
  const [selectedDistrict, setSelectedDistrict] = useState('All');
  const [selectedFO, setSelectedFO] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'notifications', direction: 'desc' });
  const [masterTableCohortFilter, setMasterTableCohortFilter] = useState('all'); // 'all' | 'current_cohort' | 'backlog'
  const [isTickerPaused, setIsTickerPaused] = useState(false);

  // 3. Bihar Top Performers Studio States
  const [topPerformersPeriod, setTopPerformersPeriod] = useState('weekly'); // 'weekly' | 'fortnightly' | 'monthly'
  const [topPerformersTab, setTopPerformersTab] = useState('districts'); // 'districts' | 'fo' | 'tc' | 'lt' | 'sct'
  const [topPerformersData, setTopPerformersData] = useState(null);
  const [loadingTopPerformers, setLoadingTopPerformers] = useState(false);
  const [topPerformerRandomMsg, setTopPerformerRandomMsg] = useState(() => 
    TOP_PERFORMER_MESSAGES[Math.floor(Math.random() * TOP_PERFORMER_MESSAGES.length)]
  );

  // 4. Target Setting States
  const [targetsData, setTargetsData] = useState([]);
  const [officialDistrictTarget, setOfficialDistrictTarget] = useState(0);
  const [officialTargetsByDistrict, setOfficialTargetsByDistrict] = useState({});
  const [tempOfficialTargets, setTempOfficialTargets] = useState({});
  const [adminTargetViewMode, setAdminTargetViewMode] = useState('official'); // 'official' | 'frontline'

  // 5. Metric & Inspection States
  const [activeMetric, setActiveMetric] = useState('notifications');
  const [performanceViewMode, setPerformanceViewMode] = useState('chart'); // 'chart' | 'cards'
  const [performanceMetricFilter, setPerformanceMetricFilter] = useState('notif_only'); // 'notif_only' | 'target_vs_notif' | 'pct_achieve'

  // 6. Reports Studio States
  const [reportsDistrict, setReportsDistrict] = useState("");
  const [selectedKpiDistricts, setSelectedKpiDistricts] = useState([]);
  const [selectedMedDistricts, setSelectedMedDistricts] = useState([]);
  const [selectedAttendanceDistricts, setSelectedAttendanceDistricts] = useState([]);
  const [isDownloadingKpi, setIsDownloadingKpi] = useState(false);
  const [isDownloadingMedicineReport, setIsDownloadingMedicineReport] = useState(false);
  const [isDownloadingAttendance, setIsDownloadingAttendance] = useState(false);
  const [kpiQueueProgress, setKpiQueueProgress] = useState(null);
  const [medQueueProgress, setMedQueueProgress] = useState(null);
  const [attendanceQueueProgress, setAttendanceQueueProgress] = useState(null);

  // 7. Staff Management Suite States
  const [staffDirectory, setStaffDirectory] = useState({});
  const [staffList, setStaffList] = useState([]);

  // 8. Attendance Radar States
  const [attendance, setAttendance] = useState(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [activeAttendanceTab, setActiveAttendanceTab] = useState('missing');
  const [leaveActionModal, setLeaveActionModal] = useState(null);
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [attendanceRemarkModal, setAttendanceRemarkModal] = useState(null);
  const [isSavingAttendanceRemark, setIsSavingAttendanceRemark] = useState(false);
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [attendanceDistrictFilter, setAttendanceDistrictFilter] = useState('All');
  const [attendanceTimeFilter, setAttendanceTimeFilter] = useState('all');
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [copiedAttendance, setCopiedAttendance] = useState(false);
  const [lastSyncedTime, setLastSyncedTime] = useState('');
  const [syncStatus, setSyncStatus] = useState('LIVE');
  const lastFocusSyncRef = useRef(Date.now());

  // 9. Toast Notification State
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // 10. Broadcast Bulletin States
  const [activeBroadcasts, setActiveBroadcasts] = useState([]);

  // 11. Changelog State
  const [hasSeenLatestChangelog, setHasSeenLatestChangelog] = useState(false);

  // 12. Pacing Holidays & Peer Comparison UI States
  const [pacingHolidaysCount, setPacingHolidaysCount] = useState(0);
  const [comparatorOfficerA, setComparatorOfficerA] = useState('');
  const [comparatorOfficerB, setComparatorOfficerB] = useState('');
  const [pacingFilterStatus, setPacingFilterStatus] = useState('ALL');
  const [pacingSearchQuery, setPacingSearchQuery] = useState('');
  const [pacingSortConfig, setPacingSortConfig] = useState({ key: 'pacingPct', direction: 'desc' });
  const [pacingViewMode, setPacingViewMode] = useState('matrix');
  const [copiedCoachingOfficer, setCopiedCoachingOfficer] = useState(null);

  // --- Strict Token Retrieval & Authenticated Fetch ---
  const getAdminToken = useCallback(() => {
    return localStorage.getItem('dfy_admin_token') || '';
  }, []);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = getAdminToken();
    const headers = {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('dfy_admin_auth');
      localStorage.removeItem('dfy_admin_token');
      localStorage.removeItem('dfy_admin_user');
      setIsAuthenticated(false);
      setCurrentUser(null);
      throw new Error("Session expired. Please log in again.");
    }
    return res;
  }, [getAdminToken]);

  // Derived Filter Lists (Strict TDZ Order)
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

  const availableKpiDistricts = useMemo(() => {
    const all = (districts || []).filter(d => d !== 'All');
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowedSet = new Set(currentUser.allowed_districts.map(canonicalizeDistrict));
      return all.filter(d => allowedSet.has(canonicalizeDistrict(d)));
    }
    return all;
  }, [districts, currentUser]);

  const canDownloadBulkZip = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.role === 'SUPER_ADMIN') return true;
    if (Array.isArray(currentUser.allowed_districts)) {
      if (currentUser.allowed_districts.includes('All')) return true;
      if (currentUser.allowed_districts.length > 1) return true;
    }
    return false;
  }, [currentUser]);

  // Synchronize dropdowns when districts change
  useEffect(() => {
    const validDists = districts.filter(d => d !== 'All');
    if (validDists.length > 0) {
      if (!reportsDistrict || !validDists.includes(reportsDistrict)) {
        setReportsDistrict(validDists[0]);
      }
      if (!comparatorOfficerA || !validDists.includes(comparatorOfficerA)) {
        setComparatorOfficerA(validDists[0]);
      }
      if (!comparatorOfficerB || !validDists.includes(comparatorOfficerB)) {
        setComparatorOfficerB(validDists.length > 1 ? validDists[1] : validDists[0]);
      }
    }
  }, [districts]);

  // --- Custom Hook 1: Attendance Radar Engine ---
  const {
    deriveAttendanceFromRecords,
    fetchAttendance,
    handleExecuteMarkLeave,
    handleExecuteUnmarkLeave,
    handleExecuteAttendanceRemark,
    fetchPacingSettings,
    handleUpdatePacingHolidays,
    getSubmissionTimeClassification,
    inactiveStaffNamesSet,
    chronicDefaulters,
    districtAttendanceRollup,
    copyMissingReminder,
    copySubmittedSummary,
    copyDefaultersWarning,
    copyDistrictSpecificSummary,
    copyOnLeaveSummary
  } = useAdminAttendance({
    currentUser,
    attendanceDate,
    month,
    selectedDistrict,
    staffDirectory,
    rawRecords,
    staffList,
    authFetch,
    showToast,
    attendance,
    setAttendance,
    setIsAttendanceLoading,
    leaveActionModal,
    setLeaveActionModal,
    isSavingLeave,
    setIsSavingLeave,
    attendanceRemarkModal,
    setAttendanceRemarkModal,
    isSavingAttendanceRemark,
    setIsSavingAttendanceRemark,
    pacingHolidaysCount,
    setPacingHolidaysCount,
    setCopiedAttendance
  });

  // --- Custom Hook 2: Analytics & Pacing Engine ---
  const {
    fos,
    filteredRecords,
    aggregations,
    totals,
    dailyTrendStats,
    performanceData,
    performanceChartHeight,
    tableData,
    tableTotals,
    workingDaysInfo,
    staffPacingData,
    filteredStaffPacing,
    districtPacingData,
    pacingStats,
    effectiveDistrictTarget,
    frontlineStretchTarget,
    scopedTarget,
    liveWhatsAppBulletin,
    copyWhatsAppBulletin,
    copyDistrictWhatsAppReport
  } = useAdminAnalytics({
    rawRecords,
    month,
    selectedDistrict,
    selectedFO,
    currentUser,
    adminTargetViewMode,
    targetsData,
    staffDirectory,
    masterTableCohortFilter,
    sortConfig,
    officialDistrictTarget,
    officialTargetsByDistrict,
    pacingHolidaysCount,
    districts,
    showToast,
    activeMetric,
    performanceMetricFilter,
    staffList,
    pacingFilterStatus,
    pacingSearchQuery,
    pacingSortConfig
  });

  // --- Custom Hook 3: Reports & Workbook Downloads Engine ---
  const {
    handleToggleKpiDistrict,
    handleSelectAllKpiDistricts,
    handleClearKpiDistricts,
    handleToggleMedDistrict,
    handleSelectAllMedDistricts,
    handleClearMedDistricts,
    handleToggleAttendanceDistrict,
    handleSelectAllAttendanceDistricts,
    handleClearAttendanceDistricts,
    handleDownloadKpi,
    handleDownloadScopedZip,
    handleDownloadSequentialQueue,
    handleDownloadMedicineReport,
    handleDownloadMedicineReportScopedZip,
    handleDownloadMedicineReportQueue,
    handleDownloadStaffAttendanceQueue,
    handleDownloadAttendanceSingleOrScoped
  } = useReportDownloads({
    month,
    selectedDistrict,
    reportsDistrict,
    districts,
    availableKpiDistricts,
    selectedKpiDistricts,
    setSelectedKpiDistricts,
    selectedMedDistricts,
    setSelectedMedDistricts,
    selectedAttendanceDistricts,
    setSelectedAttendanceDistricts,
    isDownloadingKpi,
    setIsDownloadingKpi,
    kpiQueueProgress,
    setKpiQueueProgress,
    isDownloadingMedicineReport,
    setIsDownloadingMedicineReport,
    medQueueProgress,
    setMedQueueProgress,
    isDownloadingAttendance,
    setIsDownloadingAttendance,
    attendanceQueueProgress,
    setAttendanceQueueProgress,
    authFetch,
    getAdminToken,
    showToast
  });

  // --- Core Data Fetchers & Handlers ---
  const fetchDirectory = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/staff-directory`);
      if (res.ok) {
        const data = await res.json();
        setStaffDirectory(data.data || data);
      }
    } catch (e) {
      console.error("Staff directory fetch error", e);
    }
  };

  const loadTargets = async (dist = 'All', monthVal = null) => {
    try {
      const targetMonth = monthVal || month;
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${targetMonth}`;
      if (dist && dist !== 'All') {
        q += `&district=${encodeURIComponent(dist)}`;
      }
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/get-targets${q}`);
      if (res.ok) {
        const data = await res.json();
        const targetsList = data.targets || [];
        setTargetsData(targetsList);

        if (data.official_targets_by_district) {
          setOfficialTargetsByDistrict(data.official_targets_by_district);
          setTempOfficialTargets(data.official_targets_by_district);
          if (dist && dist !== 'All') {
            const cD = canonicalizeDistrict(dist);
            if (data.official_targets_by_district[cD] !== undefined) {
              setOfficialDistrictTarget(data.official_targets_by_district[cD]);
            }
          } else if (data.official_district_target !== undefined) {
            setOfficialDistrictTarget(data.official_district_target);
          }
        } else if (data.official_district_target !== undefined) {
          setOfficialDistrictTarget(data.official_district_target);
        }
      }
    } catch (e) {
      console.error("Targets load error", e);
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
      console.error("Staff list fetch error", e);
    }
  };

  const fetchActiveBroadcasts = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = '';
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q = `?districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await authFetch(`${API_BASE_URL}/api/broadcasts/active${q}`);
      if (res.ok) {
        const data = await res.json();
        setActiveBroadcasts(data.broadcasts || data || []);
      }
    } catch (e) {
      console.error("Broadcasts fetch error", e);
    }
  };

  const fetchTopPerformers = useCallback(async (period = topPerformersPeriod, mode = adminTargetViewMode) => {
    setLoadingTopPerformers(true);
    try {
      const targetModeParam = mode === 'frontline' ? 'frontline' : 'official';
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/api/statewide-top-performers?month=${month}&period=${period}&mode=${targetModeParam}&target_mode=${targetModeParam}`);
      if (res.ok) {
        const data = await res.json();
        setTopPerformersData(data);
      }
    } catch (e) {
      console.error("Top performers fetch error", e);
    } finally {
      setLoadingTopPerformers(false);
    }
  }, [month, topPerformersPeriod, adminTargetViewMode, authFetch]);

  // High-Capacity IndexedDB & Delta Sync Data Fetcher
  const fetchData = async (forceRefresh = false, silent = false) => {
    const cacheKey = `dfy_dash_cache_${month}_${currentUser?.user_id || 'admin'}`;
    let cachedData = null;
    if (!forceRefresh) {
      try {
        const rawCache = localStorage.getItem(cacheKey);
        if (rawCache) cachedData = JSON.parse(rawCache);
        if (!cachedData) {
          cachedData = await getCachedDashboardData(cacheKey);
        }
      } catch (e) {
        try {
          cachedData = await getCachedDashboardData(cacheKey);
        } catch (err) {
          cachedData = null;
        }
      }
    } else {
      await clearCachedDashboardData(cacheKey);
    }

    const hasValidIds = cachedData && Array.isArray(cachedData.records) && cachedData.records.some(r => Array.isArray(r.notification_ids));
    if (cachedData && Array.isArray(cachedData.records) && cachedData.records.length > 0 && hasValidIds && !forceRefresh) {
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
        setSyncStatus('UP_TO_DATE');
        if (data.synced_at) setLastSyncedTime(data.synced_at);
      } else if (data.mode === 'DELTA') {
        setRawRecords(prev => {
          const currentList = (prev && prev.length > 0) ? prev : (cachedData?.records || []);
          const map = new Map(currentList.map(r => [r.id || r.doc_id, r]));
          if (Array.isArray(data.deleted_ids)) {
            data.deleted_ids.forEach(delId => map.delete(delId));
          }
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
            setCachedDashboardData(cacheKey, {
              synced_at: syncStamp,
              records: updated
            });
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
        const newRecords = Array.isArray(data.records) ? data.records : [];
        setRawRecords(newRecords);
        const fallbackStamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const syncStamp = data.synced_at || fallbackStamp;
        setLastSyncedTime(syncStamp);
        setSyncStatus('LIVE');
        try {
          setCachedDashboardData(cacheKey, {
            synced_at: syncStamp,
            records: newRecords
          });
          localStorage.setItem(cacheKey, JSON.stringify({
            synced_at: syncStamp,
            records: newRecords
          }));
        } catch (storageErr) {
          console.warn("Storage quota full, continuing with in-memory state:", storageErr);
        }
      }

      if (forceRefresh) {
        showToast("✓ Live database refresh complete.", "success");
      }
      return true;
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      if (!silent) {
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

  const handleHardAppReset = async () => {
    if (!window.confirm("App cache clear karke fresh version reload karein?")) return;
    try {
      await clearAllAdminCache();
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

  const handleLogin = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/auth/user-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Authentication failed");

      localStorage.setItem('dfy_admin_auth', 'true');
      localStorage.setItem('dfy_admin_token', data.token);
      localStorage.setItem('dfy_admin_user', JSON.stringify(data.user));

      setIsAuthenticated(true);
      setCurrentUser(data.user);
      setPassword('');
      showToast(`✓ Welcome back, ${data.user.name}!`, "success");
    } catch (err) {
      setError(err.message);
    }
  };

  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // --- Hook 4: All 24 Admin Modals State & Handlers Engine ---
  const modals = useAdminModals({
    month, currentUser, districts, targetModalDistricts, availableKpiDistricts,
    staffDirectory, targetsData, rawRecords, setRawRecords, staffList, fetchStaffList,
    activeBroadcasts, fetchActiveBroadcasts,
    officialDistrictTarget, setOfficialDistrictTarget, tempOfficialTargets, setTempOfficialTargets,
    loadTargets,
    topPerformersPeriod, setTopPerformersPeriod, adminTargetViewMode, topPerformersData,
    loadingTopPerformers, topPerformerRandomMsg, setTopPerformerRandomMsg, fetchTopPerformers,
    attendance, chronicDefaulters, attendanceDistrictFilter, setAttendanceDistrictFilter,
    attendanceTimeFilter, setAttendanceTimeFilter, attendanceSearchQuery, setAttendanceSearchQuery,
    inactiveStaffNamesSet, attendanceDate, setAttendanceDate, fetchAttendance,
    isAttendanceLoading, activeAttendanceTab, setActiveAttendanceTab,
    leaveActionModal, setLeaveActionModal, handleExecuteMarkLeave, handleExecuteUnmarkLeave,
    attendanceRemarkModal, setAttendanceRemarkModal, handleExecuteAttendanceRemark,
    isSavingAttendanceRemark, getSubmissionTimeClassification,
    reportsDistrict, setReportsDistrict, selectedKpiDistricts,
    handleToggleKpiDistrict, handleSelectAllKpiDistricts, handleClearKpiDistricts,
    isDownloadingKpi, handleDownloadKpi, canDownloadBulkZip, handleDownloadScopedZip,
    handleDownloadSequentialQueue, kpiQueueProgress, selectedMedDistricts,
    handleToggleMedDistrict, handleSelectAllMedDistricts, handleClearMedDistricts,
    isDownloadingMedicineReport, handleDownloadMedicineReport,
    handleDownloadMedicineReportScopedZip, handleDownloadMedicineReportQueue,
    medQueueProgress, selectedAttendanceDistricts, handleToggleAttendanceDistrict,
    handleSelectAllAttendanceDistricts, handleClearAttendanceDistricts,
    isDownloadingAttendance, handleDownloadAttendanceSingleOrScoped,
    handleDownloadStaffAttendanceQueue, attendanceQueueProgress,
    copyWhatsAppBulletin, liveWhatsAppBulletin,
    authFetch, getAdminToken, showToast, fetchData, setPassword
  });

  // Trigger useEffects (Strict TDZ Order)
  useEffect(() => {
    if (isAuthenticated) { 
      fetchData(false); 
      fetchAttendance(); 
      fetchDirectory(); 
      loadTargets('All', month); 
      fetchStaffList(); 
      fetchActiveBroadcasts();
      fetchTopPerformers(topPerformersPeriod, adminTargetViewMode);
    }
  }, [month, isAuthenticated, topPerformersPeriod, fetchTopPerformers, adminTargetViewMode]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTopPerformers(topPerformersPeriod, adminTargetViewMode);
    }
  }, [adminTargetViewMode, topPerformersPeriod, isAuthenticated, fetchTopPerformers]);

  useEffect(() => {
    if (isAuthenticated && selectedDistrict) {
      fetchPacingSettings(month, selectedDistrict);
    }
  }, [selectedDistrict, isAuthenticated, month]);

  useEffect(() => {
    if (isAuthenticated && activeMainTab === 'district_benchmarks') {
      loadTargets('All', month);
    }
  }, [activeMainTab, isAuthenticated, month]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const intervalId = setInterval(() => {
      if (document.hidden) return;
      fetchData(false, true);
    }, 45000);

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

  // Render Login View if not Authenticated
  if (!isAuthenticated) {
    return (
      <AdminLogin
        loginUsername={loginUsername}
        setLoginUsername={setLoginUsername}
        password={password}
        setPassword={setPassword}
        error={error}
        handleLogin={handleLogin}
      />
    );
  }

  // Render Authenticated Admin Dashboard
  return (
    <div className="min-h-screen bg-slate-50/50 p-2 sm:p-4 md:p-6 font-sans text-slate-800">
      <div className="max-w-[1720px] w-full mx-auto space-y-4">
        {isColdStarting && (!rawRecords || rawRecords.length === 0) && (
          <div className="bg-amber-500 text-white px-4 py-3 rounded-2xl font-bold text-xs sm:text-sm text-center shadow-md animate-pulse flex items-center justify-center gap-2">
            <span>⚡ Server wake-up ho raha hai (Render spin-up), kripya thoda intezar karein...</span>
          </div>
        )}

        {/* Executive Sticky Header & Command Center */}
        <AdminHeader
          rawRecords={rawRecords}
          currentUser={currentUser}
          isSuperAdmin={isSuperAdmin}
          month={month}
          setMonth={setMonth}
          selectedDistrict={selectedDistrict}
          setSelectedDistrict={setSelectedDistrict}
          districts={districts}
          selectedFO={selectedFO}
          setSelectedFO={setSelectedFO}
          fos={fos}
          adminTargetViewMode={adminTargetViewMode}
          setAdminTargetViewMode={setAdminTargetViewMode}
          showToast={showToast}
          copyDistrictWhatsAppReport={copyDistrictWhatsAppReport}
          copyWhatsAppBulletin={copyWhatsAppBulletin}
          lastSyncedTime={lastSyncedTime}
          syncStatus={syncStatus}
          isLoading={isLoading}
          fetchData={fetchData}
          fetchAttendance={fetchAttendance}
          fetchDirectory={fetchDirectory}
          loadTargets={loadTargets}
          fetchStaffList={fetchStaffList}
          fetchActiveBroadcasts={fetchActiveBroadcasts}
          fetchCascadeAlerts={modals.fetchCascadeAlerts}
          handleHardAppReset={handleHardAppReset}
          hasSeenLatestChangelog={hasSeenLatestChangelog}
          setHasSeenLatestChangelog={setHasSeenLatestChangelog}
          setShowChangelogModal={modals.setShowChangelogModal}
          setShowAppGuideModal={modals.setShowAppGuideModal}
          setSecurityStatusMsg={modals.setSecurityStatusMsg}
          setShowSecurityModal={modals.setShowSecurityModal}
          setIsAuthenticated={setIsAuthenticated}
          setCurrentUser={setCurrentUser}
          setShowAdminFeedModal={modals.setShowAdminFeedModal}
          setFeedDistrict={modals.setFeedDistrict}
          setFeedFoName={modals.setFeedFoName}
          setFeedDate={modals.setFeedDate}
          setFeedError={modals.setFeedError}
          setFeedSuccess={modals.setFeedSuccess}
          setFeedCategoryInputs={modals.setFeedCategoryInputs}
          setFeedRemarks={modals.setFeedRemarks}
          availableDistrictsForFeed={availableKpiDistricts}
          fetchAttendanceRadar={fetchAttendance}
          setShowAttendanceModal={modals.setShowAttendanceModal}
          setActiveMainTab={setActiveMainTab}
          setShowNotifTrayModal={modals.setShowNotifTrayModal}
          notifTrayData={modals.notifTrayData}
          setShowNikshayModal={modals.setShowNikshayModal}
          setShowJourneyModal={modals.setShowJourneyModal}
          fetchDuplicateAudit={modals.fetchDuplicateAudit}
          fetchDuplicateScan={modals.fetchDuplicateScan}
          setShowDuplicateModal={modals.setShowDuplicateModal}
          duplicateAudit={modals.duplicateAudit}
          duplicateScanData={modals.duplicateScanData}
          setShowCascadeModal={modals.setShowCascadeModal}
          cascadeAlerts={modals.cascadeData?.alerts || []}
          canEditTargets={isSuperAdmin || (currentUser?.role === 'SUB_ADMIN')}
          setShowTargetModal={modals.setShowTargetModal}
          setTargetModalDistrict={modals.setTargetModalDistrict}
          officialTargetsByDistrict={officialTargetsByDistrict}
          setOfficialDistrictTarget={setOfficialDistrictTarget}
          canManageStaff={isSuperAdmin}
          setShowStaffSuite={modals.setShowStaffSuite}
          fetchAdminUsers={modals.fetchAdminUsers}
          setShowAdminUsersModal={modals.setShowAdminUsersModal}
          fetchRecentIdEdits={modals.fetchRecentIdEdits}
          setShowRecentIdEditsModal={modals.setShowRecentIdEditsModal}
          setShowReportsStudio={modals.setShowReportsStudio}
          setShowTopPerformersModal={modals.setShowTopPerformersModal}
          fetchBackupStatus={modals.fetchBackupStatus}
          setShowBackupModal={modals.setShowBackupModal}
          fetchAuditLogs={modals.fetchAuditLogs}
          setShowAuditModal={modals.setShowAuditModal}
          fetchAllBroadcasts={modals.fetchAllBroadcasts}
          setShowBroadcastStudio={modals.setShowBroadcastModal}
          activeAdminBroadcasts={activeBroadcasts}
          handleDeleteBroadcast={modals.handleDeleteBroadcast}
          activeMainTab={activeMainTab}
          workingDaysInfo={workingDaysInfo}
          pacingStats={pacingStats}
        />

        {/* Tab 1: Overview & State Analytics */}
        <OverviewTab
          activeMainTab={activeMainTab}
          filteredRecords={filteredRecords}
          isTickerPaused={isTickerPaused}
          setIsTickerPaused={setIsTickerPaused}
          isLoading={isLoading}
          todayAttendance={attendance}
          setActiveAttendanceTab={setActiveAttendanceTab}
          setAttendanceDistrictFilter={setAttendanceDistrictFilter}
          setAttendanceSearchQuery={setAttendanceSearchQuery}
          setShowAttendanceModal={modals.setShowAttendanceModal}
          chronicDefaulters={chronicDefaulters}
          topPerformersTab={topPerformersTab}
          setTopPerformersTab={setTopPerformersTab}
          topPerformersPeriod={topPerformersPeriod}
          setTopPerformersPeriod={setTopPerformersPeriod}
          fetchTopPerformers={fetchTopPerformers}
          loadingTopPerformers={loadingTopPerformers}
          handleShareTopPerformersWhatsApp={modals.handleShareTopPerformersWhatsApp}
          setShowTopPerformersModal={modals.setShowTopPerformersModal}
          topPerformersData={topPerformersData}
          selectedDistrict={selectedDistrict}
          setSelectedDistrict={setSelectedDistrict}
          month={month}
          setMonth={setMonth}
          selectedFO={selectedFO}
          setSelectedFO={setSelectedFO}
          workingDaysInfo={workingDaysInfo}
          officialTargetsByDistrict={officialTargetsByDistrict}
          effectiveDistrictTarget={effectiveDistrictTarget}
          frontlineStretchTarget={frontlineStretchTarget}
          scopedTarget={scopedTarget}
          totals={aggregations || totals}
          isSubAdmin={!isSuperAdmin}
          currentUser={currentUser}
          setInspectingFO={modals.setInspectingFO}
          performanceViewMode={performanceViewMode}
          setPerformanceViewMode={setPerformanceViewMode}
          performanceMetricFilter={performanceMetricFilter}
          setPerformanceMetricFilter={setPerformanceMetricFilter}
          performanceChartHeight={performanceChartHeight}
          performanceData={performanceData}
          activeMetric={activeMetric}
          setActiveMetric={setActiveMetric}
          dailyTrendStats={dailyTrendStats}
          trendGradient={"from-indigo-500 to-blue-500"}
          compareDistA={comparatorOfficerA}
          setCompareDistA={setComparatorOfficerA}
          compareDistB={comparatorOfficerB}
          setCompareDistB={setComparatorOfficerB}
          districts={districts}
          rawRecords={rawRecords}
          masterTableCohortFilter={masterTableCohortFilter}
          setMasterTableCohortFilter={setMasterTableCohortFilter}
          tableData={tableData}
          sortConfig={sortConfig}
          requestSort={requestSort}
          tableTotals={tableTotals}
          adminTargetViewMode={adminTargetViewMode}
          setIsAuthenticated={setIsAuthenticated}
          targetsData={targetsData}
          error={error}
          fetchData={fetchData}
          isSuperAdmin={isSuperAdmin}
        />

        {/* Tab 2: Staff Target Pacing & Run-Rate Studio */}
        <StaffPacingTab
          activeMainTab={activeMainTab}
          month={month}
          selectedDistrict={selectedDistrict}
          setSelectedDistrict={setSelectedDistrict}
          districts={districts}
          workingDaysInfo={workingDaysInfo}
          pacingHolidaysCount={pacingHolidaysCount}
          handleUpdatePacingHolidays={handleUpdatePacingHolidays}
          pacingStats={pacingStats}
          comparatorOfficerA={comparatorOfficerA}
          setComparatorOfficerA={setComparatorOfficerA}
          comparatorOfficerB={comparatorOfficerB}
          setComparatorOfficerB={setComparatorOfficerB}
          staffPacingData={staffPacingData}
          filteredStaffPacing={filteredStaffPacing}
          pacingFilterStatus={pacingFilterStatus}
          setPacingFilterStatus={setPacingFilterStatus}
          pacingSearchQuery={pacingSearchQuery}
          setPacingSearchQuery={setPacingSearchQuery}
          pacingSortConfig={pacingSortConfig}
          setPacingSortConfig={setPacingSortConfig}
          pacingViewMode={pacingViewMode}
          setPacingViewMode={setPacingViewMode}
          setInspectingFO={modals.setInspectingFO}
          copyCoachingMessage={(officer) => {
            showToast(`✓ Coaching message copied for ${officer.name || officer.fo_name}!`, "success");
          }}
          copiedCoachingOfficer={copiedCoachingOfficer}
        />

        {/* Tab 3: District Benchmarks & Pacing Matrix */}
        <DistrictBenchmarksTab
          activeMainTab={activeMainTab}
          month={month}
          adminTargetViewMode={adminTargetViewMode}
          setAdminTargetViewMode={setAdminTargetViewMode}
          districtPacingData={districtPacingData}
          setSelectedDistrict={setSelectedDistrict}
          setActiveMainTab={setActiveMainTab}
          showToast={showToast}
        />

        {/* Branding Footer */}
        <footer className="w-full text-center py-8 mt-auto opacity-70">
          <p className="text-sm font-bold text-slate-500 tracking-widest uppercase">
            Designed by <span className="text-indigo-600 font-black">Insomniac</span>
          </p>
        </footer>

        {/* --- 24 Modular Administration Modals --- */}
        <AdminModals
          {...modals}
          selectedDistrict={selectedDistrict}
          districts={districts}
          currentUser={currentUser}
          isSubAdmin={!isSuperAdmin}
          month={month}
          staffDirectory={staffDirectory}
          tempOfficialTargets={tempOfficialTargets}
          setTempOfficialTargets={setTempOfficialTargets}
          districtAttendanceRollup={districtAttendanceRollup}
          copyMissingReminder={copyMissingReminder}
          copySubmittedSummary={copySubmittedSummary}
          copyDefaultersWarning={copyDefaultersWarning}
          copyDistrictSpecificSummary={copyDistrictSpecificSummary}
          copyOnLeaveSummary={copyOnLeaveSummary}
          isSavingLeave={isSavingLeave}
          copiedAttendance={copiedAttendance}
        />

        {/* Global Toast Notification Portal */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-bounce">
            <div className={`px-4 py-3 rounded-2xl shadow-xl text-white font-bold text-xs flex items-center gap-2 ${
              toast.type === 'error' ? 'bg-rose-600 shadow-rose-600/30' : 'bg-slate-900 shadow-slate-900/30'
            }`}>
              <span>{toast.type === 'error' ? '⚠️' : '✓'}</span>
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
