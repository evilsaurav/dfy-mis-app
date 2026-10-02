import React, { useEffect, useRef } from 'react';

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

export default function TravelAllowanceModal({
  isOpen,
  onClose,
  // state from useAdminTA
  taMonth = '', setTaMonth,
  taDistrict = '', setTaDistrict,
  roster = [],
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
  isSubAdmin = false,
  isIncharge = false,
  canEdit = false,
  fetchRoster,
  fetchRate,
  handlePrefill,
  handleSaveLog,
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
    if (d.is_manual_override) return sum + (d.manual_total_km || 0);
    return sum + Math.max(0, (d.evening_km || 0) - (d.morning_km || 0));
  }, 0);
  const drilldownGross = drilldownTotalKm * ratePerKm;
  const drilldownNet = Math.max(0, drilldownGross - (parseFloat(deductionAmount) || 0));

  // ── Handle officer inspect (load 31-day log) ──────────────────────────────
  const handleInspect = (officer) => {
    setSelectedOfficer(officer);
    // Populate drilldown log from officer days or create blank 31-day template
    const days = officer.days && officer.days.length > 0
      ? officer.days
      : Array.from({ length: 31 }, (_, i) => ({
          day: i + 1,
          date: '',
          morning_km: '',
          evening_km: '',
          manual_total_km: '',
          is_manual_override: false,
          visited_names: '',
          purpose: '',
          admin_remarks: '',
        }));
    setDrilldownLog(days);
    setDeductionAmount(officer.deduction_amount || 0);
    setDeductionReason(officer.deduction_reason || '');
    setViewMode('DRILLDOWN');
  };

  const handleDrilldownFieldChange = (dayIndex, field, value) => {
    setDrilldownLog((prev) => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex], [field]: value };
      return updated;
    });
  };

  // ── ROSTER VIEW ───────────────────────────────────────────────────────────
  if (viewMode === 'ROSTER') {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-100 my-4 flex flex-col">

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
                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 min-w-[220px] overflow-hidden dropdown">
                    {isSubAdmin && (
                      <button
                        onClick={() => { setShowContextMenu(false); handlePrefill?.(); }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-all text-left"
                      >
                        <span>⚡</span>
                        <span>Pre-fill District from Reports</span>
                      </button>
                    )}
                    {!isSubAdmin && (
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
                    <tr key={staff.staff_key || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
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
                              onClick={() => handlePassStaff?.(staff.staff_key)}
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
                          {isIncharge && staff.status === 'APPROVED' && (
                            <button
                              onClick={() => handleUnlockStaff?.(staff.staff_key)}
                              disabled={isSubmitting}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-50 transition-all"
                              title="Unlock"
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
                onClick={() => handleSubmitRoster?.()}
                disabled={!isSubAdmin || isSubmitting || roster.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <span>📤</span>
                <span>{isSubmitting ? 'Submitting…' : 'Submit All'}</span>
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
                  onClick={() => handleRevertStaff?.(revertModalStaff.staff_key, revertReason)}
                  disabled={isSubmitting || !revertReason.trim()}
                  className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 disabled:opacity-50 transition-all"
                >
                  Confirm Revert
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── DRILLDOWN VIEW ────────────────────────────────────────────────────────
  const isLocked = selectedOfficer?.is_locked || false;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-100 my-4 flex flex-col">

        {/* Header */}
        <div className="flex flex-wrap gap-3 items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setViewMode('ROSTER'); setSelectedOfficer(null); }}
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
                {isLocked && <span className="text-xs text-slate-400">🔒 Locked</span>}
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  Rate: ₹{ratePerKm}/KM
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold leading-none px-1"
          >
            ×
          </button>
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
                const dayKm = row.is_manual_override
                  ? (row.manual_total_km || 0)
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
                        disabled={!canEdit || isLocked || row.is_manual_override}
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={row.evening_km ?? ''}
                        onChange={(e) => handleDrilldownFieldChange(idx, 'evening_km', e.target.value)}
                        disabled={!canEdit || isLocked || row.is_manual_override}
                        className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 font-bold text-blue-700">{dayKm.toFixed(1)}</td>
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
                onChange={(e) => setDeductionAmount(e.target.value)}
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
                onChange={(e) => setDeductionReason(e.target.value)}
                disabled={!canEdit || isLocked}
                placeholder="Reason for deduction…"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
            <button
              onClick={() => handleSaveLog?.(selectedOfficer?.staff_key, drilldownLog, deductionAmount, deductionReason)}
              disabled={isSubmitting || isLocked || !canEdit}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span>💾</span>
              <span>{isSubmitting ? 'Saving…' : 'Save Log'}</span>
            </button>
            {isLocked && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                🔒 Record is locked. Ask Incharge to unlock.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
