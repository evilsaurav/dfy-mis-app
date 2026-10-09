import React, { useState, useEffect, useRef } from 'react';

const STATUS_STYLES = {
  DRAFT: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REVERTED: 'bg-orange-100 text-orange-700',
  DISPUTED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }) {
  const icons = { DRAFT: '📝', SUBMITTED: '📤', APPROVED: '✅', REVERTED: '↩️', DISPUTED: '⚠️' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      <span>{icons[status] || '•'}</span>
      <span>{status || 'DRAFT'}</span>
    </span>
  );
}

const buildDrilldownDaysFromOfficer = (officer) => {
  let days = [];
  if (Array.isArray(officer?.days) && officer.days.length > 0) {
    days = officer.days.map((d, idx) => {
      const m = parseFloat(d.morning_km ?? d.initial_reading ?? 0) || 0;
      const e = parseFloat(d.evening_km ?? d.final_reading ?? 0) || 0;
      const diff = Math.max(0, e - m);
      const isMan = !!(d.is_manual_override || d.is_override);
      const tKm = (d.total_km != null && parseFloat(d.total_km) > 0) ? parseFloat(d.total_km) : diff;
      const manKm = d.manual_total_km != null && d.manual_total_km !== ''
        ? String(d.manual_total_km)
        : (isMan && tKm > 0 ? String(tKm) : '');
      return {
        day: d.day || idx + 1,
        date: d.date || '',
        morning_km: d.morning_km ?? d.initial_reading ?? '',
        evening_km: d.evening_km ?? d.final_reading ?? '',
        total_km: isMan ? (parseFloat(manKm) || tKm) : diff,
        manual_total_km: manKm,
        visited_names: d.visited_names ?? d.to_location ?? '',
        purpose: d.purpose ?? d.remarks ?? '',
        is_manual_override: isMan,
        admin_remarks: d.admin_remarks ?? '',
      };
    });
  } else if (officer?.days && typeof officer.days === 'object') {
    days = Object.entries(officer.days).map(([k, v], idx) => {
      const m = parseFloat(v.morning_km ?? v.initial_reading ?? 0) || 0;
      const e = parseFloat(v.evening_km ?? v.final_reading ?? 0) || 0;
      const diff = Math.max(0, e - m);
      const isMan = !!(v.is_manual_override || v.is_override);
      const tKm = (v.total_km != null && parseFloat(v.total_km) > 0) ? parseFloat(v.total_km) : diff;
      const manKm = v.manual_total_km != null && v.manual_total_km !== ''
        ? String(v.manual_total_km)
        : (isMan && tKm > 0 ? String(tKm) : '');
      return {
        day: v.day || idx + 1,
        date: v.date || k,
        morning_km: v.morning_km ?? v.initial_reading ?? '',
        evening_km: v.evening_km ?? v.final_reading ?? '',
        total_km: isMan ? (parseFloat(manKm) || tKm) : diff,
        manual_total_km: manKm,
        visited_names: v.visited_names ?? v.to_location ?? '',
        purpose: v.purpose ?? v.remarks ?? '',
        is_manual_override: isMan,
        admin_remarks: v.admin_remarks ?? '',
      };
    });
  } else {
    days = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1,
      date: '',
      morning_km: '',
      evening_km: '',
      total_km: 0,
      manual_total_km: '',
      is_manual_override: false,
      visited_names: '',
      purpose: '',
      admin_remarks: '',
    }));
  }
  return days;
};

