import { useState, useEffect } from 'react';

/**
 * TravelAllowanceCard — Field Officer Mobile Component
 *
 * Displays the FO's approved monthly travel allowance summary.
 * - Privacy guard: shows "Verification in Progress" banner during DRAFT/SUBMITTED/REVERTED
 * - Shows full details only when APPROVED
 * - Allows raising a dispute within 24h window (anti-double-tap guard)
 */
export default function TravelAllowanceCard({ foName, workingPlace, month, authToken }) {
  // ── State declarations (TDZ rule: all useState first) ──────────────────────
  const [taData, setTaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [isDisputing, setIsDisputing] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);

  // ── API Fetch ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!foName || !workingPlace || !month) return;
    setLoading(true);
    setError(null);
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';
    fetch(`${API_BASE_URL}/fo/ta/monthly-summary?month=${month}&district=${workingPlace}&fo_name=${foName}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => setTaData(data))
      .catch(() => setError('Could not load travel allowance data'))
      .finally(() => setLoading(false));
  }, [foName, workingPlace, month, authToken]);

  // ── Dispute Handler (anti-double-tap: isDisputing guard) ───────────────────
  const handleRaiseDispute = async () => {
    if (isDisputing || !disputeReason.trim()) return;
    setIsDisputing(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';
      const res = await fetch(`${API_BASE_URL}/fo/ta/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          month,
          district: workingPlace,
          fo_name: foName,
          dispute_reason: disputeReason,
          reason: disputeReason,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setDisputeSuccess(true);
      setShowDisputeModal(false);
    } catch {
      alert('Failed to submit dispute. Please try again.');
    } finally {
      setIsDisputing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center text-slate-500 text-sm">
        ⏳ Loading TA...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-center text-red-500 text-sm">
        ⚠️ {error}
      </div>
    );
  }

  if (!taData) return null;

  const {
    status,
    rate_per_km,
    total_km,
    gross_amount,
    deduction_amount,
    final_payable_amount,
    deduction_reason,
    dispute_window_active,
  } = taData;

  // PRIVACY GUARD — never expose amounts during review
  if (['DRAFT', 'SUBMITTED', 'REVERTED'].includes(status)) {
    return (
      <div className="rounded-2xl bg-slate-100 border border-slate-200 p-4 text-center">
        <p className="text-lg">⏳</p>
        <p className="font-bold text-slate-700 text-sm">
          Monthly Travel Allowance: Verification in Progress
        </p>
        <p className="text-slate-500 text-xs mt-1">
          Your TA is being reviewed by the incharge. Results will appear once approved.
        </p>
      </div>
    );
  }

  // DISPUTED state
  if (status === 'DISPUTED' || disputeSuccess) {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-center">
        <p className="text-lg">⚠️</p>
        <p className="font-bold text-amber-700 text-sm">
          Dispute Submitted to Admin: Under Review
        </p>
        <p className="text-amber-600 text-xs mt-1">
          Your dispute has been sent to the incharge and admin for review.
        </p>
      </div>
    );
  }

  // APPROVED — show full details
  return (
    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 overflow-hidden">
      {/* Header */}
      <div className="bg-emerald-600 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-white font-black text-sm">🚗 Travel Allowance</p>
          <p className="text-emerald-200 text-xs">@ ₹{rate_per_km}/KM</p>
        </div>
        {dispute_window_active && (
          <span className="bg-amber-400/20 text-amber-100 border border-amber-300/30 text-[10px] font-black px-2 py-1 rounded-xl">
            ⏱️ 24h Review Window Open
          </span>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="text-center">
          <p className="text-slate-500 text-xs font-bold uppercase">Total KM</p>
          <p className="text-slate-800 font-black text-lg">{total_km?.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <p className="text-slate-500 text-xs font-bold uppercase">Gross</p>
          <p className="text-slate-800 font-black text-lg">₹{gross_amount?.toFixed(2)}</p>
        </div>
        {deduction_amount > 0 && (
          <div className="text-center">
            <p className="text-red-500 text-xs font-bold uppercase">Deduction</p>
            <p className="text-red-700 font-black text-lg">-₹{deduction_amount?.toFixed(2)}</p>
            {deduction_reason && (
              <p className="text-red-400 text-[10px]">{deduction_reason}</p>
            )}
          </div>
        )}
        <div className={`text-center ${deduction_amount > 0 ? '' : 'col-span-2'}`}>
          <p className="text-emerald-600 text-xs font-bold uppercase">Net Payable</p>
          <p className="text-emerald-700 font-black text-2xl">₹{final_payable_amount?.toFixed(2)}</p>
        </div>
      </div>

      {/* Raise Dispute button — only within 24h window */}
      {dispute_window_active && !disputeSuccess && status !== 'DISPUTED' && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setShowDisputeModal(true)}
            className="w-full bg-red-50 border border-red-200 text-red-700 font-bold text-xs py-2.5 rounded-xl hover:bg-red-100 active:scale-95 transition-all"
          >
            🚨 Raise Dispute
          </button>
        </div>
      )}

      {/* Finalized label — past 24h window */}
      {!dispute_window_active && status === 'APPROVED' && (
        <div className="px-4 pb-4 text-center">
          <span className="text-emerald-600 text-xs font-bold">
            🔒 TA Finalized for Payroll Disbursement
          </span>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-black text-slate-800 text-base mb-1">🚨 Raise Dispute</h3>
            <p className="text-slate-500 text-xs mb-3">
              Describe the issue with your TA calculation. This will be sent to your incharge and admin.
            </p>
            <textarea
              className="w-full border border-slate-300 rounded-xl p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-red-400"
              placeholder="e.g. Day 12 odometer reading is incorrect..."
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setShowDisputeModal(false)}
                className="flex-1 border border-slate-200 text-slate-600 font-bold text-xs py-2.5 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleRaiseDispute}
                disabled={isDisputing || !disputeReason.trim()}
                className="flex-1 bg-red-600 text-white font-black text-xs py-2.5 rounded-xl disabled:opacity-50"
              >
                {isDisputing ? 'Submitting...' : 'Submit Dispute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
