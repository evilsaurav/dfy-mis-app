import { useState, useEffect, useCallback, useRef } from 'react';
import { downloadOrShareCanvas } from '../canvasShare';
import { feedCategoriesConfig, formatAuditTimestamp, TOP_PERFORMER_MESSAGES } from '../utils/districtHelpers';

export function useAdminModals({
  month,
  currentUser,
  districts,
  targetModalDistricts,
  availableKpiDistricts,
  staffDirectory,
  targetsData,
  rawRecords,
  staffList,
  fetchStaffList,
  activeBroadcasts,
  fetchActiveBroadcasts,
  officialDistrictTarget,
  setOfficialDistrictTarget,
  tempOfficialTargets,
  setTempOfficialTargets,
  topPerformersPeriod,
  setTopPerformersPeriod,
  loadTargets,
  adminTargetViewMode,
  topPerformersData,
  loadingTopPerformers,
  topPerformerRandomMsg,
  setTopPerformerRandomMsg,
  fetchTopPerformers,
  attendance,
  chronicDefaulters,
  attendanceDistrictFilter,
  setAttendanceDistrictFilter,
  attendanceTimeFilter,
  setAttendanceTimeFilter,
  attendanceSearchQuery,
  setAttendanceSearchQuery,
  inactiveStaffNamesSet,
  attendanceDate,
  setAttendanceDate,
  fetchAttendance,
  isAttendanceLoading,
  activeAttendanceTab,
  setActiveAttendanceTab,
  leaveActionModal,
  setLeaveActionModal,
  handleExecuteMarkLeave,
  handleExecuteUnmarkLeave,
  attendanceRemarkModal,
  setAttendanceRemarkModal,
  handleExecuteAttendanceRemark,
  isSavingAttendanceRemark,
  getSubmissionTimeClassification,
  reportsDistrict,
  setReportsDistrict,
  selectedKpiDistricts,
  handleToggleKpiDistrict,
  handleSelectAllKpiDistricts,
  handleClearKpiDistricts,
  isDownloadingKpi,
  handleDownloadKpi,
  canDownloadBulkZip,
  handleDownloadScopedZip,
  handleDownloadSequentialQueue,
  kpiQueueProgress,
  selectedMedDistricts,
  handleToggleMedDistrict,
  handleSelectAllMedDistricts,
  handleClearMedDistricts,
  isDownloadingMedicineReport,
  handleDownloadMedicineReport,
  handleDownloadMedicineReportScopedZip,
  handleDownloadMedicineReportQueue,
  medQueueProgress,
  selectedAttendanceDistricts,
  handleToggleAttendanceDistrict,
  handleSelectAllAttendanceDistricts,
  handleClearAttendanceDistricts,
  isDownloadingAttendance,
  handleDownloadAttendanceSingleOrScoped,
  handleDownloadStaffAttendanceQueue,
  attendanceQueueProgress,
  copyWhatsAppBulletin,
  liveWhatsAppBulletin,
  authFetch,
  getAdminToken,
  showToast,
  fetchData
}) {
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
  const [adminUserEditModal, setAdminUserEditModal] = useState(null);
  const [newAdminModal, setNewAdminModal] = useState(null);
  const [deleteAdminModal, setDeleteAdminModal] = useState(null);
  const [isSavingAdminUser, setIsSavingAdminUser] = useState(false);

  // 9. Audit Trail
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilterAction, setAuditFilterAction] = useState('All');
  const [auditFilterAdmin, setAuditFilterAdmin] = useState('All');
  const [auditFilterTarget, setAuditFilterTarget] = useState('All');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

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
  const [notifTrayFilterDistrict, setNotifTrayFilterDistrict] = useState('All');
  const [notifTraySearchQuery, setNotifTraySearchQuery] = useState('');
  const [notifTrayCategoryFilter, setNotifTrayCategoryFilter] = useState('all');
  const [isExportingNotifTray, setIsExportingNotifTray] = useState(false);

  // 12. App Guide SOP
  const [showAppGuideModal, setShowAppGuideModal] = useState(false);
  const [appGuideActiveTopic, setAppGuideActiveTopic] = useState('getting_started');
  const [appGuideSearchQuery, setAppGuideSearchQuery] = useState('');

  // 13. Nikshay Reconciler
  const [showNikshayModal, setShowNikshayModal] = useState(false);
  const [nikshayRecords, setNikshayRecords] = useState([]);
  const [nikshayLoading, setNikshayLoading] = useState(false);
  const [nikshaySyncing, setNikshaySyncing] = useState(false);
  const [nikshayFilterDist, setNikshayFilterDist] = useState('All');
  const [nikshayFilterMonth, setNikshayFilterMonth] = useState(new Date().toISOString().slice(0, 7));
  const [nikshaySearch, setNikshaySearch] = useState('');
  const [nikshaySelectedPatient, setNikshaySelectedPatient] = useState(null);
  const [nikshayEditForm, setNikshayEditForm] = useState(null);
  const [nikshaySaving, setNikshaySaving] = useState(false);
  const [nikshayFilterStatus, setNikshayFilterStatus] = useState('all');
  const [isExportingNikshay, setIsExportingNikshay] = useState(false);

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
  const [feedSubmitting, setFeedSubmitting] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedSuccess, setFeedSuccess] = useState('');

  // 15. Target Setting
  const [targetModalMonth, setTargetModalMonth] = useState(new Date().toISOString().slice(0, 7));
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

  // --- Handlers & Fetchers for Modals ---
  const fetchCascadeAlerts = useCallback(async () => {
    setLoadingCascade(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/cascade-alerts?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setCascadeData(data || { summary: {}, alerts: [] });
      }
    } catch (e) {
      console.error("Cascade alerts fetch error", e);
    } finally {
      setLoadingCascade(false);
    }
  }, [month, authFetch]);

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
    drawQuadrant(col1X, row1Y, 'TOP 5 DISTRICTS', 'Target Achievement & Volume', '🏛️', '#38bdf8', topPerformersData.top_districts || [], (d, startX, startY) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
      ctx.fillText(d.district, startX, startY + 28);

      const pctText = `${d.percentage}% Target`;
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
  }, [topPerformersData, topPerformersPeriod, month, topPerformerRandomMsg]);

  
  const handleDownloadTopPerformersPoster = useCallback(async () => {
    try {
      const nextMsg = TOP_PERFORMER_MESSAGES[Math.floor(Math.random() * TOP_PERFORMER_MESSAGES.length)];
      setTopPerformerRandomMsg?.(nextMsg);
      await generateTopPerformersPosterCanvas();
      const canvas = topPerformersCanvasRef.current;
      if (!canvas) return;
      const filename = `DFY_Top_Performers_${topPerformersPeriod}_${month}.png`;
      await downloadOrShareCanvas(canvas, filename);
      showToast("✓ Poster downloaded successfully!", "success");
    } catch (e) {
      console.error("handleDownloadTopPerformersPoster error", e);
    }
  }, [generateTopPerformersPosterCanvas, topPerformersCanvasRef, topPerformersPeriod, month, showToast, setTopPerformerRandomMsg]);

  const handleShareTopPerformersWhatsApp = useCallback(() => {
    if (!topPerformersData) return;
    let text = `*🏆 BIHAR STATEWIDE TOP PERFORMERS STUDIO — ${month.toUpperCase()}*\n`;
    text += `_Reporting Horizon: ${topPerformersPeriod.toUpperCase()}_\n\n`;
    text += `${topPerformerRandomMsg}\n\n`;
    
    if (topPerformersData.top_districts?.length > 0) {
      text += `*🏛️ TOP DISTRICTS:*\n`;
      topPerformersData.top_districts.slice(0, 5).forEach((d, i) => {
        text += `${i+1}. *${d.district}*: ${d.score}% (${d.achieved}/${d.target})\n`;
      });
      text += `\n`;
    }

    if (topPerformersData.top_fo?.length > 0) {
      text += `*🛵 TOP FIELD OFFICERS:*\n`;
      topPerformersData.top_fo.slice(0, 5).forEach((f, i) => {
        text += `${i+1}. *${f.fo_name}* (${f.district}): ${f.notifications} Notif (${f.pct}%)\n`;
      });
      text += `\n`;
    }

    text += `_Congratulations to all clinical champions leading Bihar's TB elimination drive! 🏥_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  }, [topPerformersData, topPerformersPeriod, month, topPerformerRandomMsg]);

  useEffect(() => {
    if (showDuplicateModal) {
      fetchDuplicateAudit();
      fetchDuplicateScan();
    }
  }, [showDuplicateModal, fetchDuplicateAudit, fetchDuplicateScan]);

  const handleSaveSingleDistrictTarget = useCallback(async (distName, targetVal) => {
    if (!distName) return;
    const val = Number(targetVal);
    if (isNaN(val) || val < 0) {
      showToast?.('Official target must be a non-negative number', 'error');
      return;
    }
    setIsSavingDistrictTarget(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("token") || currentUser?.token);
      const res = await fetch(`${API_BASE_URL}/update-district-target`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          month: targetModalMonth,
          district: distName,
          official_target: val
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast?.(`Official target for ${distName} saved (${val})!`, 'success');
        if (targetModalDistrict === distName && setOfficialDistrictTarget) {
          setOfficialDistrictTarget(val);
        }
      } else {
        showToast?.(data.detail || `Failed to save target for ${distName}`, 'error');
      }
    } catch (err) {
      console.error("handleSaveSingleDistrictTarget error", err);
      showToast?.('Network error while saving official district target', 'error');
    } finally {
      setIsSavingDistrictTarget(false);
    }
  }, [getAdminToken, currentUser, targetModalMonth, showToast, targetModalDistrict, setOfficialDistrictTarget]);

  const handleSaveBulkDistrictTargets = useCallback(async () => {
    setIsSavingBulkDistrictTargets(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("token") || currentUser?.token);
      const payloadTargets = (targetModalDistricts || []).map(dist => ({
        district: dist,
        official_target: Math.max(0, Number(tempOfficialTargets?.[dist] ?? officialDistrictTarget ?? 0))
      }));
      const res = await fetch(`${API_BASE_URL}/update-district-targets-bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          month: targetModalMonth,
          targets: payloadTargets
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast?.(`✓ All ${payloadTargets.length} district official targets saved successfully!`, 'success');
      } else {
        showToast?.(data.detail || 'Failed to bulk save official district targets', 'error');
      }
    } catch (err) {
      console.error("handleSaveBulkDistrictTargets error", err);
      showToast?.('Network error while bulk saving official district targets', 'error');
    } finally {
      setIsSavingBulkDistrictTargets(false);
    }
  }, [getAdminToken, currentUser, targetModalDistricts, tempOfficialTargets, officialDistrictTarget, targetModalMonth, showToast]);

  const saveAllTargets = useCallback(async () => {
    setIsSavingTargets(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = getAdminToken ? getAdminToken() : (localStorage.getItem("token") || currentUser?.token);
      const res = await fetch(`${API_BASE_URL}/update-targets-bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          month: targetModalMonth,
          targets: targetsData
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast?.('✓ Frontline targets saved successfully!', 'success');
      }
    } catch (err) {
      console.error("saveAllTargets error", err);
    } finally {
      setIsSavingTargets(false);
    }
  }, [getAdminToken, currentUser, targetModalMonth, targetsData, showToast]);

  const handleSaveAllTargetsCombined = useCallback(async () => {
    await handleSaveBulkDistrictTargets();
    await saveAllTargets();
    showToast?.('✓ All Official Targets & Frontline Allocations Saved!', 'success');
  }, [handleSaveBulkDistrictTargets, saveAllTargets, showToast]);

  useEffect(() => {
    if (showDuplicateModal && duplicateRadarTab === 'repair' && !duplicateScanData) {
      fetchDuplicateScan();
    }
  }, [showDuplicateModal, duplicateRadarTab, duplicateScanData, fetchDuplicateScan]);

  const handleExecuteUpdatePin = async (e) => {
    e.preventDefault();
    if (!pinChangeModal) return;
    const { name, district, newPin, designation, target } = pinChangeModal;
    if (!newPin || newPin.trim().length !== 4 || !/^\d+$/.test(newPin.trim())) {
      setPinChangeModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits (numbers only)." }));
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
      const data = await res.json();
      if (res.ok) {
        if (typeof setStaffList === 'function') {
          setStaffList(prev => prev.map(s => (s.name === name && s.district === district ? {
            ...s,
            pin: newPin.trim(),
            designation: designation || s.designation
          } : s)));
        }
        if (typeof loadTargets === 'function') loadTargets('All', month);
        if (typeof fetchTopPerformers === 'function') fetchTopPerformers(topPerformersPeriod);
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
        if (typeof fetchStaffList === 'function') fetchStaffList();
        if (typeof fetchAttendance === 'function') fetchAttendance(true);
        if (typeof fetchTopPerformers === 'function') fetchTopPerformers(topPerformersPeriod);
        setAddStaffModal(null);
      } else {
        setAddStaffModal(prev => ({ ...prev, error: data.detail || "Failed to add officer.", loading: false }));
      }
    } catch (err) {
      setAddStaffModal(prev => ({ ...prev, error: "Network error.", loading: false }));
    }
  };

  return {
    // 1. Security
    showSecurityModal, setShowSecurityModal,
    changeCurrentPw, setChangeCurrentPw,
    changeNewPw, setChangeNewPw,
    securityStatusMsg, setSecurityStatusMsg,
    isSavingSecurity,

    // 2. Cascade Alerts
    showCascadeModal, setShowCascadeModal,
    cascadeData, loadingCascade,
    cascadeFilterDist, setCascadeFilterDist,
    cascadeRiskFilter, setRiskFilter: setCascadeRiskFilter,
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
    journeyLoading, journeyResult, journeyError,

    // 6. Automated Backup
    showBackupModal, setShowBackupModal,
    backupStatus, backupLoading, backupTriggerLoading, backupActionMsg,
    restoreConfirmText, setRestoreConfirmText,
    restoreTargetFile, setRestoreTargetFile,
    restoreLoading,

    // 7. Top Performers Studio
    showTopPerformersModal, setShowTopPerformersModal,
    adminTargetViewMode, topPerformersPeriod, setTopPerformersPeriod,
    fetchTopPerformers, month, topPerformersData, loadingTopPerformers,
    topPerformerRandomMsg, setTopPerformerRandomMsg,
    topPerformersCanvasRef, handleShareTopPerformersWhatsApp, handleDownloadTopPerformersPoster,

    // 8. Admin Users
    showAdminUsersModal, setShowAdminUsersModal,
    adminUsersList, adminUsersLoading, currentUser,
    adminUserEditModal, setAdminUserEditModal,
    newAdminModal, setNewAdminModal,
    deleteAdminModal, setDeleteAdminModal,
    isSavingAdminUser,

    // 9. Audit Trail
    showAuditModal, setShowAuditModal,
    auditLogs, auditLoading,
    auditFilterAction, setAuditFilterAction,
    auditFilterTarget, setAuditFilterTarget,
    auditFilterAdmin, setAuditFilterAdmin,
    auditSearchQuery, setAuditSearchQuery,
    formatAuditTimestamp,

    // 10. Broadcast Studio & Unread Popup
    unreadBroadcastPopup, setUnreadBroadcastPopup,
    showBroadcastModal, setShowBroadcastModal,
    activeBroadcasts, broadcastHistory, broadcastLoading, isSendingBroadcast,
    newBroadcastModal, setNewBroadcastModal,
    deleteBroadcastModal, setDeleteBroadcastModal,
    fetchActiveBroadcasts,

    // 11. Notif Tray
    showNotifTrayModal, setShowNotifTrayModal,
    notifTrayFilterDistrict, setNotifTrayFilterDistrict,
    notifTraySearchQuery, setNotifTraySearchQuery,
    notifTrayCategoryFilter, setCategoryFilter: setNotifTrayCategoryFilter,
    isExportingNotifTray, setIsExportingNotifTray,

    // 12. App Guide SOP
    showAppGuideModal, setShowAppGuideModal,
    appGuideActiveTopic, setAppGuideActiveTopic,
    appGuideSearchQuery, setAppGuideSearchQuery,

    // 13. Nikshay Reconciler
    showNikshayModal, setShowNikshayModal,
    nikshayFilterMonth, setNikshayFilterMonth,
    nikshayRecords, nikshayLoading, nikshaySyncing,
    nikshayFilterDist, setNikshayFilterDist,
    nikshaySearch, setNikshaySearch,
    nikshayFilterStatus, setNikshayFilterStatus,
    nikshaySelectedPatient, setNikshaySelectedPatient,
    nikshayEditForm, setNikshayEditForm,
    nikshaySaving, isExportingNikshay, setIsExportingNikshay,

    // 14. Admin Backdated Feeding
    showAdminFeedModal, setShowAdminFeedModal,
    feedDistrict, setFeedDistrict,
    feedFoName, setFeedFoName,
    feedDate, setDate: setFeedDate,
    categoryInputs: feedCategoryInputs, setCategoryInputs: setFeedCategoryInputs,
    visitedNames: feedVisitedNames, setVisitedNames: setFeedVisitedNames,
    feedRemarks, setRemarks: setFeedRemarks,
    travelExpense, setTravelExpense,
    morningKm, setMorningKm,
    eveningKm, setEveningKm,
    isNextDay, setIsNextDay,
    submissionCount, setSubmissionCount,
    isSubmitting: feedSubmitting,
    feedError, feedSuccess,
    availableDistrictsForFeed: availableKpiDistricts,
    feedCategoriesConfig,
    fetchData,

    // 15. Target Setting
    targetModalMonth, setTargetModalMonth,
    targetModalDistrict, setTargetModalDistrict,
    targetModalTab, setTargetModalTab,
    targetSearchQuery, setTargetSearchQuery,
    targetModalDistricts, officialDistrictTarget, setOfficialDistrictTarget,
    tempOfficialTargets, setTempOfficialTargets,
    targetsData, isSavingTargets,
    isSavingDistrictTarget, isSavingBulkDistrictTargets,
    bulkTargetValue, setBulkTargetValue,
    handleSaveSingleDistrictTarget,
    handleSaveBulkDistrictTargets,
    saveAllTargets,
    handleSaveAllTargetsCombined,

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
    repairingDocId, fetchDuplicateScan,
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
    fetchStaffList,

    // 20. Admin Edit ID
    adminEditModal, setAdminEditModal,

    // 21. Delete Day Report
    deleteDayModal, setDeleteDayModal,

    // 22. Edit Day Report
    editDayModal, setEditDayModal,

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
    medQueueProgress, selectedAttendanceDistricts,
    handleToggleAttendanceDistrict, handleSelectAllAttendanceDistricts,
    handleClearAttendanceDistricts, isDownloadingAttendance,
    handleDownloadAttendanceSingleOrScoped, handleDownloadStaffAttendanceQueue,
    attendanceQueueProgress, copyWhatsAppBulletin, liveWhatsAppBulletin,

    // Shared & Context
    districts, authFetch, getAdminToken, showToast
  };
}
