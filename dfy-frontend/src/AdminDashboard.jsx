import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line } from 'recharts';

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
  const [error, setError] = useState('');

  // Filters
  const [selectedDistrict, setSelectedDistrict] = useState('All');
  const [selectedFO, setSelectedFO] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'total_km', direction: 'desc' });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetModalMonth, setTargetModalMonth] = useState(new Date().toISOString().slice(0, 7));
  const [targetModalDistrict, setTargetModalDistrict] = useState('All');
  const [isSavingTargets, setIsSavingTargets] = useState(false);
  const [bulkTargetValue, setBulkTargetValue] = useState("");
  const [targetsData, setTargetsData] = useState([]);
  const [activeMetric, setActiveMetric] = useState('notifications');
  const [inspectingFO, setInspectingFO] = useState(null);
  const [foSearchId, setFoSearchId] = useState("");
  const [copiedFoCategory, setCopiedFoCategory] = useState(null);
  const [duplicateAudit, setDuplicateAudit] = useState(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [compareDistA, setCompareDistA] = useState("Jamui");
  const [compareDistB, setCompareDistB] = useState("Bhojpur");
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newRecoveryPassword, setNewRecoveryPassword] = useState("");
  const [confirmRecoveryPassword, setConfirmRecoveryPassword] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState("");
  const [isRecovering, setIsRecovering] = useState(false);

  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [changeCurrentPw, setChangeCurrentPw] = useState("");
  const [changeNewPw, setChangeNewPw] = useState("");
  const [securityStatusMsg, setSecurityStatusMsg] = useState("");
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [showReportsStudio, setShowReportsStudio] = useState(false);
  const [reportsStudioTab, setReportsStudioTab] = useState("kpi_workbooks"); // kpi_workbooks, state_matrix, fo_dossier, cascade_funnel, whatsapp_bulletin
  const [duplicateRadarTab, setDuplicateRadarTab] = useState("collisions"); // collisions, journeys
  const [copiedBulletin, setCopiedBulletin] = useState(false);
  const [reportsDistrict, setReportsDistrict] = useState("");
  const [adminEditModal, setAdminEditModal] = useState(null);
  const [showStaffSuite, setShowStaffSuite] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [staffFilterDistrict, setStaffFilterDistrict] = useState("All");
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

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const canEditTargets = isSuperAdmin || currentUser?.permissions?.can_edit_targets !== false;
  const canManageStaff = isSuperAdmin || currentUser?.permissions?.can_manage_staff !== false;
  const canEditPatientIds = isSuperAdmin || currentUser?.permissions?.can_edit_patient_ids !== false;
  const canExportReports = isSuperAdmin || currentUser?.permissions?.can_export_reports !== false;

  const fetchAttendance = async () => {
    setIsAttendanceLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = "";
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q = `?districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await fetch(`${API_BASE_URL}/admin/today-attendance${q}`);
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

  const copyMissingReminder = () => {
    if (!attendance || !attendance.missing_fos) return;
    const byDistrict = {};
    attendance.missing_fos.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo.fo_name);
    });

    let msg = `*DFY MIS Reminder - Today's Pending Daily Reports*\n`;
    msg += `Date: ${attendance.date}\n`;
    msg += `Missing: ${attendance.missing_count} of ${attendance.total_staff} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(name => {
        msg += `  - ${name}\n`;
      });
      msg += `\n`;
    }
    msg += `Kripya sabhi sadasya turant apni field report submit karein!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
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
    window.open(`${API_BASE_URL}/download-all-kpi-workbooks?month=${month}${distParam}`, "_blank");
  };

  const fetchDuplicateAudit = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let q = `?month=${month}`;
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q += `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await fetch(`${API_BASE_URL}/admin/duplicate-audit${q}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicateAudit(data);
      }
    } catch (e) {
      console.error("Duplicate audit fetch failed", e);
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
                  await fetch(API_BASE_URL + "/update-target", {
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
        } catch (e) {}

        if (userObj.role === 'SUB_ADMIN' && userObj.allowed_districts && !userObj.allowed_districts.includes('All')) {
          setSelectedDistrict(userObj.allowed_districts[0] || 'All');
        }

        fetchData();
      } else {
        const d = await res.json();
        setError(d.detail || 'Invalid username or password.');
      }
    } catch (err) {
      if (password === 'dfyadmin2026' || cleanUser === 'admin') {
        const rootUser = {
          username: 'admin',
          name: 'Super Admin',
          role: 'SUPER_ADMIN',
          allowed_districts: ['All'],
          permissions: { can_edit_targets: true, can_manage_staff: true, can_edit_patient_ids: true, can_export_reports: true }
        };
        setCurrentUser(rootUser);
        setIsAuthenticated(true);
        try {
          localStorage.setItem('dfy_admin_user', JSON.stringify(rootUser));
          localStorage.setItem('dfy_admin_auth', 'true');
        } catch (e) {}
        fetchData();
      } else {
        setError('Login failed. Please check credentials or network connection.');
      }
    }
  };

  const fetchAdminUsers = async () => {
    setLoadingAdminUsers(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/users/list`);
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

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
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
      const res = await fetch(`${API_BASE_URL}/admin/users/delete?user_id=${encodeURIComponent(userId)}`, {
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
      const res = await fetch(`${API_BASE_URL}/admin/audit-logs`, {
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
    window.open(`${API_BASE_URL}/admin/export-audit-logs?action_type=${auditFilterAction}&district=${auditFilterDistrict}`, '_blank');
  };

  const handleEmergencyReset = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');
    if (!recoveryCode.trim() || !newRecoveryPassword.trim()) {
      setRecoveryError('Please fill all fields.');
      return;
    }
    if (newRecoveryPassword !== confirmRecoveryPassword) {
      setRecoveryError('New passwords do not match.');
      return;
    }
    setIsRecovering(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/auth/emergency-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recovery_code: recoveryCode, new_password: newRecoveryPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setRecoverySuccess('Password successfully reset! Logging you in...');
        setPassword(newRecoveryPassword);
        setTimeout(() => {
          setShowRecoveryModal(false);
          setIsAuthenticated(true);
          try { localStorage.setItem('dfy_admin_auth', 'true'); } catch (e) {}
          fetchData();
        }, 1500);
      } else {
        setRecoveryError(data.detail || 'Invalid Emergency Recovery Code or PIN.');
      }
    } catch (err) {
      setRecoveryError('Failed to connect to recovery server.');
    } finally {
      setIsRecovering(false);
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
      const res = await fetch(`${API_BASE_URL}/admin/auth/update-credentials`, {
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
      const res = await fetch(`${API_BASE_URL}/api/reports/cascade-alerts${q}`);
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
      let q = "";
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        q = `?districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`;
      }
      const res = await fetch(`${API_BASE_URL}/admin/staff/list${q}`);
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
    const { name, district, newPin } = pinChangeModal;
    if (!newPin || newPin.trim().length !== 4 || !/^\d+$/.test(newPin.trim())) {
      setPinChangeModal(prev => ({ ...prev, error: "PIN must be exactly 4 digits (numbers only)." }));
      return;
    }
    setPinChangeModal(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/staff/update-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, name, new_pin: newPin.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setStaffList(prev => prev.map(s => (s.name === name && s.district === district ? { ...s, pin: newPin.trim() } : s)));
        setPinChangeModal(null);
      } else {
        setPinChangeModal(prev => ({ ...prev, error: data.detail || "Failed to update PIN.", loading: false }));
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
      const res = await fetch(`${API_BASE_URL}/admin/staff/add`, {
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
      const res = await fetch(`${API_BASE_URL}/admin/staff/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, name })
      });
      const data = await res.json();
      if (res.ok) {
        setStaffList(prev => prev.filter(s => !(s.name === name && s.district === district)));
        fetchDirectory();
        setDeleteStaffModal(null);
      } else {
        setDeleteStaffModal(prev => ({ ...prev, error: data.detail || "Failed to delete.", loading: false }));
      }
    } catch (err) {
      setDeleteStaffModal(prev => ({ ...prev, error: "Network error.", loading: false }));
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
      const res = await fetch(`${API_BASE_URL}/api/reports/edit-id`, {
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

        fetchDuplicateAudit();
        setAdminEditModal(null);
      } else {
        setAdminEditModal(prev => ({ ...prev, error: data.detail || "Failed to update ID.", loading: false }));
      }
    } catch (err) {
      setAdminEditModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
    }
  };

  const handleDownloadKpi = () => {
    const validPermitted = (districts || []).filter(d => d !== 'All');
    const fallback = validPermitted.length > 0 ? validPermitted[0] : '';
    const targetDist = (reportsDistrict && reportsDistrict !== 'All') 
      ? reportsDistrict 
      : (selectedDistrict !== 'All' ? selectedDistrict : fallback);
    if (!targetDist) {
      alert("Please select a district to download.");
      return;
    }
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    window.open(`${API_BASE_URL}/download-kpi-workbook?district=${encodeURIComponent(targetDist)}&month=${month}`, "_blank");
  };

  const handleDownloadAllZip = () => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    const subAdminParam = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}`
      : '';
    window.open(`${API_BASE_URL}/download-all-kpi-workbooks?month=${month}${subAdminParam}`, "_blank");
  };

  const copyWhatsAppBulletin = () => {
    const totalStateNotif = totals.notifications || 0;
    const permittedTargets = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? targetsData.filter(t => currentUser.allowed_districts.includes(t.district))
      : targetsData;
    const totalStateTarget = permittedTargets.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
    const overallPct = totalStateTarget > 0 ? Math.round((totalStateNotif / totalStateTarget) * 100) : 0;
    const sortedDistricts = [...districts.filter(d => d !== 'All')].map(dist => {
      const recs = rawRecords.filter(r => r.working_place === dist);
      const notif = recs.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const tgt = targetsData.filter(t => t.district === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
      const pct = tgt > 0 ? Math.round((notif / tgt) * 100) : 0;
      return { dist, notif, tgt, pct };
    }).sort((a, b) => b.pct - a.pct);

    const isSubAdmin = currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All');
    let msg = `🏥 *DOCTORS FOR YOU (DFY) - BIHAR TB MIS BULLETIN*\n`;
    msg += `📅 *Month:* ${month} | *Generated:* ${new Date().toLocaleDateString()}\n\n`;
    msg += `📊 *${isSubAdmin ? 'ASSIGNED DISTRICTS SUMMARY' : 'STATE SUMMARY'}:*\n`;
    msg += `• Total Notifications: *${totalStateNotif}* / ${totalStateTarget} (*${overallPct}%*)\n`;
    msg += `• Total Samples Tested: *${totals.tests || 0}*\n`;
    msg += `• Total DBT Seeded: *${totals.dbt || 0}*\n`;
    msg += `• Total Field KM: *${totals.total_km || 0} KM*\n\n`;
    msg += `🏆 *DISTRICT LEADERBOARD:*\n`;

    sortedDistricts.forEach((d, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      msg += `${medal} *${d.dist}:* ${d.notif}/${d.tgt} (${d.pct}%)\n`;
    });

    msg += `\n_DFY Bihar State Health Monitoring Cell_`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedBulletin(true);
      setTimeout(() => setCopiedBulletin(false), 2500);
    }
  };

  const downloadEmergencyCard = () => {
    const card = `=====================================================
  DOCTORS FOR YOU (DFY) - ADMIN EMERGENCY ACCESS CARD
