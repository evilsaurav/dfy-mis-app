import { useState, useEffect, useMemo } from 'react';

/**
 * FoMonthlyRecapCard — Field Officer Consolidated Monthly Impact & TA Recap
 *
 * Modern Glassmorphic / Spotify-Wrapped style scorecard for Field Staff.
 * Displays all consolidated clinical metrics, treatment support, field outreach,
 * digital compliance, mobility & approved TA across 30 distinct indicators.
 * Supports month switching across current and past operational months.
 */
export default function FoMonthlyRecapCard({ foName, workingPlace, pin, currentMonth, showToast }) {
  // ── Month Selection List (Current month + past 5 months) ───────────────────
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const val = `${y}-${m}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      options.push({ val, label });
    }
    return options;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(() => currentMonth || monthOptions[0].val);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Full-screen Slide-over Impact Modal State
  const [showFullStory, setShowFullStory] = useState(false);

  // Dispute Modal State
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [isDisputing, setIsDisputing] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Fetch Consolidated Recap ───────────────────────────────────────────────
  useEffect(() => {
    if (!foName || !workingPlace || !selectedMonth) return;
    let isMounted = true;
    setLoading(true);
    setError(null);

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';
    const params = new URLSearchParams({
      month: selectedMonth,
      district: workingPlace,
      fo_name: foName,
      ...(pin ? { pin: String(pin) } : {})
    });

    fetch(`${API_BASE_URL}/fo/monthly-recap?${params.toString()}`, {
      headers: pin ? { Authorization: `Bearer ${pin}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 401 ? 'PIN verification failed' : 'Failed to load');
        return r.json();
      })
      .then((res) => {
        if (!isMounted) return;
        setData(res);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Recap fetch notice:', err);
        setError('Could not load monthly recap. Check connection or PIN.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [foName, workingPlace, selectedMonth, pin]);

  // ── Dispute Handler ────────────────────────────────────────────────────────
  const handleRaiseDispute = async () => {
    if (isDisputing || !disputeReason.trim()) return;
    setIsDisputing(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';
      const res = await fetch(`${API_BASE_URL}/fo/ta/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(pin ? { Authorization: `Bearer ${pin}` } : {}),
        },
        body: JSON.stringify({
          month: selectedMonth,
          district: workingPlace,
          fo_name: foName,
          pin: pin,
          dispute_reason: disputeReason.trim(),
          reason: disputeReason.trim(),
        }),
      });
      if (!res.ok) throw new Error('Dispute failed');
      setDisputeSuccess(true);
      if (showToast) showToast('✓ Dispute submitted to Incharge & Sub-Admin.', 'success');
      setTimeout(() => setShowDisputeModal(false), 1500);
    } catch {
      if (showToast) showToast('Failed to submit dispute. Please retry.', 'error');
    } finally {
      setIsDisputing(false);
    }
  };

  // ── Format Comprehensive WhatsApp Share Bulletin ─────────────────────────
  const generateWhatsAppBulletin = () => {
    if (!data) return '';
    const c = data.clinical_impact || {};
    const t = data.treatment_support || {};
    const o = data.field_outreach || {};
    const d = data.digital_compliance || {};
    const m = data.mobility_and_ta || {};
    const monthLabel = monthOptions.find((opt) => opt.val === selectedMonth)?.label || selectedMonth;

    let text = `🌟 *DFY TB Monthly Performance Recap*\n`;
    text += `👤 *Officer:* ${foName} (${workingPlace})\n`;
    text += `🗓️ *Period:* ${monthLabel}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;

    text += `🩺 *CLINICAL CASE FINDING*\n`;
    text += `• TB Notifications: *${c.notifications || 0}*\n`;
    text += `• Presumptive TB Suspects: *${c.presumptive || 0}*\n`;
    text += `• Sputum Samples Collected: *${c.sample_collection || 0}*\n`;
    text += `• Sputum / CBNAAT Tested: *${c.sample_tested || 0}*\n`;
    text += `• HIV & DM Co-Screenings: *${c.hiv_dm || 0}*\n`;
    if (c.culture_dst > 0) text += `• Culture & DST Referrals: *${c.culture_dst}*\n`;
    text += `\n`;

    text += `💊 *TREATMENT & PATIENT CARE*\n`;
    text += `• FDC Medicines Given: *${t.fdc_provided || c.fdc_provided || 0} Patients*\n`;
    text += `• FDC Strips Dispensed: *${t.fdc_strips || c.fdc_strips || 0} Strips*\n`;
    text += `• TPT Preventive Started: *${t.tpt_treatment_start || c.tpt_treatment_start || 0}*\n`;
    text += `• TPT Presumptive Contacts: *${t.tpt_presumptive || c.tpt_presumptive || 0}*\n`;
    text += `• Differentiated TB Care: *${t.differentiated_tb || c.differentiated_tb || 0}*\n`;
    text += `• Treatment Outcomes Assigned: *${t.outcome_assigned || c.outcome_assigned || 0}*\n`;
    text += `\n`;

    text += `🏡 *FIELD PRESENCE & OUTREACH*\n`;
    text += `• Direct Face-to-Face Meetings: *${o.face_to_face || 0}*\n`;
    text += `• Household Contact Tracing: *${o.contact_tracing || 0}*\n`;
    text += `• Doorstep Patient Home Visits: *${o.home_visit || 0}*\n`;
    text += `• Patient Follow-ups: *${o.follow_up || 0}*\n`;
    if (o.doctor_store_visits > 0) text += `• Doctor & Chemist Visits: *${o.doctor_store_visits}*\n`;
    text += `\n`;

    text += `🪪 *DIGITAL COMPLIANCE & WELFARE*\n`;
    text += `• Bank DBT Seeded: *${d.dbt || c.dbt || 0}*\n`;
    text += `• Patient Documents / KYC: *${d.documents || o.documents || 0}*\n`;
    text += `• Signed Consents: *${d.consent_with_id || o.consent_with_id || 0}*\n`;
    text += `• Aadhaar Face RD Verified: *${d.adhar_face_authentication || o.adhar_face_authentication || 0}*\n`;
    text += `\n`;

    text += `🚗 *MOBILITY & TRAVEL ALLOWANCE (TA)*\n`;
    text += `• Active Duty Days: *${m.active_duty_days || 0} Days*\n`;
    text += `• Total Distance Covered: *${m.total_km || 0} KM* (Avg: *${m.avg_km_per_day || 0} KM/day*)\n`;
    if (m.is_approved) {
      text += `• TA Status: *APPROVED & PASSED ✓*\n`;
      text += `• Approved Rate: *₹${m.rate_per_km}/KM*\n`;
      if (m.deduction_amount > 0) text += `• Deductions: *-₹${m.deduction_amount?.toFixed(2)}*\n`;
      text += `• Final Net Payable: *₹${m.final_payable_amount?.toFixed(2)}*\n`;
    } else {
      text += `• TA Status: *${m.status === 'DRAFT' || m.status === 'SUBMITTED' ? 'VERIFICATION IN PROGRESS ⏳' : m.status}*\n`;
      text += `• Recorded Distance: *${m.total_km || 0} KM*\n`;
      text += `• Payable Amount: *Will appear once passed by Incharge*\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Doctors For You (DFY) • TB Free Bihar Initiative_`;
    return text;
  };

  const handleShareWhatsApp = () => {
    const text = generateWhatsAppBulletin();
    if (!text) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
          if (showToast) showToast('📋 Full recap copied! Opening WhatsApp...', 'success');
        })
        .catch(() => {});
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const clinical = data?.clinical_impact || {};
  const treatment = data?.treatment_support || {};
  const outreach = data?.field_outreach || {};
  const digital = data?.digital_compliance || {};
  const mobility = data?.mobility_and_ta || {};

  return (
    <div className="w-full">
      {/* ── Main Hero Card ──────────────────────────────────────────────── */}
      <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-slate-700/80 shadow-[0_10px_35px_rgba(0,0,0,0.35)] overflow-hidden text-white p-4 sm:p-5 transition-all">
        {/* Ambient Top Glow */}
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-44 h-44 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* ── Header: Title & Month Dropdown ────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="font-black text-sm tracking-tight text-slate-100 flex items-center gap-1.5">
                Monthly Impact Digest
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                  30+ Indicators
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {foName} • {workingPlace}
              </p>
            </div>
          </div>

          {/* Month Selector Pill */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              disabled={loading}
              className="bg-slate-800/90 hover:bg-slate-800 text-slate-200 text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-700/90 shadow-xs appearance-none pr-7 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-emerald-500/50"
            >
              {monthOptions.map((opt) => (
                <option key={opt.val} value={opt.val} className="bg-slate-900 text-white font-medium">
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
              ▾
            </span>
          </div>
        </div>

        {/* ── Loading / Error States ────────────────────────────────────── */}
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span>Consolidating 30+ monthly performance indicators...</span>
          </div>
        ) : error ? (
          <div className="py-6 px-3 my-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center text-rose-300 text-xs">
            <p className="font-bold">⚠️ {error}</p>
            <p className="text-[10px] text-rose-400/80 mt-1">Make sure you are signed in with a valid PIN.</p>
          </div>
        ) : (
          <>
            {/* ── Travel Allowance Hero Banner ──────────────────────────── */}
            <div className="my-3">
              {mobility.is_approved ? (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border border-emerald-500/40 shadow-inner flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <span>✓ Approved Travel Allowance</span>
                    </span>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-200 tracking-tight tabular-nums mt-0.5">
                      ₹{mobility.final_payable_amount?.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {mobility.total_km?.toFixed(1)} KM @ ₹{mobility.rate_per_km}/KM
                      {mobility.deduction_amount > 0 && ` • -₹${mobility.deduction_amount?.toFixed(2)} Deduction`}
                      {mobility.avg_km_per_day > 0 && ` • Avg ${mobility.avg_km_per_day} KM/day`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-lg shadow-2xs">
                      Passed
                    </span>
                    {mobility.dispute_window_active && !disputeSuccess && (
                      <button
                        type="button"
                        onClick={() => setShowDisputeModal(true)}
                        className="text-[10px] text-amber-300 underline font-bold hover:text-amber-200 cursor-pointer"
                      >
                        ⏱️ Review Dispute
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">⏳</span>
                    <div>
                      <p className="text-xs font-bold text-slate-200">
                        Travel Allowance: Verification in Progress
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {mobility.total_km ? `${mobility.total_km} KM (${mobility.active_duty_days || 0} Duty Days)` : 'Pending month-end submission'} • Passed amount appears once passed
                      </p>
                    </div>
                  </div>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                    Under Review
                  </span>
                </div>
              )}
            </div>

            {/* ── Key Indicators Bento Grid (12 High-Impact Cards) ────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {/* Card 1: TB Notifications */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🩺</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {clinical.notifications ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-tight">
                    TB Notifications
                  </p>
                </div>
              </div>

              {/* Card 2: HIV/DM */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">💉</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {clinical.hiv_dm ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-tight">
                    HIV / DM Screen
                  </p>
                </div>
              </div>

              {/* Card 3: Sample Tested */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🧪</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {clinical.sample_tested ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-tight">
                    CBNAAT / Testing
                  </p>
                </div>
              </div>

              {/* Card 4: Sputum Samples Collected */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🧫</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {clinical.sample_collection ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-teal-400 uppercase tracking-tight">
                    Samples Collected
                  </p>
                </div>
              </div>

              {/* Card 5: FDC Provided & Strips */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">💊</span>
                <div className="mt-1.5">
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-black text-slate-100 tabular-nums">
                      {treatment.fdc_provided ?? clinical.fdc_provided ?? 0}
                    </span>
                    {(treatment.fdc_strips || clinical.fdc_strips) > 0 && (
                      <span className="text-[10px] font-bold text-blue-300">
                        ({treatment.fdc_strips || clinical.fdc_strips} strips)
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-tight">
                    FDC Medicines
                  </p>
                </div>
              </div>

              {/* Card 6: TPT Started */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🛡️</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {treatment.tpt_treatment_start ?? clinical.tpt_treatment_start ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-teal-300 uppercase tracking-tight">
                    TPT Initiated
                  </p>
                </div>
              </div>

              {/* Card 7: Face to Face Meetings */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">👥</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {outreach.face_to_face ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-sky-400 uppercase tracking-tight">
                    Face to Face
                  </p>
                </div>
              </div>

              {/* Card 8: Visits & Contact Tracing */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🏡</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {(outreach.home_visit || 0) + (outreach.contact_tracing || 0)}
                  </span>
                  <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-tight">
                    Visits & Tracing
                  </p>
                </div>
              </div>

              {/* Card 9: Bank DBT Seeded */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">💳</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {digital.dbt ?? clinical.dbt ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-tight">
                    Bank DBT Seeded
                  </p>
                </div>
              </div>

              {/* Card 10: KYC Documents & Consents */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🪪</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {(digital.documents || 0) + (digital.consent_with_id || 0)}
                  </span>
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-tight">
                    KYC & Consents
                  </p>
                </div>
              </div>

              {/* Card 11: Differentiated TB Screened */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🧬</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {treatment.differentiated_tb ?? clinical.differentiated_tb ?? 0}
                  </span>
                  <p className="text-[10px] font-semibold text-fuchsia-400 uppercase tracking-tight">
                    Diff TB Care
                  </p>
                </div>
              </div>

              {/* Card 12: Mobility & Days */}
              <div className="p-2.5 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex flex-col justify-between">
                <span className="text-xs">🏍️</span>
                <div className="mt-1.5">
                  <span className="text-xl font-black text-slate-100 tabular-nums">
                    {mobility.total_km ? Math.round(mobility.total_km) : 0}
                  </span>
                  <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-tight">
                    KM ({mobility.active_duty_days || 0}d • {mobility.avg_km_per_day || 0}k/d)
                  </p>
                </div>
              </div>
            </div>

            {/* ── Action Buttons ────────────────────────────────────────── */}
            <div className="pt-3.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFullStory(true)}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-black text-xs py-2.5 px-3 rounded-2xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>✨ View Full 30-Point Impact Story</span>
              </button>

              <button
                type="button"
                onClick={handleShareWhatsApp}
                title="Share Monthly Report on WhatsApp"
                className="bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-emerald-400 font-bold text-xs py-2.5 px-3.5 rounded-2xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>📲</span>
                <span className="hidden sm:inline text-[11px]">{copied ? 'Copied!' : 'WhatsApp'}</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Full Impact Story Modal (Slide-Over Sheet) ────────────────────── */}
      {showFullStory && data && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-md p-0 sm:p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col text-white">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-black text-base sm:text-lg text-slate-100 flex items-center gap-2">
                  <span>🏆 Full Monthly Performance Digest</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  {foName} • {workingPlace} ({monthOptions.find(o => o.val === selectedMonth)?.label})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullStory(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Scrollable Breakdown across 5 Categories */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Category 1: Clinical Case Finding & Testing */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2.5">
                  <span>🩺 Clinical Case Finding & Diagnostics</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">TB Notifications</span>
                    <span className="text-lg font-black text-emerald-300">{clinical.notifications || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Presumptive TB</span>
                    <span className="text-lg font-black text-slate-200">{clinical.presumptive || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Samples Collected</span>
                    <span className="text-lg font-black text-teal-300">{clinical.sample_collection || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">CBNAAT / Tested</span>
                    <span className="text-lg font-black text-cyan-300">{clinical.sample_tested || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">HIV & DM Screen</span>
                    <span className="text-lg font-black text-purple-300">{clinical.hiv_dm || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Culture & DST</span>
                    <span className="text-lg font-black text-slate-300">{clinical.culture_dst || 0}</span>
                  </div>
                </div>
              </div>

              {/* Category 2: Treatment Support & Patient Adherence */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-2.5">
                  <span>💊 Treatment Support & Patient Adherence</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">FDC Patients</span>
                    <span className="text-lg font-black text-blue-300">{treatment.fdc_provided || clinical.fdc_provided || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">FDC Strips Dispensed</span>
                    <span className="text-lg font-black text-blue-200">{treatment.fdc_strips || clinical.fdc_strips || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">TPT Preventive Started</span>
                    <span className="text-lg font-black text-teal-300">{treatment.tpt_treatment_start || clinical.tpt_treatment_start || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">TPT Presumptive</span>
                    <span className="text-lg font-black text-teal-200">{treatment.tpt_presumptive || clinical.tpt_presumptive || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Diff TB Care Screened</span>
                    <span className="text-lg font-black text-fuchsia-300">{treatment.differentiated_tb || clinical.differentiated_tb || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Outcomes Assigned</span>
                    <span className="text-lg font-black text-slate-200">{treatment.outcome_assigned || clinical.outcome_assigned || 0}</span>
                  </div>
                </div>
              </div>

              {/* Category 3: Community Outreach & Field Interaction */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2.5">
                  <span>🏡 Community Outreach & Field Interaction</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Face to Face Meetings</span>
                    <span className="text-lg font-black text-sky-300">{outreach.face_to_face || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Contact Tracing</span>
                    <span className="text-lg font-black text-orange-300">{outreach.contact_tracing || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Home Visits</span>
                    <span className="text-lg font-black text-amber-300">{outreach.home_visit || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Patient Follow-ups</span>
                    <span className="text-lg font-black text-slate-200">{outreach.follow_up || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 col-span-2">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Doctor & Pharmacy Store Visits</span>
                    <span className="text-lg font-black text-emerald-300">{outreach.doctor_store_visits || 0}</span>
                  </div>
                </div>
              </div>

              {/* Category 4: Digital Compliance, KYC & Welfare */}
              <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-violet-400 flex items-center gap-1.5 mb-2.5">
                  <span>🪪 Digital Compliance, KYC & Welfare</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Bank DBT Seeded</span>
                    <span className="text-lg font-black text-indigo-300">{digital.dbt || clinical.dbt || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Patient ID / Documents</span>
                    <span className="text-lg font-black text-violet-300">{digital.documents || outreach.documents || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Signed Consents</span>
                    <span className="text-lg font-black text-slate-200">{digital.consent_with_id || outreach.consent_with_id || 0}</span>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Aadhaar Face Auth</span>
                    <span className="text-lg font-black text-teal-300">{digital.adhar_face_authentication || outreach.adhar_face_authentication || 0}</span>
                  </div>
                </div>
              </div>

              {/* Category 5: Travel Allowance Financial Summary */}
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 mb-2">
                  <span>🚗 Monthly Travel Allowance Ledger</span>
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Active Reporting Days:</span>
                    <span className="font-bold text-slate-200">{mobility.active_duty_days || 0} Days</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Total Distance Covered:</span>
                    <span className="font-bold text-slate-200">{mobility.total_km || 0} KM</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Average Daily Running:</span>
                    <span className="font-bold text-slate-200">{mobility.avg_km_per_day || 0} KM/day</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Approved Rate:</span>
                    <span className="font-bold text-slate-200">₹{mobility.rate_per_km || 4.0}/KM</span>
                  </div>
                  <div className="flex justify-between text-slate-400 border-t border-slate-800 pt-1.5 mt-1">
                    <span>TA Status:</span>
                    <span className={`font-black ${mobility.is_approved ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {mobility.is_approved ? 'APPROVED & PASSED' : (mobility.status || 'UNDER REVIEW')}
                    </span>
                  </div>
                  {mobility.is_approved && (
                    <>
                      {mobility.deduction_amount > 0 && (
                        <div className="flex justify-between text-rose-300">
                          <span>Deductions ({mobility.deduction_reason || 'Administrative'}):</span>
                          <span className="tabular-nums">-₹{mobility.deduction_amount?.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-black text-emerald-300 pt-1 border-t border-slate-800">
                        <span>Final Net Payable:</span>
                        <span className="tabular-nums">₹{mobility.final_payable_amount?.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>📲 Share Report on WhatsApp</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFullStory(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs py-2.5 px-4 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dispute Modal ────────────────────────────────────────────────── */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full text-white shadow-2xl">
            <h4 className="font-black text-base text-slate-100 flex items-center gap-2">
              <span>🚨 Raise TA Dispute</span>
            </h4>
            <p className="text-slate-400 text-xs mt-1">
              Please explain why this TA calculation needs review by supervisors.
            </p>

            <textarea
              rows={3}
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="e.g. Day 14 evening reading was 20 KM more due to remote block visit..."
              className="w-full mt-3 p-3 bg-slate-800/80 border border-slate-700 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/50 resize-none"
            />

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                disabled={isDisputing}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRaiseDispute}
                disabled={isDisputing || !disputeReason.trim()}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black rounded-xl transition-all cursor-pointer"
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
