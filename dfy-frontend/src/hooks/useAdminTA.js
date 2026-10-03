import { useState, useCallback } from 'react';

/**
 * useAdminTA — Isolated hook for Travel Allowance admin state & API calls.
 * TDZ Rule: All useState declarations first, then role checks, then handlers.
 */
export function useAdminTA({ month, currentUser, authFetch, getAdminToken, showToast, districts = [] }) {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';

  // ── State declarations (TDZ-safe order) ──────────────────────────────────
  const [taMonth, setTaMonth] = useState(month || '');
  const [taDistrict, setTaDistrict] = useState('');
  const [roster, setRoster] = useState([]);
  const [selectedOfficer, setSelectedOfficer] = useState(null);
  const [viewMode, setViewMode] = useState('ROSTER'); // 'ROSTER' | 'DRILLDOWN'
  const [ratePerKm, setRatePerKm] = useState(4.0);
  const [editingRate, setEditingRate] = useState(false);
  const [newRateInput, setNewRateInput] = useState('');
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revertModalStaff, setRevertModalStaff] = useState(null);
  const [revertReason, setRevertReason] = useState('');
  const [drilldownLog, setDrilldownLog] = useState([]);
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [deductionReason, setDeductionReason] = useState('');

  // ── Role checks ───────────────────────────────────────────────────────────
  const isSubAdmin = currentUser?.role === 'SUB_ADMIN' || currentUser?.role === 'SUPER_ADMIN';
  const isIncharge = currentUser?.role === 'MAIN_INCHARGE' || currentUser?.role === 'SUPER_ADMIN';
  const canEdit = isSubAdmin && !selectedOfficer?.is_locked && selectedOfficer?.status !== 'SUBMITTED' && selectedOfficer?.status !== 'APPROVED';

  // ── Handlers ─────────────────────────────────────────────────────────────

  const fetchRate = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/rate`);
      if (res.ok) {
        const data = await res.json();
        setRatePerKm(data.rate_per_km ?? 4.0);
      }
    } catch (err) {
      console.error('fetchRate error', err);
    }
  }, [authFetch, API_BASE_URL]);

  const fetchRoster = useCallback(async () => {
    if (!taMonth || !taDistrict) {
      if (showToast) showToast('Please select a month and district first.', 'warning');
      return;
    }
    setLoadingRoster(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/roster?month=${taMonth}&district=${encodeURIComponent(taDistrict)}`);
      if (res.ok) {
        const data = await res.json();
        setRoster(data.roster || []);
        if (data.rate_per_km != null) setRatePerKm(data.rate_per_km);
      } else {
        if (showToast) showToast('Failed to load TA roster.', 'error');
      }
    } catch (err) {
      console.error('fetchRoster error', err);
      if (showToast) showToast('Error loading roster.', 'error');
    } finally {
      setLoadingRoster(false);
    }
  }, [taMonth, taDistrict, authFetch, API_BASE_URL, showToast]);

  const handlePrefill = useCallback(async () => {
    if (!isSubAdmin) return; // Only SUB_ADMIN / SUPER_ADMIN
    if (!taMonth || !taDistrict) {
      if (showToast) showToast('Select month and district before pre-filling.', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/prefill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: taMonth, district: taDistrict }),
      });
      if (res.ok) {
        if (showToast) showToast('✅ Pre-fill complete! Roster updated from field reports.', 'success');
        await fetchRoster();
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Pre-fill failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handlePrefill error', err);
      if (showToast) showToast('Pre-fill request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubAdmin, taMonth, taDistrict, authFetch, API_BASE_URL, showToast, fetchRoster]);

  const handleSaveLog = useCallback(async (staffKey, days, deduction, deductionReasonText, officer) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/save-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: taMonth,
          district: taDistrict,
          staff_name: officer?.staff_name || officer?.name || staffKey || '',
          designation: officer?.designation || 'Field Officer',
          staff_key: staffKey,
          days,
          deduction_amount: parseFloat(deduction) || 0,
          deduction_reason: deductionReasonText || '',
        }),
      });
      if (res.status === 423) {
        if (showToast) showToast('Record is locked — unlock it first.', 'error');
        return;
      }
      if (res.ok) {
        if (showToast) showToast('✅ Log saved successfully.', 'success');
        await fetchRoster();
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Save failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handleSaveLog error', err);
      if (showToast) showToast('Save request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, taMonth, taDistrict, authFetch, API_BASE_URL, showToast, fetchRoster]);

  const handleSubmitRoster = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/submit-roster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: taMonth, district: taDistrict }),
      });
      if (res.ok) {
        if (showToast) showToast('✅ Roster submitted for approval.', 'success');
        await fetchRoster();
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Submit failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handleSubmitRoster error', err);
      if (showToast) showToast('Submit request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, taMonth, taDistrict, authFetch, API_BASE_URL, showToast, fetchRoster]);

  const handlePassStaff = useCallback(async (staffKey) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/pass-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: taMonth, district: taDistrict, staff_key: staffKey }),
      });
      if (res.ok) {
        if (showToast) showToast('✅ Staff record approved.', 'success');
        await fetchRoster();
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Pass failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handlePassStaff error', err);
      if (showToast) showToast('Pass request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, taMonth, taDistrict, authFetch, API_BASE_URL, showToast, fetchRoster]);

  const handleRevertStaff = useCallback(async (staffKey, reason) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/revert-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: taMonth, district: taDistrict, staff_key: staffKey, reason }),
      });
      if (res.ok) {
        if (showToast) showToast('↩️ Staff record reverted.', 'success');
        setRevertModalStaff(null);
        setRevertReason('');
        await fetchRoster();
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Revert failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handleRevertStaff error', err);
      if (showToast) showToast('Revert request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, taMonth, taDistrict, authFetch, API_BASE_URL, showToast, fetchRoster]);

  const handleUnlockStaff = useCallback(async (staffKey) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/unlock-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: taMonth, district: taDistrict, staff_key: staffKey }),
      });
      if (res.ok) {
        if (showToast) showToast('🔓 Record unlocked for editing.', 'success');
        await fetchRoster();
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Unlock failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handleUnlockStaff error', err);
      if (showToast) showToast('Unlock request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, taMonth, taDistrict, authFetch, API_BASE_URL, showToast, fetchRoster]);

  const handleUpdateRate = useCallback(async (newRate) => {
    const parsed = parseFloat(newRate);
    if (!(parsed > 0)) {
      if (showToast) showToast('Enter a valid rate greater than 0.', 'warning');
      return;
    }
    try {
      const res = await authFetch(`${API_BASE_URL}/admin/ta/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rate_per_km: parsed }),
      });
      if (res.ok) {
        setRatePerKm(parsed);
        setEditingRate(false);
        setNewRateInput('');
        if (showToast) showToast(`✅ Rate updated to ₹${parsed}/KM.`, 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        if (showToast) showToast(`Rate update failed: ${data.detail || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('handleUpdateRate error', err);
      if (showToast) showToast('Rate update request failed.', 'error');
    }
  }, [authFetch, API_BASE_URL, showToast]);

  const handleExportExcel = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await authFetch(
        `${API_BASE_URL}/admin/ta/export-excel?month=${taMonth}&district=${encodeURIComponent(taDistrict)}`
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TA_${taDistrict}_${taMonth}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        if (showToast) showToast('✅ Excel exported.', 'success');
      } else {
        if (showToast) showToast('Export failed.', 'error');
      }
    } catch (err) {
      console.error('handleExportExcel error', err);
      if (showToast) showToast('Export request failed.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, taMonth, taDistrict, authFetch, API_BASE_URL, showToast]);

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    taMonth, setTaMonth,
    taDistrict, setTaDistrict,
    roster, setRoster,
    selectedOfficer, setSelectedOfficer,
    viewMode, setViewMode,
    ratePerKm,
    editingRate, setEditingRate,
    newRateInput, setNewRateInput,
    showContextMenu, setShowContextMenu,
    loadingRoster,
    isSubmitting,
    revertModalStaff, setRevertModalStaff,
    revertReason, setRevertReason,
    drilldownLog, setDrilldownLog,
    deductionAmount, setDeductionAmount,
    deductionReason, setDeductionReason,
    isSubAdmin, isIncharge, canEdit,
    fetchRoster, fetchRate,
    handlePrefill, handleSaveLog,
    handleSubmitRoster, handlePassStaff,
    handleRevertStaff, handleUnlockStaff,
    handleUpdateRate, handleExportExcel,
  };
}