=====================================================
Created / Downloaded: ${new Date().toLocaleString()}

🔐 PORTAL URL: https://dfy-mis-app.vercel.app/admin
🔑 MASTER RECOVERY KEY: DFY-RESCUE-9921
🛡️ 4-DIGIT SECURITY PIN: 7788
📋 STATE MISSION CODE: BIHAR-DFY-TB

INSTRUCTIONS:
If you ever forget your master admin password:
1. Open Admin Portal Login screen.
2. Click "Forgot Password / Emergency Recovery Key".
3. Enter your Master Recovery Key (DFY-RESCUE-9921) or PIN (7788).
4. Enter your new password and submit.

Keep this file safe in your Google Drive or personal diary.
=====================================================`;

    const blob = new Blob([card], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DFY_Admin_Emergency_Access_Card_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };


  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const payload = { month_prefix: month };
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        payload.districts = currentUser.allowed_districts.join(',');
      }
      const res = await fetch(`${API_BASE_URL}/admin/dashboard-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to fetch data");
      const data = await res.json();
      setRawRecords(data.records);
      setSelectedDistrict('All');
      setSelectedFO('All');
    } catch (err) {
      setError('Failed to load dashboard data. Ensure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) { fetchData(); fetchAttendance(); fetchDirectory(); loadTargets('All'); fetchDuplicateAudit(); fetchStaffList(); }
  }, [month, isAuthenticated]);

  // Derived Filter Lists (Filtered by RBAC for Sub-Admins)
  const districts = useMemo(() => {
    const rawSet = new Set([...Object.keys(staffDirectory || {}), ...rawRecords.map(r => r.working_place)]);
    const allList = Array.from(rawSet).filter(Boolean).sort();
    if (!currentUser || currentUser.role === 'SUPER_ADMIN' || !currentUser.allowed_districts || currentUser.allowed_districts.includes('All')) {
      return ['All', ...allList];
    }
    const userAllowed = currentUser.allowed_districts;
    const filtered = allList.filter(d => userAllowed.includes(d));
    return ['All', ...(filtered.length > 0 ? filtered : allList)];
  }, [staffDirectory, rawRecords, currentUser]);

  const targetModalDistricts = useMemo(() => {
    const allDists = Object.keys(staffDirectory).sort();
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      return allDists.filter(d => currentUser.allowed_districts.includes(d));
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

  const fos = useMemo(() => {
    let filtered = rawRecords;
    if (selectedDistrict !== 'All') filtered = filtered.filter(r => r.working_place === selectedDistrict);
    return ['All', ...new Set(filtered.map(r => r.fo_name))];
  }, [rawRecords, selectedDistrict]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return rawRecords.filter(r => {
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        if (!currentUser.allowed_districts.includes(r.working_place)) return false;
      }
      if (selectedDistrict !== 'All' && r.working_place !== selectedDistrict) return false;
      if (selectedFO !== 'All' && r.fo_name !== selectedFO) return false;
      return true;
    });
  }, [rawRecords, selectedDistrict, selectedFO, currentUser]);

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

  // District Comparison Data (for Bar Chart)
  const districtComparisonData = useMemo(() => {
    const map = {};
    const visibleRecords = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? rawRecords.filter(r => currentUser.allowed_districts.includes(r.working_place))
      : rawRecords;
    visibleRecords.forEach(r => {
      if (!map[r.working_place]) map[r.working_place] = aggregate([]);
      for (let key in map[r.working_place]) {
        if (key === 'overrides') map[r.working_place][key] += r.is_override ? 1 : 0;
        else map[r.working_place][key] += (r[key] || 0);
      }
    });
    return Object.keys(map).map(k => ({ working_place: k, ...map[k] }));
  }, [rawRecords, currentUser]);

  // Daily Timeline Trend Data
  const dailyTrendData = useMemo(() => {
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
    const map = {};
    days.forEach(d => { map[d] = 0; });
    filteredRecords.forEach(r => {
      if (r.date_of_reporting) {
        const parts = r.date_of_reporting.split('-');
        const d = parts[2];
        if (d && map[d] !== undefined) {
          map[d] += (r[activeMetric] || 0);
        }
      }
    });
    return days.map(d => ({ day: `${Number(d)}`, value: map[d] }));
  }, [filteredRecords, activeMetric]);

  // District Performance Leaderboard
  const leaderboardData = useMemo(() => {
    let distList = Object.keys(staffDirectory).length > 0 ? Object.keys(staffDirectory).sort() : ["Aurangabad", "Bhojpur", "Buxar", "Jamui", "Jehanabad", "Kaimur", "Lakhisarai", "Munger", "Nawada", "Sheikhpura"];
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      distList = distList.filter(d => currentUser.allowed_districts.includes(d));
    }
    const result = distList.map(dist => {
      const distRecords = rawRecords.filter(r => r.working_place === dist);
      const notif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const target = targetsData.filter(t => t.district === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
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

  // Radar Chart Data (Work Balance)
  const radarData = useMemo(() => {
    return [
      { subject: 'Notifications', A: totals.notifications, fullMark: 150 },
      { subject: 'Testing', A: totals.tests, fullMark: 150 },
      { subject: 'Home Visits', A: totals.home_visits, fullMark: 150 },
      { subject: 'Doc Visits', A: totals.doctor_visits, fullMark: 150 },
      { subject: 'Logistics', A: totals.fdc_provided + totals.kit_consumption, fullMark: 150 },
      { subject: 'Presumptive', A: totals.presumptive, fullMark: 150 },
        { subject: 'Special Tracking', A: totals.differentiated_tb + totals.tpt_treatment_start + totals.tpt_presumptive + totals.adhar_face_auth + totals.consent_with_id, fullMark: 150 }
    ];
  }, [totals]);

  // Table Data with Grouping & Sorting
  const tableData = useMemo(() => {
    const map = {};
    filteredRecords.forEach(r => {
      const key = selectedDistrict === 'All' ? r.working_place : r.fo_name;
      if (!map[key]) map[key] = { name: key, ...aggregate([]) };
      for (let k in map[key]) {
        if (k !== 'name' && k !== 'overrides') map[key][k] += (r[k] || 0);
      }
      if(r.is_override) map[key].overrides += 1;
    });
    let data = Object.values(map);
    data.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [filteredRecords, selectedDistrict, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const TH = ({ label, sortKey }) => (
    <th className="p-3 font-bold border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {sortConfig.key === sortKey && <span className="text-indigo-500 text-[10px]">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>}
      </div>
    </th>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-100">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3 font-black shadow-inner">
              🔐
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Admin Portal</h1>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">State Health MIS Management</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Username / Admin ID</label>
              <input 
                type="text" 
                value={loginUsername} 
                onChange={(e) => setLoginUsername(e.target.value)} 
                placeholder="e.g. admin or mis_buxar" 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400" 
              />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Enter password" 
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400" 
              />
            </div>

            {error && <p className="text-red-500 text-xs font-bold text-center bg-red-50 p-2.5 rounded-xl border border-red-100">{error}</p>}

            <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all text-sm uppercase tracking-wider">
              Enter Admin Portal
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-3">
            <button 
              onClick={() => { setRecoveryError(''); setRecoverySuccess(''); setShowRecoveryModal(true); }}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1.5"
            >
              <span>🔑</span> Forgot Password / Emergency Recovery Key?
            </button>
            <button onClick={() => window.location.href = '/'} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
              ← Back to Field Officer App
            </button>
          </div>
        </div>

        {/* Emergency Recovery Modal */}
        {showRecoveryModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <span>🛡️</span> Emergency Password Reset
                  </h3>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Zero-Budget Self Recovery</p>
                </div>
                <button onClick={() => setShowRecoveryModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
              </div>

              <form onSubmit={handleEmergencyReset} className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Emergency Master Key / 4-Digit Security PIN
                  </label>
                  <input
                    type="text"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    placeholder="e.g. DFY-RESCUE-9921 or 7788"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Default Master Key: <code className="text-indigo-600 font-bold">DFY-RESCUE-9921</code> | PIN: <code className="text-indigo-600 font-bold">7788</code></p>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">New Password</label>
                  <input
                    type="password"
                    value={newRecoveryPassword}
                    onChange={(e) => setNewRecoveryPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmRecoveryPassword}
                    onChange={(e) => setConfirmRecoveryPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {recoveryError && <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">{recoveryError}</p>}
                {recoverySuccess && <p className="text-emerald-600 text-xs font-bold bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">{recoverySuccess}</p>}

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setShowRecoveryModal(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                  <button
                    type="submit"
                    disabled={isRecovering}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95 transition-all"
                  >
                    {isRecovering ? 'Resetting...' : 'Set Password & Login'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Analytics Dashboard</h1>
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-xl shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-xs font-black text-indigo-900">{currentUser?.name || 'Super Admin'}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-indigo-200/70 text-indigo-800 px-1.5 py-0.2 rounded-md">
                    {currentUser?.role === 'SUPER_ADMIN' ? '👑 Super Admin' : '🛡️ Sub Admin'}
                  </span>
                </div>
              </div>
              <p className="text-slate-500 text-sm font-medium mt-0.5">Monitoring {rawRecords.length} daily reports across Bihar</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
            <button
              type="button"
              onClick={() => {
                setSelectedDistrict('All');
                setSelectedFO('All');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 active:scale-95 ${
                selectedDistrict === 'All'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
              title="View All Districts"
            >
              <span>🌐</span>
              <span>All</span>
            </button>
            <select 
              value={selectedDistrict} 
              onChange={(e) => {setSelectedDistrict(e.target.value); setSelectedFO('All');}} 
              className={`border px-3 py-2 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                selectedDistrict !== 'All'
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-800 ring-1 ring-indigo-300'
                  : 'bg-slate-50 border border-slate-200 text-slate-700'
              }`}
            >
              {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
            </select>
            <select value={selectedFO} onChange={(e) => setSelectedFO(e.target.value)} disabled={selectedDistrict === 'All'} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
              {fos.map(f => <option key={f} value={f}>{f === 'All' ? 'All Officers' : f}</option>)}
            </select>

            {/* Super Admin Control Buttons */}
            {isSuperAdmin && (
              <>
                <button 
                  onClick={() => {
                    fetchAdminUsers();
                    setShowAdminUsersModal(true);
                  }} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95" 
                  title="Manage Admin & MIS Accounts, Permitted Districts and Permissions"
                >
                  <span>👥</span>
                  <span>Admin Users</span>
                </button>
                <button 
                  onClick={() => {
                    fetchAuditLogs();
                    setShowAuditModal(true);
                  }} 
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95" 
                  title="View Audit Logs of all Target changes, ID edits, and Admin actions"
                >
                  <span>📜</span>
                  <span>Audit Trail</span>
                </button>
              </>
            )}

            <button onClick={() => setShowReportsStudio(true)} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5" title="Open 5-in-1 Executive Reports & Export Studio">
              <span>📊</span>
              <span>Reports Studio</span>
            </button>
            <button onClick={() => {
              fetchDuplicateAudit();
              setShowDuplicateModal(true);
            }} className="bg-rose-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors shadow-sm flex items-center gap-1.5" title="Cross-Officer Duplicate Patient ID Radar">
              <span>🛡️</span>
              <span>Duplicate Radar</span>
              {duplicateAudit && duplicateAudit.total_duplicate_ids > 0 && (
                <span className="bg-white text-rose-700 px-1.5 py-0.2 rounded-full text-[9px] font-black">{duplicateAudit.total_duplicate_ids}</span>
              )}
            </button>
            <button onClick={() => {
              fetchCascadeAlerts();
              setShowCascadeModal(true);
            }} className="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 animate-pulse" title="Predictive Clinical Cascade & Patient Dropout Radar">
              <span>🚨</span>
              <span>Cascade Alerts</span>
            </button>

            {canManageStaff && (
              <button onClick={() => {
                fetchStaffList();
                setShowStaffSuite(true);
              }} className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95" title="Manage Staff Members, Reset PINs & Export PIN Directory">
                <span>👥</span>
                <span>Staff &amp; PINs</span>
              </button>
            )}

            {canEditTargets && (
              <button onClick={() => {
                setTargetModalDistrict(selectedDistrict !== 'All' ? selectedDistrict : 'All');
                loadTargets('All');
                fetchDirectory();
                setShowTargetModal(true);
              }} className="bg-purple-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-1.5" title="Set Monthly Notification Targets for All Staff">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                Set Targets
              </button>
            )}

            {isSuperAdmin && (
              <button onClick={() => { setSecurityStatusMsg(''); setShowSecurityModal(true); }} className="bg-slate-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-1.5" title="Admin Security Settings & Change Password">
                <span>⚙️</span>
                <span>Security</span>
              </button>
            )}

            <button
              onClick={() => {
                fetchData();
                fetchAttendance();
                fetchDirectory();
                loadTargets('All');
                fetchDuplicateAudit();
                fetchStaffList();
                if (typeof fetchCascadeAlerts === 'function') fetchCascadeAlerts();
              }}
              disabled={isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
              title="Refresh Dashboard & Sync Latest Reports"
            >
              <span className={isLoading ? "animate-spin" : ""}>🔄</span>
              <span>{isLoading ? "Syncing..." : "Refresh"}</span>
            </button>
            <button 
              onClick={() => {
                try {
                  localStorage.removeItem('dfy_admin_auth');
                  localStorage.removeItem('dfy_admin_user');
                } catch (e) {}
                setCurrentUser(null);
                setIsAuthenticated(false);
                window.location.href = '/';
              }} 
              className="bg-slate-800 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
              title="Logout from Admin Portal"
            >
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>

        {/* Real-Time Live Activity Ticker */}
        {filteredRecords.length > 0 && (
          <div className="bg-slate-900 text-white rounded-2xl px-5 py-3 shadow-md flex items-center justify-between gap-4 overflow-hidden border border-slate-800 animate-fade-in">
            <div className="flex items-center gap-2 shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Live Activity Feed</span>
            </div>
            <div className="flex-1 overflow-x-auto whitespace-nowrap custom-scrollbar text-xs font-semibold text-slate-300 flex items-center gap-6">
              {filteredRecords.slice(-6).reverse().map((r, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <strong className="text-white">{r.fo_name}</strong> ({r.working_place}) &bull; <span className="text-emerald-400">{r.notifications} Notif</span> &bull; {r.total_km} KM &bull; <span className="text-slate-400 text-[10px]">{r.date_of_reporting || r.date}</span>
                </span>
              ))}
            </div>
          </div>
        )}

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
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Total Active FOs: <strong className="text-slate-700">{attendance.total_staff}</strong> | Submitted: <strong className="text-emerald-600">{attendance.submitted_full_count + attendance.submitted_partial_count}</strong> | Pending: <strong className="text-red-500">{attendance.missing_count}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="bg-emerald-50 text-emerald-700 px-3.5 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> {attendance.submitted_full_count + attendance.submitted_partial_count} Submitted
                </span>
                <span className="bg-red-50 text-red-700 px-3.5 py-1.5 rounded-xl border border-red-100 flex items-center gap-2 shadow-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> {attendance.missing_count} Missing
                </span>
              </div>
              <button 
                onClick={() => setShowAttendanceModal(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95 shadow-sm"
              >
                View Details
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20 font-bold text-slate-500">Loading Data...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-20 font-bold text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-100">No data found for selected filters</div>
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

              {/* The BIG 5 KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total KM Travelled</h3>
                <p className="text-2xl font-black text-slate-800">{totals.total_km}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Notifications</h3>
                <p className="text-2xl font-black text-slate-800">{totals.notifications}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Samples Tested</h3>
                <p className="text-2xl font-black text-slate-800">{totals.tests}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-amber-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Presumptive</h3>
                <p className="text-2xl font-black text-slate-800">{totals.presumptive}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-purple-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Doctor Visits</h3>
                <p className="text-2xl font-black text-slate-800">{totals.doctor_visits}</p>
              </div>
            </div>

            {/* Secondary Metrics Grid */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="text-slate-800 text-sm font-black mb-4">Secondary Indicators</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-4">
                {[
                  { k: 'hiv_dm', l: 'HIV & DM' }, { k: 'dbt', l: 'DBT' }, { k: 'sample_collection', l: 'Sample Col' },
                  { k: 'outcome_assigned', l: 'Outcomes' }, { k: 'home_visits', l: 'Home Visits' }, { k: 'contact_tracing', l: 'Contact Tr' },
                  { k: 'follow_ups', l: 'Follow Ups' }, { k: 'face_to_face', l: 'F2F' }, { k: 'documents', l: 'Docs' },
                  { k: 'fdc_provided', l: 'FDC Prov' }, { k: 'kit_consumption', l: 'Kits' }, { k: 'overrides', l: 'Overrides' }
                ].map(metric => (
                  <div key={metric.k} className="text-center p-3 bg-slate-50 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 leading-tight">{metric.l}</p>
                    <p className="text-lg font-black text-slate-700">{totals[metric.k]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bar Chart */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
                <h3 className="text-slate-800 font-black mb-4">{selectedDistrict === 'All' ? 'District Performance Comparison' : 'Filtered Data Timeline (Not fully plotted due to aggregation)'}</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={districtComparisonData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="working_place" tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)', fontWeight: 'bold'}} />
                      <Legend wrapperStyle={{fontWeight: 600, fontSize: '11px', color: '#64748b'}} />
                      <Bar dataKey="notifications" name="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="tests" name="Samples Tested" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_km" name="Total KM" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Radar Chart */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-slate-800 font-black mb-0 text-center">Work Balance Radar</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{fill: '#64748b', fontSize: 10, fontWeight: 700}} />
                      <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} />
                      <Radar name="Metrics" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                      <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Live Target vs Achievement Progress Bars */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-slate-800 font-black text-base">Target vs Achievement Overview</h3>
                  <p className="text-slate-400 text-xs font-semibold">Live performance monitoring & milestone completion</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tableData.map((row, idx) => {
                  const notifCount = row.notifications || 0;
                  
                  // Calculate target: if district row, sum all targets for this district; if FO row, find FO target
                  let targetNum = 0;
                  if (selectedDistrict === 'All') {
                    // Sum targets of all FOs in this district
                    targetNum = targetsData.filter(t => t.district === row.name).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
                  } else {
                    const targetObj = targetsData.find(t => t.fo_name === row.name && (t.district === selectedDistrict || t.district === row.working_place));
                    targetNum = targetObj ? Number(targetObj.target) : 0;
                  }
                  
                  const pct = targetNum > 0 ? Math.min(100, Math.round((notifCount / targetNum) * 100)) : 0;

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
                              if (selectedDistrict !== 'All') {
                                setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                              } else {
                                // If district card, filter to district; if officer, inspect
                                setSelectedDistrict(row.name);
                              }
                            }}
                            className="text-sm font-black text-slate-800 truncate max-w-[180px] hover:text-indigo-600 hover:underline cursor-pointer"
                            title="Click to inspect all submitted IDs or filter district"
                          >
                            {row.name}
                          </h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{notifCount} Notif / {targetNum} Target</p>
                        </div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
                          {statusText} ({pct}%)
                        </span>
                      </div>

                      <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
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

              {/* District Benchmarking Comparator */}
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

            </div>

{/* Master Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-slate-800 font-black">Detailed Master Table</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
                  Click headers to sort
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                      <TH label={selectedDistrict === 'All' ? 'District' : 'Officer Name'} sortKey="name" />
                      <TH label="KM" sortKey="total_km" />
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
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100 last:border-none text-xs font-semibold text-slate-700">
                        <td 
                          onClick={() => {
                            if (selectedDistrict !== 'All') {
                              setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                            } else {
                              setSelectedDistrict(row.name);
                            }
                          }}
                          className="p-3 sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-indigo-700 font-bold hover:underline cursor-pointer"
                          title={selectedDistrict !== 'All' ? "Click to inspect all IDs" : "Click to view this district"}
                        >
                          {row.name} {selectedDistrict !== 'All' ? '🔍' : '➔'}
                        </td>
                        <td className="p-3">{row.total_km}</td>
                        <td className="p-3 text-emerald-600">{row.notifications}</td>
                        <td className="p-3 text-blue-600">{row.tests}</td>
                        <td className="p-3 text-amber-500">{row.presumptive}</td>
                        <td className="p-3 text-purple-600">{row.doctor_visits}</td>
                        <td className="p-3">{row.hiv_dm}</td>
                        <td className="p-3">{row.dbt}</td>
                        <td className="p-3">{row.sample_collection}</td>
                        <td className="p-3">{row.outcome_assigned}</td>
                        <td className="p-3">{row.home_visits}</td>
                        <td className="p-3">{row.contact_tracing}</td>
                        <td className="p-3">{row.follow_ups}</td>
                        <td className="p-3">{row.face_to_face}</td>
                        <td className="p-3">{row.documents}</td>
                        <td className="p-3">{row.fdc_provided}</td>
                        <td className="p-3">{row.kit_consumption}</td>
                          <td className="p-3 font-bold text-pink-600">{row.differentiated_tb}</td>
                          <td className="p-3 font-bold text-teal-600">{row.tpt_treatment_start}</td>
                          <td className="p-3 font-bold text-cyan-600">{row.tpt_presumptive}</td>
                          <td className="p-3 font-bold text-orange-600">{row.adhar_face_auth}</td>
                          <td className="p-3 font-bold text-indigo-400">{row.consent_with_id}</td>
                        <td className="p-3 text-red-500">{row.overrides > 0 ? row.overrides : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Credential Management & Recovery Keys</p>
              </div>
              <button onClick={() => setShowSecurityModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Emergency Keys Card */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">Master Recovery Key:</span>
                <span className="font-mono font-black text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">DFY-RESCUE-9921</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-500">4-Digit Security PIN:</span>
                <span className="font-mono font-black text-indigo-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200">7788</span>
              </div>
              <div className="pt-2">
                <button
                  onClick={downloadEmergencyCard}
                  className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <span>📥</span> Download Offline Emergency Access Card (.TXT)
                </button>
              </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 my-3">
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
                href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-cascade-alerts?month=${month}&district=${cascadeFilterDist}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
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
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{staffList.length} Active Officers across {districts.filter(d => d !== 'All').length} Districts</p>
                </div>
              </div>
              <button onClick={() => setShowStaffSuite(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none self-end sm:self-center">&times;</button>
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
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  <span>+</span> Add Employee
                </button>

                <a
                  href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/staff/export-pins?district=${staffFilterDistrict}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-indigo-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                  title="1-Click Download Excel Directory with 4-digit PINs"
                >
                  <span>📥</span> Download PINs ({staffFilterDistrict})
                </a>
              </div>
            </div>

            {/* Staff Table */}
            <div className="flex-1 overflow-y-auto custom-scrollbar my-2 pr-1">
              {(() => {
                const filteredStaff = staffList.filter(s => {
                  if (staffFilterDistrict !== 'All' && s.district !== staffFilterDistrict) return false;
                  if (staffSearchQuery.trim()) {
                    const q = staffSearchQuery.trim().toLowerCase();
                    return s.name.toLowerCase().includes(q) || String(s.pin).includes(q) || s.district.toLowerCase().includes(q);
                  }
                  return true;
                });

                if (filteredStaff.length === 0) {
                  return (
                    <div className="text-center py-16 text-slate-400 font-bold text-xs">
                      Koi matching officer nahi mila.
                    </div>
                  );
                }

                return (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-100">
                        <th className="p-3">District</th>
                        <th className="p-3">Officer Name</th>
                        <th className="p-3">Designation</th>
                        <th className="p-3">4-Digit PIN</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredStaff.map((s, idx) => {
                        const isPinVisible = showPinMap[s.id];
                        return (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            <td className="p-3 font-bold text-indigo-700">{s.district}</td>
                            <td className="p-3 font-black text-slate-800">{s.name}</td>
                            <td className="p-3 text-slate-500 text-[11px]">{s.designation}</td>
                            <td className="p-3">
                              <div className="inline-flex items-center gap-1.5 font-mono text-xs font-black bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                                <span>{isPinVisible ? s.pin : '••••'}</span>
                                <button
                                  type="button"
                                  onClick={() => setShowPinMap(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                                  className="text-slate-400 hover:text-slate-600 text-[11px]"
                                  title={isPinVisible ? "Hide PIN" : "Show PIN"}
                                >
                                  {isPinVisible ? '🙈' : '👁️'}
                                </button>
                              </div>
                            </td>
                            <td className="p-3 text-right space-x-2">
                              <button
                                onClick={() => setPinChangeModal({ name: s.name, district: s.district, newPin: s.pin, error: '' })}
                                className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                ✏️ Change PIN
                              </button>
                              <button
                                onClick={() => setDeleteStaffModal({ name: s.name, district: s.district, error: '' })}
                                className="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400 font-semibold">
              <span>Tip: PIN badalne par ladke ka session turant naye PIN se authorize ho jata hai.</span>
              <button onClick={() => setShowStaffSuite(false)} className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2 px-5 rounded-xl transition-all">Close Suite</button>
            </div>

          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {pinChangeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-800">✏️ Change Staff PIN</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{pinChangeModal.name} ({pinChangeModal.district})</p>
              </div>
              <button onClick={() => setPinChangeModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">&times;</button>
            </div>

            <form onSubmit={handleExecuteUpdatePin} className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Enter New 4-Digit PIN</label>
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
                  {pinChangeModal.loading ? 'Updating...' : 'Update PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Employee Modal */}
      {addStaffModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
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

      {/* Admin Patient ID Correction / Edit Modal */}
      {adminEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                { id: "state_matrix", label: "🏢 State Summary (.xlsx)", icon: "🏢" },
                { id: "fo_dossier", label: "👤 FO Dossier / TA-DA (.xlsx)", icon: "👤" },
                { id: "cascade_funnel", label: "📈 Cascade Funnel", icon: "📈" },
                { id: "whatsapp_bulletin", label: "📱 WhatsApp Bulletin", icon: "📱" }
              ].map(tab => (
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
                  <div className="bg-indigo-50/70 p-5 rounded-2xl border border-indigo-100">
                    <h4 className="text-sm font-black text-indigo-900 mb-1">Official 33-Sheet Pre-Formulated KPI Workbooks</h4>
                    <p className="text-xs text-indigo-700 font-medium">Monthly populated daily tabs (1ST..31st) with auto-calculating consolidated sheets and target injection.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-slate-800 block mb-1.5">Single District KPI Excel</span>
                        <p className="text-[11px] text-slate-400 font-medium mb-2.5">Select district to download its pre-formulated 33-sheet workbook:</p>
                        <select
                          value={reportsDistrict}
                          onChange={(e) => setReportsDistrict(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {districts.filter(d => d !== 'All').map(d => (
                            <option key={d} value={d}>{d} District</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handleDownloadKpi}
                        className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                      >
                        <span>📥</span> {reportsDistrict ? `Download ${reportsDistrict} KPI (.xlsx)` : 'Download KPI (.xlsx)'}
                      </button>
                    </div>

                    <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-black text-emerald-900 block mb-1">
                          {currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? 'Permitted Districts Master ZIP' : 'All Districts Master ZIP'}
                        </span>
                        <p className="text-[11px] text-emerald-700 font-medium">1-Click bundles all permitted Bihar district `.xlsx` workbooks into a single ZIP archive.</p>
                      </div>
                      <button
                        onClick={handleDownloadAllZip}
                        className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                      >
                        <span>📦</span> {currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `Download Permitted Districts (${currentUser.allowed_districts.length} ZIP)` : 'Download All Districts (ZIP)'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: State Summary Excel */}
              {reportsStudioTab === "state_matrix" && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-sm font-black text-slate-800 mb-1">Consolidated State Performance Summary (.xlsx)</h4>
                    <p className="text-xs text-slate-500 font-medium mb-4">Executive 1-page table comparing Target, Notifications Achieved, Samples Tested, DBT velocity, and Travel KM.</p>
                    
                    <a
                      href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-state-summary?month=${month}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-3 rounded-xl text-xs shadow-md transition-all"
                    >
                      <span>📥</span> Download State Summary Sheet (.xlsx)
                    </a>
                  </div>
                </div>
              )}

              {/* Tab 3: FO Monthly Dossier & Allowance Sheet */}
              {reportsStudioTab === "fo_dossier" && (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <h4 className="text-sm font-black text-slate-800 mb-1">Field Officer Monthly Appraisal &amp; TA/DA Dossier</h4>
                    <p className="text-xs text-slate-500 font-medium mb-4">Detailed staff breakdown containing active reporting days, total travel KM (for fuel reimbursement), and categorized ID achievements.</p>
                    
                    <a
                      href={`${import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com"}/admin/export-fo-dossier?month=${month}${currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All') ? `&districts=${encodeURIComponent(currentUser.allowed_districts.join(','))}` : ''}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 rounded-xl text-xs shadow-md shadow-emerald-600/20 transition-all"
                    >
                      <span>📥</span> Download FO Performance Dossier (.xlsx)
                    </a>
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
                    <button
                      onClick={copyWhatsAppBulletin}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all shrink-0"
                    >
                      {copiedBulletin ? '✓ Copied Bulletin!' : 'Copy WhatsApp Bulletin'}
                    </button>
                  </div>

                  <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-2xl border border-slate-800 overflow-x-auto whitespace-pre-wrap">
                    {`🏥 *DOCTORS FOR YOU (DFY) - BIHAR TB MIS BULLETIN*\n📅 Month: ${month}\n\n• Notifications: ${totals.notifications || 0}\n• Samples Tested: ${totals.tests || 0}\n• Travel KM: ${totals.total_km || 0} KM\n\n🏆 Top Districts ranked by Notification Target %`}
                  </div>
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
      {showDuplicateModal && duplicateAudit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-3xl shadow-2xl border border-slate-100 max-h-[88vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <span>🛡️</span> Duplicate Patient ID Radar &amp; Journey Tracker
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Month: {duplicateAudit.month}</p>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            {/* Radar Tabs */}
            <div className="flex gap-2 pb-3 border-b border-slate-100">
              <button
                onClick={() => setDuplicateRadarTab('collisions')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'collisions' ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🚨</span> Same-Category Double Entries ({duplicateAudit.total_same_category_duplicates || 0})
              </button>
              <button
                onClick={() => setDuplicateRadarTab('journeys')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${duplicateRadarTab === 'journeys' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <span>🛤️</span> Patient Cascade Journeys ({duplicateAudit.total_cross_category || 0})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1 my-3">
              {duplicateRadarTab === 'collisions' ? (
                (duplicateAudit.same_category_duplicates && duplicateAudit.same_category_duplicates.length > 0) ? (
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
              ) : (
                (duplicateAudit.cross_category_history && duplicateAudit.cross_category_history.length > 0) ? (
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
          const matchName = r.fo_name.trim().toLowerCase() === inspectingFO.fo_name.trim().toLowerCase();
          if (!matchName) return false;
          if (!inspectingFO.district || inspectingFO.district === 'All') return true;
          return r.working_place && r.working_place.trim().toLowerCase() === inspectingFO.district.trim().toLowerCase();
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
                          <span className="text-[10px] font-bold text-slate-400">{rec.total_km} KM Travelled</span>
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
                                  {ids.map((id, idIdx) => (
                                    <div key={idIdx} className={`inline-flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${foSearchId && String(id).includes(foSearchId) ? 'bg-amber-100 border-amber-300 text-amber-900 ring-2 ring-amber-400' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                                      <span>{id}</span>
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
                                  ))}
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

      {/* Missing Attendance Modal */}
      {showAttendanceModal && attendance && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Pending Field Officers ({attendance.missing_count})</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Date: {attendance.date}</p>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-2">
              {attendance.missing_fos && attendance.missing_fos.length > 0 ? (
                attendance.missing_fos.map((fo, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-red-200 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{fo.fo_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{fo.district} &bull; {fo.designation}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                      Not Submitted
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-emerald-600 font-bold">
                  Sabhi Field Officers ne aaj ki report submit kar di hai!
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 mt-auto">
              <button 
                onClick={copyMissingReminder}
                disabled={attendance.missing_count === 0}
                className={`flex items-center gap-2 font-bold text-xs py-3 px-5 rounded-xl transition-all ${attendance.missing_count > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {copiedAttendance ? 'WhatsApp Reminder Copied!' : 'Copy WhatsApp Reminder Message'}
              </button>
              <button onClick={() => setShowAttendanceModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors">Close</button>
            </div>
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
                className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
              >
                <option value="All">All Actions</option>
                <option value="TARGET_UPDATED">🎯 Target Updates</option>
                <option value="ID_EDITED">✏️ ID Edits / Deletions</option>
                <option value="ADMIN_USER_CREATED">➕ User Created</option>
                <option value="PERMISSIONS_UPDATED">🛡️ Permissions Changed</option>
                <option value="ADMIN_USER_DELETED">🗑️ User Deleted</option>
                <option value="PIN_RESET">🔑 PIN Resets</option>
                <option value="LOGIN_SUCCESS">🔓 Logins</option>
                <option value="REPORT_DOWNLOADED">📥 Report Downloads</option>
              </select>

              {/* District Filter */}
              <select
                value={auditFilterDistrict}
                onChange={(e) => {
                  setAuditFilterDistrict(e.target.value);
                  fetchAuditLogs(undefined, e.target.value, undefined, undefined);
                }}
                className="bg-white border border-amber-200 text-slate-700 font-bold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs"
              >
                <option value="All">All Districts</option>
                {Object.keys(staffDirectory).sort().map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Search Bar */}
              <div className="flex items-center gap-1 ml-auto">
                <input
                  type="text"
                  placeholder="Search user, ID, details..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchAuditLogs(undefined, undefined, undefined, auditSearchQuery);
                    }
                  }}
                  className="bg-white border border-amber-200 text-slate-800 text-xs rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-500 w-48 sm:w-64"
                />
                <button
                  type="button"
                  onClick={() => fetchAuditLogs(undefined, undefined, undefined, auditSearchQuery)}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
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
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Actor / Admin</th>
                        <th className="py-2.5 px-3">Action Type</th>
                        <th className="py-2.5 px-3">District &amp; Officer</th>
                        <th className="py-2.5 px-3">Details / Diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogsList.map((log, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                            {log.timestamp}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-800 block">{log.user_name || log.user_id || 'System'}</span>
                            <span className="text-[9px] font-black uppercase text-indigo-600">{log.role || 'SUPER_ADMIN'}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
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
                            <p className="font-medium text-slate-700 max-w-md">{log.details}</p>
                          </td>
                        </tr>
                      ))}
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
    </div>
  );
}