export default function TravelAllowanceModal({
  isOpen,
  onClose,
  // state from useAdminTA
  taMonth = '', setTaMonth,
  taDistrict = '', setTaDistrict,
  roster = [], setRoster,
  selectedOfficer, setSelectedOfficer,
  viewMode = 'ROSTER', setViewMode,
  ratePerKm = 4.0,
  editingRate = false, setEditingRate,
  newRateInput = '', setNewRateInput,
  showContextMenu = false, setShowContextMenu,
  loadingRoster = false,
  isSubmitting = false,
  revertModalStaff, setRevertModalStaff,
  revertReason = '', setRevertReason,
  drilldownLog = [], setDrilldownLog,
  deductionAmount = 0, setDeductionAmount,
  deductionReason = '', setDeductionReason,
  canPrefill = false,
  prefillAccessList = [],
  loadingAccessList = false,
  showPrefillManageModal = false, setShowPrefillManageModal,
  fetchPrefillAccessList,
  handleTogglePrefillAccess,
  isSuperAdmin = false,
  isSubAdmin = false,
  isIncharge = false,
  canEdit = false,
  fetchRoster,
  fetchRate,
  handlePrefill,
  handleSaveLog,
  handleSaveLogBulk,
  handleSubmitRoster,
  handlePassStaff,
  handleRevertStaff,
  handleUnlockStaff,
  handleUpdateRate,
  handleExportExcel,
  districts = [],
  currentUser,
}) {
  const contextMenuRef = useRef(null);
  const [showConfirmSubmitModal, setShowConfirmSubmitModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [editedDrafts, setEditedDrafts] = useState({});
  const isDirtyRef = useRef(isDirty);

  const getOfficerKey = (off) => off?.staff_key || off?.doc_id || off?.staff_id;

  const pendingBulkCount = useMemo(() => {
    const keys = new Set(Object.keys(editedDrafts));
    if (isDirty && selectedOfficer) {
      const curKey = getOfficerKey(selectedOfficer);
      if (curKey) keys.add(curKey);
    }
    return keys.size;
  }, [editedDrafts, isDirty, selectedOfficer]);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!showContextMenu) return;
    const handler = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setShowContextMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showContextMenu, setShowContextMenu]);

  const isLocked = Boolean(selectedOfficer?.is_locked || selectedOfficer?.status === 'SUBMITTED' || selectedOfficer?.status === 'APPROVED');

  const saveCurrentDrilldown = async (opts = {}) => {
    if (!selectedOfficer) return true;
    const key = getOfficerKey(selectedOfficer);
    const ok = await handleSaveLog?.(key, drilldownLog, deductionAmount, deductionReason, selectedOfficer, opts);
    if (ok) {
      setIsDirty(false);
      if (key) {
        setEditedDrafts((prev) => {
          if (!prev || !prev[key]) return prev;
          const copy = { ...prev };
          delete copy[key];
          return copy;
        });
      }
    }
    return ok;
  };

  useEffect(() => {
    if (!isOpen || viewMode !== 'DRILLDOWN') return;
    if (!canEdit || isLocked) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current) {
        saveCurrentDrilldown({ silent: true, skipRosterRefresh: true });
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [isOpen, viewMode, canEdit, isLocked, selectedOfficer, drilldownLog, deductionAmount, deductionReason]);

  if (!isOpen) return null;

  // ── KPI Banners ───────────────────────────────────────────────────────────
  const kpiBanners = roster.reduce(
    (acc, s) => {
      acc.totalKm += s.total_km || 0;
      acc.gross += s.gross_amount || 0;
      acc.deductions += s.deduction_amount || 0;
      acc.net += s.final_payable_amount || 0;
      return acc;
    },
    { totalKm: 0, gross: 0, deductions: 0, net: 0 }
  );

  // ── Allowed districts for SUB_ADMIN filtering ─────────────────────────────
  const allowedDistricts =
    currentUser?.role === 'SUB_ADMIN' && Array.isArray(currentUser?.allowed_districts)
      ? currentUser.allowed_districts.filter((d) => d !== 'All')
      : districts;

  // ── Drilldown view helpers ────────────────────────────────────────────────
  const drilldownTotalKm = drilldownLog.reduce((sum, d) => {
    if (d.is_manual_override && d.manual_total_km != null && d.manual_total_km !== '') {
      return sum + (parseFloat(d.manual_total_km) || 0);
    }
    if (d.is_manual_override && d.total_km != null && parseFloat(d.total_km) > 0) {
      return sum + (parseFloat(d.total_km) || 0);
    }
    return sum + Math.max(0, (parseFloat(d.evening_km) || 0) - (parseFloat(d.morning_km) || 0));
  }, 0);
  const drilldownGross = drilldownTotalKm * ratePerKm;
  const drilldownNet = Math.max(0, drilldownGross - (parseFloat(deductionAmount) || 0));

  // ── Handle officer drilldown loader & inspect ────────────────────────────
  const loadOfficerIntoDrilldown = (officer) => {
    setSelectedOfficer(officer);
    const key = getOfficerKey(officer);
    const draft = editedDrafts[key];
    if (draft) {
      setDrilldownLog(draft.days || buildDrilldownDaysFromOfficer(officer));
      setDeductionAmount(draft.deduction_amount ?? officer?.deduction_amount ?? 0);
      setDeductionReason(draft.deduction_reason ?? officer?.deduction_reason ?? '');
      setIsDirty(true);
    } else {
      setDrilldownLog(buildDrilldownDaysFromOfficer(officer));
      setDeductionAmount(officer?.deduction_amount || 0);
      setDeductionReason(officer?.deduction_reason || '');
      setIsDirty(false);
    }
  };

  const handleInspect = (officer) => {
    loadOfficerIntoDrilldown(officer);
    setViewMode('DRILLDOWN');
  };

  const switchToOfficer = async (targetOfficer) => {
    const targetKey = getOfficerKey(targetOfficer);
    const currentKey = getOfficerKey(selectedOfficer);
    if (!targetOfficer || targetKey === currentKey) return;
    if (isDirty) {
      await saveCurrentDrilldown({ silent: true });
    }
    loadOfficerIntoDrilldown(targetOfficer);
  };

  const handleDrilldownFieldChange = (dayIndex, field, value) => {
    setDrilldownLog((prev) => {
      const updated = [...prev];
      const currentDay = updated[dayIndex] || {};

      const newMorning = field === 'morning_km' ? value : currentDay.morning_km;
      const newEvening = field === 'evening_km' ? value : currentDay.evening_km;
      const mKm = parseFloat(newMorning) || 0;
      const eKm = parseFloat(newEvening) || 0;
      const calculatedTotalKm = Math.max(0, eKm - mKm);

      let isManual = Boolean(currentDay.is_manual_override);
      let manualTotal = currentDay.manual_total_km;
      let finalTotalKm = calculatedTotalKm;

      if (field === 'is_manual_override') {
        isManual = Boolean(value);
        if (isManual) {
          if (manualTotal == null || String(manualTotal).trim() === '') {
            manualTotal = currentDay.total_km && parseFloat(currentDay.total_km) > 0
              ? String(currentDay.total_km)
              : (calculatedTotalKm > 0 ? String(calculatedTotalKm) : '');
          }
          const parsed = parseFloat(manualTotal);
          finalTotalKm = !isNaN(parsed) ? Math.max(0, parsed) : calculatedTotalKm;
        } else {
          finalTotalKm = calculatedTotalKm;
        }
      } else if (field === 'manual_total_km') {
        isManual = true;
        manualTotal = value;
        const parsed = parseFloat(value);
        finalTotalKm = !isNaN(parsed) ? Math.max(0, parsed) : calculatedTotalKm;
      } else {
        if (isManual && manualTotal != null && String(manualTotal).trim() !== '') {
          const parsed = parseFloat(manualTotal);
          finalTotalKm = !isNaN(parsed) ? Math.max(0, parsed) : calculatedTotalKm;
        } else {
          finalTotalKm = calculatedTotalKm;
        }
      }

      updated[dayIndex] = {
        ...currentDay,
        [field]: value,
        is_manual_override: isManual,
        manual_total_km: manualTotal,
        total_km: finalTotalKm,
      };
      setIsDirty(true);
      const currentKey = getOfficerKey(selectedOfficer);
      if (currentKey) {
        setEditedDrafts((prev) => ({
          ...prev,
          [currentKey]: {
            officer: selectedOfficer,
            days: updated,
            deduction_amount: deductionAmount,
            deduction_reason: deductionReason,
          },
        }));
      }
      return updated;
    });
  };

  const handleBulkSaveClick = async () => {
    if (isSubmitting || !canEdit) return;

    // 1. Sync live active tab into drafts if dirty
    const currentKey = getOfficerKey(selectedOfficer);
    let latestDrafts = { ...editedDrafts };
    if (isDirty && currentKey && selectedOfficer) {
      latestDrafts[currentKey] = {
        officer: selectedOfficer,
        days: drilldownLog,
        deduction_amount: deductionAmount,
        deduction_reason: deductionReason,
      };
      setEditedDrafts(latestDrafts);
    }

    const draftKeys = Object.keys(latestDrafts);
    if (draftKeys.length === 0) return;

    // 2. Build entries array matching save-log shape
    const entries = draftKeys.map((k) => {
      const draft = latestDrafts[k];
      const off = draft?.officer || {};
      return {
        month: taMonth,
        district: taDistrict,
        staff_name: off?.staff_name || off?.name || k || '',
        designation: off?.designation || 'Field Officer',
        staff_key: k,
        days: draft?.days || [],
        deduction_amount: parseFloat(draft?.deduction_amount) || 0,
        deduction_reason: draft?.deduction_reason || '',
      };
    });

    const res = await handleSaveLogBulk?.(entries);
    if (res?.success) {
      setEditedDrafts({});
      if (currentKey && latestDrafts[currentKey]) {
        setIsDirty(false);
      }
      if (Array.isArray(res.results) && setRoster) {
        setRoster((prevRoster) => {
          if (!Array.isArray(prevRoster)) return prevRoster;
          const resultMap = new Map(res.results.map((r) => [r.staff_key, r]));
          return prevRoster.map((item) => {
            const itemKey = getOfficerKey(item);
            const updated = resultMap.get(itemKey);
            if (updated) {
              return {
                ...item,
                total_km: updated.total_km,
                gross_amount: updated.gross_amount,
                deduction_amount: updated.deduction_amount,
                final_payable_amount: updated.final_payable_amount,
              };
            }
            return item;
          });
        });
      }
    }
  };

  const effectiveCanPrefill = isSuperAdmin || canPrefill;

  // ── ROSTER VIEW ───────────────────────────────────────────────────────────
  if (viewMode === 'ROSTER') {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col overflow-hidden">
        <div className="bg-white w-full h-full flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex flex-wrap gap-3 items-center justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚗</span>
              <div>
                <h2 className="text-base font-black text-slate-800">Travel Allowance</h2>
                <p className="text-xs text-slate-400 font-medium">District Payroll Roster</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Month picker */}
              <input
                type="month"
                value={taMonth}
                onChange={(e) => setTaMonth(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />

              {/* District dropdown */}
              <select
                value={taDistrict}
                onChange={(e) => setTaDistrict(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">— District —</option>
                {allowedDistricts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {/* Rate pill */}
              <button
                onClick={() => isIncharge && setEditingRate(true)}
                title={isIncharge ? 'Click to edit rate' : 'View-only'}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-all"
              >
                <span>Rate: ₹{ratePerKm}/KM</span>
                {isIncharge && <span className="text-amber-500">✏️</span>}
              </button>

              {/* ••• Context Menu */}
              <div className="relative" ref={contextMenuRef}>
                <button
                  onClick={() => setShowContextMenu((v) => !v)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-100 transition-all"
                  aria-label="More actions"
                >
                  •••
                </button>
                {showContextMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 min-w-[240px] overflow-hidden dropdown">
                    {isSubAdmin && (
                      <div className="border-b border-slate-100 p-3 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <span>⚡</span>
                            <span>Pre-fill from Field Reports</span>
                          </div>
                          {!effectiveCanPrefill && (
                            <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                              🔒 Restricted
                            </span>
                          )}
                        </div>

                        {!effectiveCanPrefill ? (
                          <p className="text-[11px] text-slate-400 italic">
                            Prefill permission restricted to authorized admins. Contact Super Admin.
                          </p>
                        ) : roster.length === 0 ? (
                          <p className="text-[11px] text-slate-400 italic">
                            Load roster first to select an officer.
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-600">
                              Select Officer to Pre-fill:
                            </label>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) return;
                                const staff = roster.find(
                                  (s) => String(s.staff_key || s.staff_id || s.doc_id || s.staff_name) === String(val)
                                );
                                if (staff) {
                                  setShowContextMenu(false);
                                  handleInspect(staff);
                                  handlePrefill?.(
                                    staff.staff_name,
                                    staff.staff_key || staff.doc_id || staff.staff_id
                                  );
                                }
                              }}
                              className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-2 font-medium text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                            >
                              <option value="" disabled>— Choose Officer —</option>
                              {roster.map((s, idx) => {
                                const optKey = s.staff_key || s.staff_id || s.doc_id || s.staff_name || idx;
                                return (
                                  <option key={optKey} value={optKey}>
                                    {s.staff_name} ({s.designation || 'Field Officer'})
                                  </option>
                                );
                              })}
                            </select>
                            <p className="text-[10px] text-slate-400">
                              Opens drilldown &amp; populates KM readings from daily reports.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {isSuperAdmin && (
                      <button
                        onClick={() => {
                          setShowContextMenu(false);
                          setShowPrefillManageModal?.(true);
                          fetchPrefillAccessList?.();
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-all text-left border-t border-slate-100"
                      >
                        <span>🛡️</span>
                        <span>Manage Prefill Permissions</span>
                      </button>
                    )}

                    {!isSubAdmin && !isSuperAdmin && (
                      <div className="px-4 py-3 text-xs text-slate-400 italic">No additional actions.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Load button */}
              <button
                onClick={() => fetchRoster?.()}
                disabled={loadingRoster || !taMonth || !taDistrict}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>{loadingRoster ? '⏳' : '🔄'}</span>
                <span>{loadingRoster ? 'Loading…' : 'Load'}</span>
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none px-1"
              >
                ×
              </button>
            </div>
          </div>

          {/* KPI Banner row */}
          {roster.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-slate-100">
              {[
                { label: 'Total KM', value: `${kpiBanners.totalKm.toFixed(1)} KM`, color: 'blue' },
                { label: 'Gross ₹', value: `₹${kpiBanners.gross.toFixed(2)}`, color: 'violet' },
                { label: 'Deductions ₹', value: `₹${kpiBanners.deductions.toFixed(2)}`, color: 'orange' },
                { label: 'Net Payable ₹', value: `₹${kpiBanners.net.toFixed(2)}`, color: 'emerald' },
              ].map((pill) => (
                <div key={pill.label} className={`bg-${pill.color}-50 border border-${pill.color}-100 rounded-2xl p-3 text-center`}>
                  <p className={`text-xs font-bold text-${pill.color}-500 mb-0.5`}>{pill.label}</p>
                  <p className={`text-sm font-black text-${pill.color}-800`}>{pill.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Roster Table */}
          <div className="flex-1 overflow-x-auto p-4">
            {roster.length === 0 ? (
              <div className="text-center text-slate-400 py-12 text-sm">
                {loadingRoster ? '⏳ Loading roster…' : 'Select month & district, then click 🔄 Load.'}
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Officer', 'Days', 'Total KM', 'Gross', 'Deduct', 'Net', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-black text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((staff, idx) => (
                    <tr key={staff.staff_key || staff.staff_id || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
                        <div>{staff.staff_name}</div>
                        <div className="text-slate-400 font-normal">{staff.designation}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{staff.active_days ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-700">{(staff.total_km || 0).toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-violet-700 font-semibold">₹{(staff.gross_amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-orange-600">₹{(staff.deduction_amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-emerald-700 font-bold">₹{(staff.final_payable_amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={staff.status} />
                        {staff.is_locked && <span className="ml-1 text-slate-400">🔒</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleInspect(staff)}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 font-bold transition-all"
                            title="Inspect day-by-day log"
                          >
                            🔍
                          </button>
                          {isIncharge && staff.status === 'SUBMITTED' && (
                            <button
                              onClick={() => handlePassStaff?.(staff.staff_key || staff.doc_id || staff.staff_id)}
                              disabled={isSubmitting}
                              className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold disabled:opacity-50 transition-all"
                              title="Approve"
                            >
                              ✅
                            </button>
                          )}
                          {isIncharge && staff.status === 'SUBMITTED' && (
                            <button
                              onClick={() => setRevertModalStaff(staff)}
                              disabled={isSubmitting}
                              className="px-2 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold disabled:opacity-50 transition-all"
                              title="Revert"
                            >
                              ↩️
                            </button>
                          )}
                          {isIncharge && (staff.is_locked || staff.status === 'APPROVED' || staff.status === 'SUBMITTED') && (
                            <button
                              onClick={() => handleUnlockStaff?.(staff.staff_key || staff.doc_id || staff.staff_id)}
                              disabled={isSubmitting}
                              className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold disabled:opacity-50 transition-all border border-amber-200"
                              title="Unlock record (अनलॉक करें)"
                            >
                              🔓
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-slate-100 bg-slate-50 rounded-b-3xl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowConfirmSubmitModal(true)}
                disabled={!isSubAdmin || isSubmitting || roster.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-600/20 active:scale-95"
                title="Submit roster to Main Incharge for verification and approval"
              >
                <span>📤</span>
                <span>{isSubmitting ? 'Submitting…' : 'Submit to Incharge'}</span>
              </button>
              <button
                onClick={() => handleExportExcel?.()}
                disabled={isSubmitting || roster.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>📊</span>
                <span>{isSubmitting ? 'Exporting…' : 'Export Excel'}</span>
              </button>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all"
            >
              Close
            </button>
          </div>
        </div>

        {/* Rate Edit Dialog */}
        {editingRate && (
          <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-sm font-black text-slate-800 mb-4">✏️ Update KM Rate</h3>
              <input
                type="number"
                step="0.1"
                min="0"
                value={newRateInput}
                onChange={(e) => setNewRateInput(e.target.value)}
                placeholder={`Current: ₹${ratePerKm}/KM`}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-300 mb-4"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setEditingRate(false); setNewRateInput(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdateRate?.(newRateInput)}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-all"
                >
                  Save Rate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Revert Reason Dialog */}
        {revertModalStaff && (
          <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h3 className="text-sm font-black text-slate-800 mb-1">↩️ Revert Record</h3>
              <p className="text-xs text-slate-500 mb-4">
                Reverting: <strong>{revertModalStaff.staff_name}</strong>
              </p>
              <textarea
                rows={3}
                value={revertReason}
                onChange={(e) => setRevertReason(e.target.value)}
                placeholder="Enter reason for revert…"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300 mb-4 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setRevertModalStaff(null); setRevertReason(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRevertStaff?.(revertModalStaff.staff_key || revertModalStaff.doc_id || revertModalStaff.staff_id, revertReason)}
                  disabled={isSubmitting || !revertReason.trim()}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-50 transition-all"
                >
                  Confirm Revert
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submit to Incharge Confirmation Dialog */}
        {showConfirmSubmitModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-60 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-2xl shrink-0">
                  📋
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-snug">
                    अंतिम समीक्षा एवं इंचार्ज को सबमिट
                  </h3>
                  <p className="text-xs font-semibold text-blue-600">
                    Final Review & Submit to Incharge
                  </p>
                </div>
              </div>

              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 text-xs space-y-2.5 text-amber-950">
                <div className="flex items-center gap-2 font-bold text-amber-900 text-sm">
                  <span>⚠️</span>
                  <span>क्या आपकी रिपोर्ट पूरी तरह फाइनल हो गई है?</span>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  यदि किसी अधिकारी की <strong>KM रीडिंग, रूट या कटौती (Deductions)</strong> में कोई सुधार शेष है, तो कृपया पहले <strong>'अंतिम समीक्षा करें'</strong> पर क्लिक करके जांच पूरी कर लें।
                </p>
                <div className="p-3 bg-white/80 rounded-xl border border-amber-200/60 text-slate-800 space-y-1.5 font-medium">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <span>🔒</span>
                    <span>महत्वपूर्ण सुरक्षा नियम (Locking Policy):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
                    <li>एक बार सबमिट होने के बाद यह रिपोर्ट <strong>स्वतः लॉक</strong> हो जाएगी और सब-एडमिन इसमें कोई बदलाव नहीं कर सकेंगे।</li>
                    <li>रिपोर्ट को अनलॉक करने का अधिकार केवल <strong>मुख्य इंचार्ज (Main Incharge / Super Admin)</strong> के पास सुरक्षित है।</li>
                    <li>यदि किसी फील्ड ऑफिसर द्वारा डिस्प्यूट (Dispute) दर्ज किया जाता है, तो इंचार्ज समीक्षा के बाद इसे अनलॉक कर सकेंगे।</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 py-1 text-center text-xs">
                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-2">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Officers</p>
                  <p className="font-black text-slate-800 text-sm">{roster.length}</p>
                </div>
                <div className="bg-blue-50/50 border border-blue-200/60 rounded-xl p-2">
                  <p className="text-[10px] text-blue-500 font-bold uppercase tracking-wider">Total KM</p>
                  <p className="font-black text-blue-800 text-sm">{kpiBanners.totalKm.toFixed(1)}</p>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-xl p-2">
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Net Payable</p>
                  <p className="font-black text-emerald-800 text-sm">₹{kpiBanners.net.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowConfirmSubmitModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all disabled:opacity-50"
                >
                  अंतिम समीक्षा करें (Review Again)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowConfirmSubmitModal(false);
                    await handleSubmitRoster?.();
                  }}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-md shadow-blue-600/30 active:scale-95"
                >
                  <span>{isSubmitting ? '⏳ सबमिट हो रहा है…' : 'हाँ, इंचार्ज को सबमिट करें'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Super-Admin Prefill Access Management Modal */}
        {showPrefillManageModal && isSuperAdmin && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-70 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-100 flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>🛡️</span>
                    <span>Manage Prefill Permissions</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Authorize Sub-Admins who are permitted to trigger auto-prefill from field reports.
                  </p>
                </div>
                <button
                  onClick={() => setShowPrefillManageModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none px-1"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4">
                {loadingAccessList ? (
                  <div className="text-center py-8 text-xs text-slate-400">⏳ Loading admin list…</div>
                ) : prefillAccessList.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">No Sub-Admins found.</div>
                ) : (
                  <div className="space-y-2">
                    {prefillAccessList.map((admin) => (
                      <div
                        key={admin.id}
                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <p className="text-xs font-bold text-slate-800">{admin.username}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                              {admin.role}
                            </span>
                            {admin.allowed_districts && admin.allowed_districts.length > 0 && (
                              <span className="text-[10px] text-slate-400">
                                {Array.isArray(admin.allowed_districts) ? admin.allowed_districts.join(', ') : admin.allowed_districts}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleTogglePrefillAccess(admin.id, admin.can_prefill)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            admin.can_prefill
                              ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {admin.can_prefill ? 'Revoke Access' : 'Grant Access'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowPrefillManageModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── DRILLDOWN VIEW ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col overflow-hidden">
      <div className="bg-white w-full h-full flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (isDirty) await saveCurrentDrilldown({ silent: true });
                setViewMode('ROSTER');
                setSelectedOfficer(null);
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 transition-all"
            >
              ← Back to District Roster
            </button>
            <span className="text-slate-300">|</span>
            <div>
              <p className="text-sm font-black text-slate-800">{selectedOfficer?.staff_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500">{selectedOfficer?.designation}</span>
                <StatusBadge status={selectedOfficer?.status} />
                {isLocked && (
                  <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-bold">
                    🔒 Locked
                  </span>
                )}
                {isIncharge && isLocked && (
                  <button
                    onClick={async () => {
                      await handleUnlockStaff?.(selectedOfficer.staff_key || selectedOfficer.doc_id || selectedOfficer.staff_id);
                      setSelectedOfficer((prev) => ({ ...prev, is_locked: false, status: 'REVERTED' }));
                    }}
                    disabled={isSubmitting}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-all border border-amber-300 disabled:opacity-50"
                    title="Unlock this officer's record to allow Sub-Admin editing"
                  >
                    <span>🔓</span>
                    <span>Unlock</span>
                  </button>
                )}
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  Rate: ₹{ratePerKm}/KM
                </span>

                {isSubAdmin && (
                  <button
                    onClick={() => {
                      if (!effectiveCanPrefill || isLocked) return;
                      handlePrefill?.(
                        selectedOfficer?.staff_name,
                        selectedOfficer?.staff_key || selectedOfficer?.doc_id || selectedOfficer?.staff_id
                      );
                    }}
                    disabled={isSubmitting || !effectiveCanPrefill || isLocked}
                    title={
                      isLocked
                        ? "Record is locked"
                        : !effectiveCanPrefill
                          ? "Prefill permission restricted to authorized admins. Contact Super Admin."
                          : "Pre-fill KM readings from Field Reports"
                    }
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-sm ${
                      isLocked || !effectiveCanPrefill
                        ? "opacity-50 cursor-not-allowed text-slate-400 bg-slate-100 border border-slate-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:scale-95"
                    }`}
                  >
                    <span>⚡</span>
                    <span>{isSubmitting ? 'Pre-filling…' : 'Pre-fill from Field Reports'}</span>
                    {!effectiveCanPrefill && !isLocked && (
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1 py-0.2 rounded ml-1">🔒</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              if (isDirty) await saveCurrentDrilldown({ silent: true });
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 pt-2 border-b border-slate-100 bg-slate-50/60">
          {roster.map((staff) => {
            const key = staff.staff_key || staff.doc_id || staff.staff_id;
            const selKey = selectedOfficer?.staff_key || selectedOfficer?.doc_id || selectedOfficer?.staff_id;
            const isActive = key === selKey;
            return (
              <button
                key={key}
                onClick={() => switchToOfficer(staff)}
                title={staff.staff_name}
                className={`shrink-0 px-3 py-1.5 rounded-t-lg text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {staff.staff_name}
              </button>
            );
          })}
        </div>

        {/* 31-day table */}
        <div className="flex-1 overflow-x-auto p-4">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Day', 'Date', 'Morning KM', 'Evening KM', 'Day KM', 'Visited Names', 'Purpose', 'Override'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-black text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drilldownLog.map((row, idx) => {
                const dayKm = (row.is_manual_override && row.manual_total_km != null && row.manual_total_km !== '')
                  ? (parseFloat(row.manual_total_km) || 0)
                  : (row.is_manual_override && row.total_km != null && parseFloat(row.total_km) > 0)
                    ? (parseFloat(row.total_km) || 0)
                    : Math.max(0, (parseFloat(row.evening_km) || 0) - (parseFloat(row.morning_km) || 0));

                return (
                  <tr key={row.day || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 font-bold text-slate-500 w-10">{row.day}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.date || '—'}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.morning_km ?? ''}
                        onChange={(e) => handleDrilldownFieldChange(idx, 'morning_km', e.target.value)}
                        disabled={!canEdit || isLocked}
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.evening_km ?? ''}
                        onChange={(e) => handleDrilldownFieldChange(idx, 'evening_km', e.target.value)}
                        disabled={!canEdit || isLocked}
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {row.is_manual_override ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={row.manual_total_km ?? row.total_km ?? ''}
                            onChange={(e) => handleDrilldownFieldChange(idx, 'manual_total_km', e.target.value)}
                            disabled={!canEdit || isLocked}
                            className="w-20 border border-amber-300 bg-amber-50 rounded-lg px-2 py-1 text-xs font-bold text-amber-900 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:bg-slate-50 disabled:text-slate-400"
                            placeholder="0.0"
                            title="Manual KM reading"
                          />
                          <span className="text-[10px] font-black text-amber-600 bg-amber-100 px-1 py-0.5 rounded">MAN</span>
                        </div>
                      ) : (
                        <span className="font-bold text-blue-700 tabular-nums">{dayKm.toFixed(1)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.visited_names ?? ''}
                        onChange={(e) => handleDrilldownFieldChange(idx, 'visited_names', e.target.value)}
                        disabled={!canEdit || isLocked}
                        className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        placeholder="Names…"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.purpose ?? ''}
                        onChange={(e) => handleDrilldownFieldChange(idx, 'purpose', e.target.value)}
                        disabled={!canEdit || isLocked}
                        className="w-28 border border-slate-200 rounded-lg px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        placeholder="Purpose…"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!row.is_manual_override}
                        onChange={(e) => handleDrilldownFieldChange(idx, 'is_manual_override', e.target.checked)}
                        disabled={!canEdit || isLocked}
                        className="w-4 h-4 rounded accent-blue-600 disabled:opacity-50"
                        title="Manual override total KM"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bottom Accounting Deck */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-3xl space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
              <p className="text-xs font-bold text-blue-500 mb-0.5">Total KM</p>
              <p className="text-sm font-black text-blue-800">{drilldownTotalKm.toFixed(1)} KM</p>
            </div>
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3 text-center">
              <p className="text-xs font-bold text-violet-500 mb-0.5">Gross Amount</p>
              <p className="text-sm font-black text-violet-800">₹{drilldownGross.toFixed(2)}</p>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 text-center">
              <p className="text-xs font-bold text-orange-500 mb-0.5">Deduction</p>
              <input
                type="number"
                value={deductionAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setDeductionAmount(val);
                  setIsDirty(true);
                  const currentKey = getOfficerKey(selectedOfficer);
                  if (currentKey) {
                    setEditedDrafts((prev) => ({
                      ...prev,
                      [currentKey]: {
                        officer: selectedOfficer,
                        days: drilldownLog,
                        deduction_amount: val,
                        deduction_reason: deductionReason,
                      },
                    }));
                  }
                }}
                disabled={!canEdit || isLocked}
                min="0"
                className="w-full text-center text-sm font-black text-orange-800 bg-transparent border-none focus:outline-none disabled:opacity-70"
                placeholder="₹0.00"
              />
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
              <p className="text-xs font-bold text-emerald-500 mb-0.5">Net Payable</p>
              <p className="text-lg font-black text-emerald-800">₹{drilldownNet.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-500 mb-1">Deduction Reason</label>
              <input
                type="text"
                value={deductionReason}
                onChange={(e) => {
                  const val = e.target.value;
                  setDeductionReason(val);
                  setIsDirty(true);
                  const currentKey = getOfficerKey(selectedOfficer);
                  if (currentKey) {
                    setEditedDrafts((prev) => ({
                      ...prev,
                      [currentKey]: {
                        officer: selectedOfficer,
                        days: drilldownLog,
                        deduction_amount: deductionAmount,
                        deduction_reason: val,
                      },
                    }));
                  }
                }}
                disabled={!canEdit || isLocked}
                placeholder="Reason for deduction…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <button
              onClick={() => saveCurrentDrilldown()}
              disabled={isSubmitting || isLocked || !canEdit}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span>💾</span>
              <span>{isSubmitting ? 'Saving…' : 'Save Log'}</span>
            </button>
            <button
              onClick={handleBulkSaveClick}
              disabled={pendingBulkCount === 0 || isSubmitting || !canEdit}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title={pendingBulkCount === 0 ? "No unsaved edits across staff tabs" : `Save all changes for ${pendingBulkCount} staff`}
            >
              <span>💾</span>
              <span>{isSubmitting ? 'Saving All…' : `Save All Staff (${pendingBulkCount})`}</span>
            </button>
            {isLocked && (
              <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl flex items-center gap-1.5 font-bold">
                🔒 Record is locked ({selectedOfficer?.status || 'LOCKED'}). Only Incharge can unlock.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
