import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import INITIAL_STAFF_DIRECTORY from './staff_directory.json'
import { calculateFdcDosage } from './utils/fdcCalculator'
import { APP_VERSION } from './changelogData'
import { 
  saveOfflineReport, 
  getOfflineReportsCount, 
  syncAllOfflineReports, 
  saveDistrictRegistry, 
  getDistrictRegistry, 
  isPatientIdNotified 
} from './offlineQueue'

// Local Indian Date Formatter (avoids UTC toISOString midnight offset)
const getLocalYMD = (d = new Date()) => {
  const dt = (d instanceof Date && !isNaN(d)) ? d : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// --- Centralized Future-Proof Patient ID Configuration ---
// Enforces strict 9-digit validation today (blocking typos)
// Built with architectural extensibility for future NTEP 10-digit rollout
export const VALID_PATIENT_ID_CONFIG = {
  standard: [9],
  legacyAllowed: [8, 9],
  isValidLength: (len, allow8 = false) => {
    const validLens = allow8 ? [8, 9] : [9];
    return validLens.includes(len);
  },
  getRegex: (allow8 = false) => {
    return allow8 ? /\b\d{8,9}\b/g : /\b\d{9}\b/g;
  }
};

// --- Simple Toast System ---
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const duration = type === 'warning' ? 5500 : 4000;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, type, onClose]);

  if (!message) return null;

  const bgColor = type === 'error' 
    ? 'bg-red-500' 
    : type === 'warning' 
      ? 'bg-amber-600' 
      : type === 'info' 
        ? 'bg-blue-600' 
        : 'bg-emerald-500';

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[100] ${bgColor} text-white px-5 py-3 rounded-2xl sm:rounded-full shadow-lg flex items-center justify-between gap-3 transition-all duration-300 ease-in-out w-[90%] max-w-md`}>
      <span className="font-semibold text-sm tracking-wide">{message}</span>
      <button onClick={onClose} className="opacity-80 hover:opacity-100 font-bold text-lg leading-none shrink-0">&times;</button>
    </div>
  );
};

// --- Modern Section Accordion Container (Default Open for Seamless Single-List Flow) ---
const Accordion = ({ id, title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div 
      id={id}
      data-is-open={isOpen ? 'true' : 'false'}
      className="scroll-mt-36 mb-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden transition-all hover:border-teal-400/80"
    >
      <button 
        type="button"
        data-accordion-btn
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-slate-50/70 hover:bg-slate-100/70 px-4 py-3 sm:px-5 sm:py-3.5 flex justify-between items-center outline-none transition-all cursor-pointer select-none active:bg-slate-100/50 border-b border-slate-200/70 active:scale-[0.99]"
      >
        <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide uppercase flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-600"></span>
          <span>{title}</span>
        </span>
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${isOpen ? 'bg-teal-50 text-teal-700 rotate-180' : 'bg-slate-100 text-slate-400'}`}>
          <svg 
            width="15" 
            height="15"
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && (
        <div className="p-3 sm:p-5 bg-slate-50/30 border-t border-slate-100 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};


// --- Pending Interventions Action Center for Field Officers ---
const PendingInterventionsActionCenter = ({
  cascadeAlerts = [],
  cascadeSummary = {},
  loading = false,
  formData,
  onAutofill,
  showToast,
  onRefresh,
  fullView = false
}) => {
  const [isExpanded, setIsExpanded] = useState(fullView);
  const [selectedFilter, setSelectedFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs mb-5 flex items-center justify-center gap-2 text-slate-400 text-xs font-bold animate-pulse">
        <span className="animate-spin text-base">⏳</span>
        <span>Checking pending patient follow-ups...</span>
      </div>
    );
  }

  if (!cascadeAlerts || cascadeAlerts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-emerald-50/90 via-teal-50/70 to-blue-50/70 rounded-3xl p-4 sm:p-5 border border-emerald-200/80 shadow-sm mb-6 animate-fade-in">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⚡</span>
            <div>
              <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <span>Pending Interventions</span>
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                  0 Pending
                </span>
              </h3>
              <p className="text-[10px] text-emerald-800 font-bold mt-0.5">
                🎉 Sabhi notified patients ke interventions (HIV & DM, Diff TB, DBT, UDST, Contact) complete hain!
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl transition-all active:scale-95 flex items-center gap-1 shrink-0 shadow-2xs"
              title="Check for updates"
            >
              <span>🔄</span> Refresh
            </button>
          )}
        </div>
      </div>
    );
  }

  const hivCount = cascadeSummary.hiv_pending || 0;
  const diffTbCount = cascadeSummary.diff_tb_pending || 0;
  const dbtCount = cascadeSummary.dbt_pending || 0;
  const contactCount = cascadeSummary.contact_pending || 0;
  const udstCount = cascadeSummary.udst_pending || 0;

  const filteredAlerts = cascadeAlerts.filter(a => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchId = String(a.id || '').toLowerCase().includes(q);
      const matchDate = String(a.notified_date || '').toLowerCase().includes(q);
      if (!matchId && !matchDate) return false;
    }
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'HIV') return !a.has_hiv;
    if (selectedFilter === 'DIFF_TB') return !a.has_diff_tb;
    if (selectedFilter === 'DBT') return !a.has_dbt;
    if (selectedFilter === 'CONTACT') return !a.has_contact;
    if (selectedFilter === 'UDST') return !a.has_udst;
    return true;
  });

  const displayedAlerts = (isExpanded || fullView) ? filteredAlerts : filteredAlerts.slice(0, 3);

  const copyWhatsAppList = () => {
    const foName = formData?.fo_name || '';
    const workingPlace = formData?.working_place || '';
    let msg = `*DFY TB MIS: Pending Follow-up Action List*\n`;
    if (foName) msg += `Field Officer: *${foName}* (${workingPlace})\n`;
    msg += `Total Pending Patients: *${cascadeAlerts.length}*\n`;
    msg += `Date: ${new Date().toLocaleDateString('en-IN')}\n\n`;

    cascadeAlerts.forEach((a, idx) => {
      msg += `${idx + 1}. Patient ID: *${a.id}*\n`;
      msg += `   Notified: ${a.notified_date || 'N/A'} (${a.days_elapsed}d ago)\n`;
      msg += `   Pending: ${a.missing_actions ? a.missing_actions.join(', ') : 'Follow-up'}\n\n`;
    });
    msg += `_Kripya in sabhi patients ka priority follow-up karein!_`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).then(() => {
        showToast("📋 Follow-up task list WhatsApp ke liye copy ho gayi!", "success");
      }).catch(() => {
        showToast("Failed to copy", "error");
      });
    }
  };

  return (
    <div className="bg-gradient-to-br from-rose-50/90 via-amber-50/70 to-purple-50/70 rounded-3xl p-4 sm:p-5 border border-rose-200/80 shadow-sm mb-6 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <span>Pending Interventions</span>
              <span className="bg-rose-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs">
                {cascadeAlerts.length}
              </span>
            </h3>
            <p className="text-[10px] text-slate-500 font-bold">
              In notified patients ke follow-up actions baaki hain
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={copyWhatsAppList}
          className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 hover:bg-emerald-200 border border-emerald-300 px-3 py-1.5 rounded-xl transition-all active:scale-95 flex items-center gap-1 shrink-0 shadow-2xs"
          title="Share on WhatsApp"
        >
          <span>📱</span> WhatsApp List
        </button>
      </div>

      {/* Quick Category Summary Filter Pills */}
      <div className="flex flex-wrap gap-1.5 mb-3.5">
        <button
          type="button"
          onClick={() => setSelectedFilter('ALL')}
          className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl transition-all ${
            selectedFilter === 'ALL'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'bg-white/80 text-slate-600 hover:bg-white border border-slate-200/70'
          }`}
        >
          All ({cascadeAlerts.length})
        </button>

        {hivCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter('HIV')}
            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 ${
              selectedFilter === 'HIV'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-purple-50 text-purple-800 border border-purple-200/80 hover:bg-purple-100'
            }`}
          >
            <span>🧪</span> HIV &amp; DM ({hivCount})
          </button>
        )}

        {diffTbCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter('DIFF_TB')}
            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 ${
              selectedFilter === 'DIFF_TB'
                ? 'bg-pink-700 text-white shadow-xs'
                : 'bg-pink-50 text-pink-800 border border-pink-200/80 hover:bg-pink-100'
            }`}
          >
            <span>🩺</span> Diff TB ({diffTbCount})
          </button>
        )}

        {dbtCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter('DBT')}
            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 ${
              selectedFilter === 'DBT'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100'
            }`}
          >
            <span>💳</span> DBT ({dbtCount})
          </button>
        )}

        {contactCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter('CONTACT')}
            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 ${
              selectedFilter === 'CONTACT'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-blue-50 text-blue-800 border border-blue-200/80 hover:bg-blue-100'
            }`}
          >
            <span>👥</span> Contact ({contactCount})
          </button>
        )}

        {udstCount > 0 && (
          <button
            type="button"
            onClick={() => setSelectedFilter('UDST')}
            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 ${
              selectedFilter === 'UDST'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 hover:bg-emerald-100'
            }`}
          >
            <span>🔬</span> UDST ({udstCount})
          </button>
        )}
      </div>

      {/* Live Search Bar for Full View */}
      {fullView && cascadeAlerts.length > 2 && (
        <div className="relative mb-3.5">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 text-xs">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Patient ID or Notification Date..."
            className="w-full pl-8 pr-8 py-2 bg-white border border-rose-200/80 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Patients Action Cards */}
      <div className={`space-y-2 overflow-y-auto pr-1 custom-scrollbar ${fullView ? 'max-h-[32rem]' : 'max-h-72'}`}>
        {displayedAlerts.length === 0 && (
          <div className="bg-white/80 border border-slate-200/80 rounded-2xl p-6 text-center text-xs font-bold text-slate-500">
            {searchQuery ? `No pending patients match "${searchQuery}"` : `No pending patients found for ${selectedFilter} filter.`}
          </div>
        )}
        {displayedAlerts.map((alt, idx) => {
          const isUrgent = alt.days_elapsed > 7;
          return (
            <div
              key={idx}
              className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs hover:shadow-xs transition-all flex flex-col gap-2"
            >
              {/* Top Meta Line: ID, elapsed days, and copy button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                    #{alt.id}
                  </span>
                  {alt.notified_date && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      Notified: {alt.notified_date}
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                      isUrgent
                        ? 'bg-rose-100 text-rose-700 animate-pulse'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {alt.days_elapsed}d pending
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(alt.id);
                      showToast(`Patient #${alt.id} copied!`, "success");
                    }
                  }}
                  className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors p-1"
                  title="Copy Patient ID"
                >
                  📋
                </button>
              </div>

              {/* 1-Tap Action Autofill Buttons */}
              <div className="flex flex-wrap gap-1.5 items-center">
                {(alt.missing_items || []).map((m, mIdx) => {
                  const alreadyAdded = (formData && formData[m.key] ? formData[m.key] : []).includes(alt.id);
                  const btnColorClass =
                    m.color === 'purple'
                      ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-600 hover:text-white'
                      : m.color === 'pink'
                      ? 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-600 hover:text-white'
                      : m.color === 'amber'
                      ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-600 hover:text-white'
                      : m.color === 'blue'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-600 hover:text-white'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-600 hover:text-white';

                  if (alreadyAdded) {
                    return (
                      <span
                        key={mIdx}
                        className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-xl flex items-center gap-1 opacity-90"
                      >
                        <span>✓ Added to</span>
                        <span className="font-extrabold">{m.label}</span>
                      </span>
                    );
                  }

                  return (
                    <button
                      key={mIdx}
                      type="button"
                      onClick={() => onAutofill && onAutofill(m.key, alt.id, m.label)}
                      className={`text-[10px] font-bold border px-2.5 py-1 rounded-xl transition-all active:scale-95 flex items-center gap-1 shadow-2xs ${btnColorClass}`}
                      title={`Tap to autofill #${alt.id} into ${m.label}`}
                    >
                      <span>+ {m.label}</span>
                      <span>{m.icon || '➕'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expand / Collapse Footer (only shown when not in fullView) */}
      {!fullView && filteredAlerts.length > 3 && (
        <div className="text-center mt-2.5 pt-2 border-t border-rose-200/50">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 transition-colors"
          >
            {isExpanded ? '▴ Show Less' : `▾ View All ${filteredAlerts.length} Pending Patients`}
          </button>
        </div>
      )}
    </div>
  );
};

// --- Editable Categories for 24h Edit Modal ---
const EDITABLE_CATEGORIES = [
  { key: 'notification', label: 'TB Notification' },
  { key: 'sample_tested', label: 'Samples Tested (Lab)' },
  { key: 'sample_collection', label: 'Sample Collection' },
  { key: 'presumptive', label: 'Presumptive TB' },
  { key: 'dbt', label: 'DBT (Bank Linking)' },
  { key: 'hiv_dm', label: 'HIV & DM Screening' },
  { key: 'fdc_provided', label: 'FDC Provided' },
  { key: 'contact_tracing', label: 'Contact Tracing' },
  { key: 'differentiated_tb', label: 'Differentiated TB' },
  { key: 'outcome_assigned', label: 'Outcome Assigned' },
  { key: 'home_visit', label: 'Home Visit' },
  { key: 'follow_up', label: 'Follow Up' },
  { key: 'documents', label: 'Documents Collection' },
  { key: 'face_to_face', label: 'Face to Face Counselling' },
  { key: 'tpt_treatment_start', label: 'TPT Treatment Start' },
  { key: 'tpt_presumptive', label: 'TPT Presumptive' },
  { key: 'adhar_face_authentication', label: 'Aadhaar Face Auth' },
  { key: 'consent_with_id', label: 'Consent with ID' },
  { key: 'culture_dst', label: 'Culture / DST' },
  { key: 'kit_consumption', label: 'Kit Consumption' }
];

// --- My Profile Dashboard ---
const MyProfileDashboard = ({ 
  formData, 
  showToast, 
  stats: propStats,
  setStats: propSetStats,
  onRefreshStats
}) => {
  const [internalStats, setInternalStats] = useState(null);
  const stats = propStats !== undefined ? propStats : internalStats;
  const setStats = propSetStats || setInternalStats;
  const [selectedDate, setSelectedDate] = useState(() => getLocalYMD());
  const [copiedKey, setCopiedKey] = useState(null);
  const [editingModal, setEditingModal] = useState(null);
  const [loading, setLoading] = useState(!stats);

  useEffect(() => {
    if (stats) {
      setLoading(false);
      return;
    }
    const fetchStats = async () => {
      try {
        setLoading(true);
        const today = new Date();
        const monthStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/my-profile-stats`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
             working_place: formData.working_place, 
             fo_name: formData.fo_name, 
             pin: formData.pin, 
             month: monthStr 
          })
        });
        const data = await res.json();
        if(data.success) {
          setStats(data);
        } else {
          showToast("Error loading profile", "error");
        }
      } catch(err) {
        showToast("Network error", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [formData, stats, setStats]);


  const handleExecuteIdEdit = async (e) => {
    e.preventDefault();
    if (!editingModal) return;
    const { date, category, action, oldId, newId } = editingModal;
    
    const cleanCatKey = (category || 'notification').replace(/_ids$/, '');
    const isLegacyAllowed = ['fdc_provided', 'outcome_assigned'].includes(cleanCatKey);
    const cleanId = (newId || '').trim();
    const isValidLen = isLegacyAllowed ? (cleanId.length === 8 || cleanId.length === 9) : (cleanId.length === 9);

    if (action !== 'delete' && (!cleanId || !isValidLen || !/^\d+$/.test(cleanId))) {
      setEditingModal(prev => ({ 
        ...prev, 
        error: isLegacyAllowed 
          ? "Patient ID must be 8 or 9 digits (numbers only)." 
          : "Patient ID must be exactly 9 digits (numbers only)." 
      }));
      return;
    }

    setEditingModal(prev => ({ ...prev, loading: true, error: "" }));

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/reports/edit-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          working_place: formData.working_place,
          fo_name: formData.fo_name,
          date: date,
          category: cleanCatKey,
          action: action,
          old_id: oldId,
          new_id: newId ? newId.trim() : "",
          pin: formData.pin,
          edited_by: "FO"
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || "ID updated successfully!", "success");
        // Update local stats in memory
        setStats(prev => {
          if (!prev || !prev.daily_history || !prev.daily_history[date]) return prev;
          const updatedHistory = { ...prev.daily_history };
          const day = { ...updatedHistory[date] };
          const cats = { ...(day.categories || {}) };
          cats[cleanCatKey] = data.updated_ids;
          delete cats[cleanCatKey + '_ids'];
          day.categories = cats;
          day.total_ids = Object.values(cats).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
          updatedHistory[date] = day;

          const updatedBreakdown = { ...(prev.breakdown || {}) };
          if (updatedBreakdown[cleanCatKey] !== undefined) {
            const countDiff = action === 'add' ? 1 : action === 'delete' ? -1 : 0;
            updatedBreakdown[cleanCatKey] = Math.max(0, updatedBreakdown[cleanCatKey] + countDiff);
          }

          return {
            ...prev,
            daily_history: updatedHistory,
            breakdown: updatedBreakdown
          };
        });
        setEditingModal(null);
      } else {
        setEditingModal(prev => ({ ...prev, error: data.detail || "Failed to update ID.", loading: false }));
      }
    } catch (err) {
      setEditingModal(prev => ({ ...prev, error: "Network error. Please try again.", loading: false }));
    }
  };

  const generateDateWhatsAppSummary = (dateStr, dayData) => {
    if (!dayData || !dayData.submitted) return '';
    let text = `*Daily Field Report - ${dateStr}*\n`;
    text += `*Name:* ${formData.fo_name} (${formData.working_place})\n`;
    text += `*Designation:* Field Officer\n`;
    text += `*Status:* Report Submitted ✓\n\n`;

    if (dayData.visited_names && dayData.visited_names.length > 0) {
      text += `*Doctors/Stores Visited:*\n`;
      text += dayData.visited_names.join('\n') + '\n\n';
    }

    text += `*Work Metrics:*\n`;

    const categoriesConfig = [
      { key: 'notification', label: 'Notification' },
      { key: 'hiv_dm', label: 'HIV & DM' },
      { key: 'dbt', label: 'DBT' },
      { key: 'sample_collection', label: 'Sample Collection' },
      { key: 'sample_tested', label: 'Sample Tested' },
      { key: 'outcome_assigned', label: 'Outcome Assigned' },
      { key: 'home_visit', label: 'Home Visit' },
      { key: 'contact_tracing', label: 'Contact Tracing' },
      { key: 'follow_up', label: 'Follow Up' },
      { key: 'face_to_face', label: 'Face to Face' },
      { key: 'presumptive', label: 'Presumptive' },
      { key: 'documents', label: 'Documents' },
      { key: 'fdc_provided', label: 'FDC Provided' },
      { key: 'kit_consumption', label: 'Kit Consumption' },
      { key: 'differentiated_tb', label: 'Differentiated TB' },
      { key: 'tpt_treatment_start', label: 'TPT Treatment Start' },
      { key: 'tpt_presumptive', label: 'TPT Presumptive' },
      { key: 'adhar_face_authentication', label: 'Adhar Face Auth' },
      { key: 'consent_with_id', label: 'Consent with ID' },
      { key: 'culture_dst', label: 'Culture / DST' }
    ];

    let hasMetrics = false;
    categoriesConfig.forEach(cat => {
      const ids = (dayData.categories && (dayData.categories[cat.key] || dayData.categories[cat.key + '_ids'])) || [];
      if (ids.length > 0) {
        hasMetrics = true;
        text += `\n*${cat.label}:* ${ids.length}\n`;
        if (cat.key.includes('fdc') && dayData.fdc_details && dayData.fdc_details.length > 0) {
          const fdcLines = ids.map(id => {
            const det = dayData.fdc_details.find(d => d && d.id === id);
            return det ? `${id} (${det.fdc_type || 'FDC 4'}, ${det.strips || 1} Strip)` : id;
          });
          text += fdcLines.join('\n') + '\n';
        } else {
          text += ids.join('\n') + '\n';
        }
      }
    });

    if (!hasMetrics) {
      text += '\nNone\n';
    }

    if (dayData.remark && dayData.remark.trim() !== '') {
      text += `\n*Remarks:*\n` + dayData.remark.trim() + '\n';
    }
    return text.trim();
  };

  const copyDateWhatsAppSummary = (dateStr, dayData) => {
    const text = generateDateWhatsAppSummary(dateStr, dayData);
    if (!text) {
      showToast("No report submitted on this date", "info");
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(`📋 WhatsApp summary copied for ${dateStr}!`, 'success'))
        .catch(() => showToast('Failed to copy to clipboard', 'error'));
    } else {
      showToast('Clipboard access unavailable', 'error');
    }
  };

  const shareDateWhatsAppSummary = (dateStr, dayData) => {
    const text = generateDateWhatsAppSummary(dateStr, dayData);
    if (!text) {
      showToast("No report submitted on this date", "info");
      return;
    }
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  const breakdown = stats?.breakdown || {};
  const workingDaysInfo = stats?.working_days_info;
  const targetVal = Number(stats?.target) || 50;
  const notifAchieved = Number(breakdown?.notification) || 0;
  const percent = targetVal > 0 ? Math.min(100, Math.round((notifAchieved / targetVal) * 100)) : 0;
  const remainingTarget = Math.max(0, targetVal - notifAchieved);

  const totalWorkingDays = workingDaysInfo?.total_working_days || 24;
  const elapsedWorkingDays = workingDaysInfo?.elapsed_working_days || 1;
  const remainingWorkingDays = workingDaysInfo?.remaining_working_days || 0;
  const declaredHolidays = workingDaysInfo?.declared_holidays || 1;

  const requiredRunRate = workingDaysInfo?.required_run_rate ?? (remainingWorkingDays > 0 ? Number((remainingTarget / remainingWorkingDays).toFixed(1)) : remainingTarget);
  const currentRunRate = workingDaysInfo?.current_run_rate ?? (elapsedWorkingDays > 0 ? Number((notifAchieved / elapsedWorkingDays).toFixed(1)) : 0);
  const expectedToDate = workingDaysInfo?.expected_to_date ?? Math.round((targetVal * elapsedWorkingDays) / Math.max(1, totalWorkingDays));
  const paceDiff = workingDaysInfo?.pace_diff ?? (notifAchieved - expectedToDate);
  const expectedPercent = targetVal > 0 ? Math.min(100, Math.round((expectedToDate / targetVal) * 100)) : 0;

  const isTargetAchieved = notifAchieved >= targetVal && targetVal > 0;
  const numReqRunRate = Number(requiredRunRate) || 0;

  const coachingMessage = useMemo(() => {
    if (isTargetAchieved) {
      return "Zabardast! Aapne is mahine ka target poora kar liya hai. Ab har nayi notification aapke record ko aur uncha karegi. Keep it up!";
    }
    if (paceDiff > 0) {
      return `Bahut khoob! Aap expected pace se ${paceDiff} notification${paceDiff > 1 ? 's' : ''} aage chal rahe hain. Target cross karne ke liye roz ${currentRunRate}/day ki speed banaye rakhein.`;
    }
    if (paceDiff === 0) {
      return `Aap bilkul sahi schedule par hain. Mahine ke ant tak 100% target poora karne ke liye baaki ${remainingWorkingDays} dino mein roz ${requiredRunRate} notifications karte rahein.`;
    }
    // Behind pace
    if (remainingWorkingDays > 0) {
      return `Aap expected pace se ${Math.abs(paceDiff)} notification${Math.abs(paceDiff) > 1 ? 's' : ''} peeche hain. Baki bache ${remainingWorkingDays} working days mein target complete karne ke liye roz kam se kam ${requiredRunRate} notifications darj karein.`;
    }
    return "Mahine ka aakhri din hai! Bacha hua target poora karne ke liye aaj hi zaroori notifications report karein.";
  }, [isTargetAchieved, paceDiff, currentRunRate, remainingWorkingDays, requiredRunRate]);

  const last7Days = useMemo(() => {
    const list = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = getLocalYMD(d);
      const dayName = d.toLocaleDateString('en-IN', { weekday: 'short' });
      const dayNum = d.getDate();
      const isSubmitted = Boolean(stats?.daily_history?.[dateStr]?.submitted);
      const isToday = i === 0;
      list.push({ dateStr, dayName, dayNum, isSubmitted, isToday });
    }
    return list;
  }, [stats]);
  
  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in pb-10">
      {/* Profile Header & Monthly Target Card */}
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-indigo-100/50 border border-slate-100 mb-6 text-center">
        <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-3 font-black">
          {(formData.fo_name || 'U').charAt(0)}
        </div>
        <h2 className="text-2xl font-black text-slate-800">{formData.fo_name}</h2>
        <p className="text-slate-500 font-bold text-sm tracking-wider uppercase">{formData.working_place}</p>
        
        {loading ? (
          <div className="flex flex-col items-center justify-center p-6 mt-4">
            <svg className="animate-spin h-7 w-7 text-indigo-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p className="text-slate-400 font-bold tracking-widest text-[11px] uppercase">Loading Stats & Target...</p>
          </div>
        ) : !stats ? (
          <div className="w-full text-center p-4 border-t border-slate-100 mt-4">
            <p className="text-slate-500 font-bold text-xs">Profile target data load nahi ho paya.</p>
            <button onClick={() => window.location.reload()} className="mt-2 bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-indigo-100">Retry</button>
          </div>
        ) : (
          <>
            {/* Streak Counter & Milestone Badges */}
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1 rounded-full text-xs font-black shadow-sm">
                <span>🔥</span>
                <span>{stats.streak_days || 0} Day Streak</span>
              </span>
              {stats.total_km > 0 && (
                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-full text-xs font-black shadow-sm">
                  <span>🛵</span>
                  <span>{stats.total_km} KM Travelled</span>
                </span>
              )}
            </div>

            {/* 7-Day Activity & Attendance Roster */}
            <div className="mt-5 p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/70 text-left">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                  <span>📅</span> Last 7 Days Activity
                </span>
                <span className="text-[9px] font-bold text-slate-400">
                  Tap day to inspect
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {last7Days.map(item => {
                  const isSelected = selectedDate === item.dateStr;
                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(item.dateStr)}
                      className={`flex flex-col items-center py-2 px-1 rounded-xl transition-all cursor-pointer border ${
                        isSelected 
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm scale-105' 
                          : item.isSubmitted 
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200' 
                            : 'bg-white hover:bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                      title={`${item.dateStr}: ${item.isSubmitted ? 'Report Submitted' : 'No Report'}`}
                    >
                      <span className="text-[9px] font-bold uppercase">{item.dayName}</span>
                      <span className="text-xs font-black my-0.5">{item.dayNum}</span>
                      <span className="text-[10px] leading-none">
                        {item.isSubmitted ? '✓' : '•'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {stats.badges && stats.badges.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {stats.badges.map(b => (
                  <div key={b.id} className="bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all" title={b.desc}>
                    <span className="text-sm">{b.icon}</span>
                    <span className="text-[11px] font-black text-slate-700">{b.title}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Modern Glassmorphic Field Command Card */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-indigo-500/20 relative overflow-hidden mt-6 text-left">
              {/* Subtle ambient backdrop glows */}
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

              {/* Header Bar */}
              <div className="flex items-center justify-between gap-2 mb-4 relative z-10">
                {/* Status Pill with live pulse dot */}
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black border backdrop-blur-md shadow-sm ${
                  isTargetAchieved
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40'
                    : paceDiff > 0
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-cyan-950/40'
                      : paceDiff === 0
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-950/40'
                }`}>
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      isTargetAchieved
                        ? 'bg-emerald-400'
                        : paceDiff > 0
                          ? 'bg-cyan-400'
                          : paceDiff === 0
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                    }`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      isTargetAchieved
                        ? 'bg-emerald-400'
                        : paceDiff > 0
                          ? 'bg-cyan-400'
                          : paceDiff === 0
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                    }`}></span>
                  </span>
                  <span>
                    {isTargetAchieved
                      ? '🏆 Target Completed!'
                      : paceDiff > 0
                        ? `🚀 Ahead of Pace (+${paceDiff})`
                        : paceDiff === 0
                          ? '🟢 On Track'
                          : `⚠️ Needs Acceleration (${Math.abs(paceDiff)} behind)`}
                  </span>
                </div>

                {/* Current Velocity Tag */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-200 text-xs font-bold backdrop-blur-sm shadow-inner">
                  <span className="text-indigo-400">⚡</span>
                  <span className="text-[11px] sm:text-xs">Velocity: <span className="font-black text-white">{currentRunRate}</span>/day</span>
                </div>
              </div>

              {/* Dual-Track Progress Section */}
              <div className="my-5 relative z-10 pt-5 pb-1">
                {/* Expected Benchmark Tooltip above track */}
                <div 
                  className="absolute top-0 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-500"
                  style={{ left: `${Math.min(94, Math.max(6, expectedPercent))}%` }}
                >
                  <span className="px-1.5 py-0.5 bg-slate-800/95 border border-amber-400/50 text-amber-300 rounded text-[9px] font-extrabold shadow-md whitespace-nowrap">
                    Today's Pace: {expectedToDate}
                  </span>
                  <span className="w-0.5 h-1.5 bg-amber-400/90"></span>
                </div>

                {/* Outer Track */}
                <div className="bg-slate-800/80 rounded-full h-4 relative overflow-visible border border-slate-700/50">
                  {/* Fill Bar */}
                  <div 
                    className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 h-full rounded-full transition-all duration-700 shadow-sm"
                    style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                  />

                  {/* Benchmark Pin Indicator */}
                  <div 
                    className="absolute -top-1 bottom-0 w-1.5 bg-amber-400 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.9)] -translate-x-1/2 z-10 h-6 -mt-0.5 border border-slate-900"
                    style={{ left: `${Math.min(100, Math.max(0, expectedPercent))}%` }}
                    title={`Today's Expected Benchmark: ${expectedToDate} notifications`}
                  />
                </div>

                {/* Progress Scale Labels */}
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mt-2 px-0.5">
                  <span>0%</span>
                  <span className="text-slate-300 font-extrabold">{percent}% Achieved</span>
                  <span>100%</span>
                </div>
              </div>

              {/* 4-Metric Grid */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 my-4 relative z-10">
                {/* Metric 1: Target */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 sm:p-3.5 flex flex-col backdrop-blur-sm">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <span>🎯</span> Target
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-white mt-1.5">{targetVal}</span>
                  <span className="text-[10px] text-slate-400 font-semibold mt-0.5">Monthly Goal</span>
                </div>

                {/* Metric 2: Achieved */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 sm:p-3.5 flex flex-col backdrop-blur-sm">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <span>✅</span> Achieved
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1.5">
                    <span className="text-xl sm:text-2xl font-black text-emerald-400">{notifAchieved}</span>
                    <span className="text-xs font-bold text-slate-400">({percent}%)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    {remainingTarget > 0 ? `${remainingTarget} pending` : 'Target crushed!'}
                  </span>
                </div>

                {/* Metric 3: Days Left */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 sm:p-3.5 flex flex-col backdrop-blur-sm">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <span>📅</span> Days Left
                  </span>
                  <div className="flex items-baseline gap-1.5 mt-1.5">
                    <span className="text-xl sm:text-2xl font-black text-white">{remainingWorkingDays}</span>
                    <span className="text-xs font-bold text-slate-300">Working Days</span>
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-indigo-300/80 font-medium mt-0.5 leading-tight">
                    Sundays & {declaredHolidays} {declaredHolidays === 1 ? 'holiday' : 'holidays'} off
                  </span>
                </div>

                {/* Metric 4: Required Run-Rate */}
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-3 sm:p-3.5 flex flex-col backdrop-blur-sm">
                  <span className="text-[10px] sm:text-[11px] font-black text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <span>⚡</span> Req. Run-Rate
                  </span>
                  <div className="flex items-baseline gap-1 mt-1.5">
                    <span className={`text-xl sm:text-2xl font-black ${
                      isTargetAchieved || numReqRunRate <= 2
                        ? 'text-emerald-400'
                        : numReqRunRate <= 4
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}>
                      {requiredRunRate}
                    </span>
                    <span className="text-xs font-bold text-slate-400">/ Day</span>
                  </div>
                  <span className={`text-[10px] font-bold mt-0.5 ${
                    isTargetAchieved || numReqRunRate <= 2
                      ? 'text-emerald-300'
                      : numReqRunRate <= 4
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }`}>
                    {isTargetAchieved
                      ? 'Goal Achieved! 🎉'
                      : numReqRunRate <= 2
                        ? 'Comfortable Pace'
                        : numReqRunRate <= 4
                          ? 'Moderate Effort'
                          : 'Sprint Required'}
                  </span>
                </div>
              </div>

              {/* Contextual Hindi Coaching Box */}
              <div className="bg-indigo-950/60 border border-indigo-500/30 rounded-2xl p-3.5 sm:p-4 text-xs font-medium leading-relaxed text-indigo-100 flex items-start gap-2.5 backdrop-blur-sm relative z-10 mt-3">
                <span className="text-base sm:text-lg flex-shrink-0 mt-0.5">
                  {isTargetAchieved ? '🏆' : paceDiff > 0 ? '🚀' : paceDiff === 0 ? '🎯' : '💡'}
                </span>
                <div className="flex-1 text-left">
                  <p className="font-bold text-white text-[11px] sm:text-xs mb-0.5">
                    {isTargetAchieved 
                      ? 'Target Mubarak!' 
                      : paceDiff > 0 
                        ? 'Shandar Raftar!' 
                        : paceDiff === 0 
                          ? 'Sahi Disha Mein!' 
                          : 'Coaching Tip & Target Guidance'}
                  </p>
                  <p className="text-indigo-200/90 text-[11px] sm:text-xs leading-normal">
                    {coachingMessage}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 30-Day Activity Calendar */}
      {stats && (
        <>
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6">
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            Monthly Activity Calendar ({new Date().toLocaleString('default', { month: 'short' })} {new Date().getFullYear()})
          </h3>
          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Report Submitted</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> No Report</span>
          </div>
        </div>

        {(() => {
          const calNow = new Date();
          const currentYear = calNow.getFullYear();
          const currentMonth = calNow.getMonth();
          const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
          const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
          // Monday-first offset: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
          const firstDayOffset = (firstDayOfWeek + 6) % 7;

          return (
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <span key={i} className="text-[10px] font-black text-slate-400 py-1">{d}</span>
              ))}
              {Array.from({ length: firstDayOffset }, (_, i) => (
                <div key={`cal-empty-${i}`} className="h-9 pointer-events-none" aria-hidden="true" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayData = stats.daily_history && stats.daily_history[dateKey];
                const count = dayData ? dayData.count : 0;
                const isToday = calNow.getDate() === dayNum && calNow.getMonth() === currentMonth && calNow.getFullYear() === currentYear;

                let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
                if (count > 0) {
                  bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
                }

                return (
                  <div 
                    key={dayNum} 
                    onClick={() => setSelectedDate(dateKey)}
                    className={`h-9 rounded-xl flex flex-col items-center justify-center text-xs font-bold border transition-all cursor-pointer hover:scale-105 active:scale-95 ${bgColor} ${selectedDate === dateKey ? 'ring-2 ring-indigo-600 ring-offset-2' : isToday ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                    title={dayData && dayData.submitted ? `${dateKey}: ${count} report(s), ${dayData.total_ids} IDs (Click to view)` : `${dateKey}: No report`}
                  >
                    <span>{dayNum}</span>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Date-wise Reported IDs Inspector */}
      {selectedDate && (() => {
        const selectedDayData = stats.daily_history && stats.daily_history[selectedDate];
        const isDateEditable = (() => {
          if (!selectedDate) return false;
          const now = new Date();
          const getLocalYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          const todayStr = getLocalYMD(now);
          if (selectedDate === todayStr) return true;

          const yesterday = new Date();
          yesterday.setDate(now.getDate() - 1);
          const yesterdayStr = getLocalYMD(yesterday);
          if (selectedDate === yesterdayStr) return true;

          // Also check actual completion timestamp if available on day record
          if (selectedDayData && (selectedDayData.timestamp_completed || selectedDayData.timestamp)) {
            const rawTs = selectedDayData.timestamp_completed || selectedDayData.timestamp;
            const subTime = new Date(rawTs).getTime();
            if (!isNaN(subTime) && (Date.now() - subTime) <= 24 * 60 * 60 * 1000) {
              return true;
            }
          }
          return false;
        })();

        return (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📋</span> Reported IDs on {selectedDate}
                </h4>
                <p className="text-[10px] text-slate-400 font-semibold">
                  {selectedDayData && selectedDayData.submitted ? `${selectedDayData.total_ids} Total IDs Recorded` : 'No report submitted on this date'}
                </p>
              </div>
              {selectedDayData && selectedDayData.submitted && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => shareDateWhatsAppSummary(selectedDate, selectedDayData)}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Share directly to WhatsApp"
                  >
                    <span>💬</span>
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyDateWhatsAppSummary(selectedDate, selectedDayData)}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Copy full reporting summary for WhatsApp"
                  >
                    <span>📋</span>
                    <span>Copy</span>
                  </button>
                  {isDateEditable ? (
                    <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-xl border border-emerald-200" title="Aap 24 ghante ke andar IDs edit/correct kar sakte hain">
                      ⏱️ 24h Edit Open
                    </span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 px-2.5 py-1.5 rounded-xl border border-slate-200" title="24h beet chuke hain. Badlav ke liye Admin se contact karein.">
                      🔒 Edit Locked
                    </span>
                  )}
                </div>
              )}
            </div>

            {selectedDayData && selectedDayData.submitted ? (
              <div className="space-y-3">
                {isDateEditable && (
                  <button
                    type="button"
                    onClick={() => setEditingModal({ 
                      date: selectedDate, 
                      category: 'notification', 
                      action: 'add', 
                      oldId: '', 
                      newId: '', 
                      error: '' 
                    })}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                  >
                    <span>➕</span>
                    <span>Add Missing Patient ID (24h Edit)</span>
                  </button>
                )}

                {selectedDayData.visited_names && selectedDayData.visited_names.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Visited Doctors / Stores</span>
                    <p className="font-bold text-slate-700">{selectedDayData.visited_names.join(', ')}</p>
                  </div>
                )}

                {/* Show note if day has 0 IDs recorded (Remarks-only submission) */}
                {Object.values(selectedDayData.categories || {}).flat().length === 0 && (
                  <div className="p-4 bg-slate-50/90 rounded-2xl border border-dashed border-slate-200 text-center space-y-1">
                    <p className="text-xs font-bold text-slate-700">Is date ko koi Patient ID darj nahi hai (Remarks-only report).</p>
                    {isDateEditable ? (
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Aap upar diye gaye <strong>"+ Add Missing Patient ID"</strong> button se category select karke ID add kar sakte hain.
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-medium">24 ghante beet chuke hain, ID add ya modify karne ke liye Admin se contact karein.</p>
                    )}
                  </div>
                )}

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {Object.entries(selectedDayData.categories || {}).map(([catKey, idList]) => {
                    if (!idList || idList.length === 0) return null;
                    const label = catKey.replace(/_/g, ' ').toUpperCase();
                    return (
                      <div key={catKey} className="bg-slate-50/90 p-3 rounded-2xl border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[11px] font-black text-slate-700">{label} ({idList.length})</span>
                          <div className="flex items-center gap-1.5">
                            {isDateEditable && (
                              <button
                                type="button"
                                onClick={() => setEditingModal({ date: selectedDate, category: catKey, action: 'add', oldId: '', newId: '', error: '' })}
                                className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-0.5"
                                title="Add missing ID"
                              >
                                <span>+</span> Add ID
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (navigator.clipboard) {
                                  navigator.clipboard.writeText(idList.join('\n'));
                                  setCopiedKey(catKey);
                                  setTimeout(() => setCopiedKey(null), 2000);
                                }
                              }}
                              className="text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg transition-colors"
                            >
                              {copiedKey === catKey ? '✓ Copied' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {idList.map((id, idx) => (
                            <div key={idx} className="inline-flex items-center gap-1 font-mono text-xs font-bold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-lg shadow-sm group">
                              <span>{id}</span>
                              {isDateEditable && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setEditingModal({ date: selectedDate, category: catKey, action: 'replace', oldId: id, newId: id, error: '' })}
                                    className="text-slate-400 hover:text-indigo-600 text-[10px] p-0.5"
                                    title="Edit / Correct this ID"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingModal({ date: selectedDate, category: catKey, action: 'delete', oldId: id, newId: '', error: '' })}
                                    className="text-slate-400 hover:text-red-500 text-[10px] p-0.5"
                                    title="Delete this ID"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isDateEditable && (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200/70 text-[11px] text-amber-800 font-semibold flex items-center gap-2">
                    <span>🔒</span>
                    <span>24 ghante beet chuke hain isliye editing lock hai. Badlav ke liye Admin se contact karein.</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-center py-6 text-xs text-slate-400 font-medium">Is date ko koi report submit nahi ki gayi thi.</p>
            )}
          </div>
        );
      })()}

      {/* FO Patient ID Edit / Correction Modal */}
      {editingModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div>
                <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                  {editingModal.action === 'replace' ? '✏️ Correct Patient ID' : editingModal.action === 'delete' ? '🗑️ Remove Patient ID' : '➕ Add Missing Patient ID'}
                </h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {editingModal.action === 'add' 
                    ? `24H Edit Window \u2022 ${editingModal.date}`
                    : `${(editingModal.category || '').replace(/_ids$/, '').replace(/_/g, ' ').toUpperCase()} \u2022 ${editingModal.date}`
                  }
                </p>
              </div>
              <button onClick={() => setEditingModal(null)} className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none">&times;</button>
            </div>

            <form onSubmit={handleExecuteIdEdit} className="space-y-3">
              {editingModal.action === 'add' && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    Select Category / Indicator:
                  </label>
                  <select
                    value={(editingModal.category || 'notification').replace(/_ids$/, '')}
                    onChange={(e) => setEditingModal(prev => ({ ...prev, category: e.target.value, error: '' }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                  >
                    {EDITABLE_CATEGORIES.map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {editingModal.action === 'delete' ? (
                <div className="p-3 bg-red-50 rounded-2xl border border-red-100 text-center">
                  <p className="text-xs font-bold text-red-800 mb-1">Kya aap sach me ID <strong className="font-mono text-sm">{editingModal.oldId}</strong> ko delete karna chahte hain?</p>
                  <p className="text-[10px] text-red-500">Yeh ID database aur aapke report count se hat jayegi.</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                    {editingModal.action === 'replace' 
                      ? `Replace ID #${editingModal.oldId} With:` 
                      : (['fdc_provided', 'outcome_assigned', 'fdc_provided_ids', 'outcome_assigned_ids'].includes(editingModal.category) ? 'Enter 8 or 9-Digit Patient ID:' : 'Enter 9-Digit Patient ID:')
                    }
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={9}
                    value={editingModal.newId}
                    onChange={(e) => setEditingModal(prev => ({ ...prev, newId: e.target.value.replace(/\D/g, '') }))}
                    placeholder={['fdc_provided', 'outcome_assigned', 'fdc_provided_ids', 'outcome_assigned_ids'].includes(editingModal.category) ? "e.g. 12345678 or 332882518" : "e.g. 332882518"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-sm font-black text-slate-800 tracking-wider outline-none focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {['fdc_provided', 'outcome_assigned', 'fdc_provided_ids', 'outcome_assigned_ids'].includes(editingModal.category) 
                      ? "Must be 8 or 9 digits (legacy ID allowed)." 
                      : "Must be exactly 9 digits."
                    }
                  </p>
                </div>
              )}

              {editingModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2 rounded-xl border border-red-100">{editingModal.error}</p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setEditingModal(null)} className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">Cancel</button>
                <button
                  type="submit"
                  disabled={editingModal.loading}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-md active:scale-[0.98] transition-all cursor-pointer ${editingModal.action === 'delete' ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' : 'bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 shadow-teal-700/20'}`}
                >
                  {editingModal.loading ? 'Saving...' : editingModal.action === 'delete' ? 'Confirm Delete' : 'Save ID'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 px-2">Work Breakdown</h3>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(breakdown).filter(([, v]) => Number(v) > 0).length === 0 ? (
          <p className="col-span-2 text-xs text-slate-400 font-medium text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            Abhi tak is mahine koi work record darj nahi hua hai.
          </p>
        ) : (
          Object.entries(breakdown).map(([k, v]) => {
            if (!v || v === 0) return null;
            const label = k.replace(/_/g, " ");
            return (
              <div key={k} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider truncate mr-2">{label}</span>
                <span className="text-lg font-black text-slate-800">{v}</span>
              </div>
            );
          })
        )}
      </div>
        </>
      )}
    </div>
  );
};

// --- Patient Journey & Nikshay Verification Status Tracker ---
const PatientJourneyTracker = ({ formData, showToast, suggestedIds = [] }) => {
  const [searchId, setSearchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleSearch = async (idToSearch) => {
    const cleanId = String(idToSearch || searchId).trim();
    if (!cleanId) {
      showToast("Kripya Nikshay ID enter karein!", "error");
      return;
    }
    if (!(cleanId.length === 8 || cleanId.length === 9) || isNaN(cleanId)) {
      showToast("Nikshay ID 8 ya 9 digit ki honi chahiye!", "error");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setResult(null);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/reports/patient-journey/${encodeURIComponent(cleanId)}`);
      if (!res.ok) {
        throw new Error("Patient ID server par nahi mila ya network error hai.");
      }
      const data = await res.json();
      if (!data.success || (!data.journey?.length && !data.metadata?.district && !data.metadata?.nikshay_verified)) {
        setError(`Patient #${cleanId} ka koi record nahi mila. Kripya ID dobara check karein.`);
      } else {
        setResult(data);
      }
    } catch (err) {
      console.error("Patient journey fetch error:", err);
      setError(err.message || "Record load karne me samasya aayi.");
    } finally {
      setLoading(false);
    }
  };

  const activeNikshayIndicators = result?.metadata?.nikshay_indicators || [];
  const isNikshayVerified = Boolean(result?.metadata?.nikshay_verified);

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in pb-12">
      {/* Header Card */}
      <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-900 rounded-3xl p-6 text-white shadow-xl shadow-teal-950/20 mb-5 border border-teal-800/50">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-2xl border border-white/20">
            🔍
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Nikshay Patient Tracker</h2>
            <p className="text-xs text-teal-200 font-medium">
              Rogi ki clinical history aur Nikshay verification status dekhein
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }} 
          className="mt-4 flex gap-2"
        >
          <input 
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={9}
            value={searchId}
            onChange={(e) => setSearchId(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter 8 or 9-digit Nikshay ID..."
            className="flex-1 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-sm font-mono font-bold text-white placeholder:text-teal-200/70 outline-none focus:ring-2 focus:ring-teal-400 focus:bg-white/20 transition-all"
          />
          <button
            type="submit"
            disabled={loading || !searchId}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-black px-5 py-3 rounded-2xl shadow-lg shadow-emerald-600/30 text-xs uppercase tracking-wider transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        {suggestedIds && suggestedIds.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 block mb-1.5">
              💡 Today's Session IDs (Tap to inspect):
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto custom-scrollbar">
              {suggestedIds.slice(0, 8).map((sid, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSearchId(sid);
                    handleSearch(sid);
                  }}
                  className="bg-white/10 hover:bg-white/25 text-white border border-white/20 font-mono text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer"
                >
                  #{sid}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold p-4 rounded-2xl mb-4 flex items-center gap-2 animate-fade-in">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Results View */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Patient Overview Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Patient Episode ID</span>
                <h3 className="text-xl font-black font-mono text-slate-800">#{result.patient_id}</h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  District: <strong className="text-slate-700">{result.metadata?.district || formData?.working_place || 'Bihar'}</strong>
                  {result.metadata?.primary_fo && (
                    <span> &bull; Officer: <strong className="text-slate-700">{result.metadata.primary_fo}</strong></span>
                  )}
                </p>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border shadow-2xs ${
                result.is_complete 
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}>
                {result.is_complete ? '✓ Treatment Completed' : '⚡ Active In Care'}
              </span>
            </div>

            {/* Nikshay Reconciler Sync Status Banner */}
            <div className="mt-4">
              {isNikshayVerified ? (
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🔒</span>
                    <div>
                      <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                        Nikshay Official Ledger Verified
                      </h4>
                      <p className="text-[11px] text-emerald-800 font-medium">
                        Admin ne is record ko government Nikshay portal se safaltapoorvak reconcile kar liya hai.
                      </p>
                    </div>
                  </div>

                  {activeNikshayIndicators.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeNikshayIndicators.map((ind, i) => (
                        <span key={i} className="bg-emerald-200/70 border border-emerald-300 text-emerald-900 text-[10px] font-black px-2.5 py-1 rounded-xl">
                          {ind}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="text-xl">⏳</span>
                    <div>
                      <h4 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                        Pending Nikshay Reconciler Sync
                      </h4>
                      <p className="text-[11px] text-amber-800 font-medium mt-0.5 leading-relaxed">
                        Aapka data hamare MIS me 100% surakshit darj hai. DTO / State Admin batch upload me jab Nikshay se ledger match karenge, yahan green verified status update ho jayega.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Clinical Activity Timeline */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span>📋</span>
              <span>Clinical Journey Timeline ({result.journey?.length || 0} Events)</span>
            </h4>

            {(!result.journey || result.journey.length === 0) ? (
              <p className="text-xs text-slate-400 italic py-3 text-center">Is patient ID ki koi activity history nahi mili.</p>
            ) : (
              <div className="relative pl-6 border-l-2 border-indigo-200 space-y-4 my-2">
                {result.journey.map((step, idx) => {
                  const isVerifiedStep = step.category === 'nikshay_verified';
                  return (
                    <div key={idx} className="relative group">
                      {/* Step Dot */}
                      <span className={`absolute -left-[31px] top-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shadow-2xs ${
                        isVerifiedStep 
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-800' 
                          : 'bg-white border-indigo-500 text-indigo-700'
                      }`}>
                        {step.icon || '•'}
                      </span>

                      <div className={`p-3 rounded-2xl border transition-all ${
                        isVerifiedStep 
                          ? 'bg-emerald-50/70 border-emerald-200' 
                          : 'bg-slate-50 border-slate-200/70 group-hover:bg-white'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-black ${isVerifiedStep ? 'text-emerald-950' : 'text-slate-800'}`}>
                            {step.action}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                            {step.date}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-semibold mt-1">
                          By: <strong className="text-slate-700">{step.fo_name}</strong> {step.district ? `(${step.district})` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Field Officer Help, Guidelines & Visual System Workflow Guide ---
const FoHelpGuide = () => {
  const [activeStage, setActiveStage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [openTopic, setOpenTopic] = useState("daily_reporting");

  const stages = [
    {
      id: 1,
      icon: "📝",
      title: "1. Field Entry",
      subtitle: "Daily Field Reporting",
      desc: "Field Officer (FO) gaon, ward, ya clinic me jakar TB patient ki jankari, sample collection, FDC medicine, aur doctor visit darj karte hain.",
      points: [
        "Patient ID hamesha 9-digit (ya 8-digit legacy) darj karein.",
        "Weight KG enter karte hi exact FDC medicine dose auto-calculate ho jati hai.",
        "Visit kiye gaye doctor ya medical store ka naam add karein."
      ]
    },
    {
      id: 2,
      icon: "🔄",
      title: "2. Zero-Loss Sync",
      subtitle: "Offline & Cloud Vault",
      desc: "Agar remote village me internet nahi hai, toh app bina kisi rukawat ke kaam karta hai. Data phone ki internal memory (IndexedDB) me encrypted save hota hai.",
      points: [
        "Network na hone par data phone me 100% surakshit rehta hai.",
        "Internet aate hi top bar ke 'Sync' button se ya automatic Firestore cloud par upload ho jata hai.",
        "Phone restart hone par bhi draft ya offline report delete nahi hoti."
      ]
    },
    {
      id: 3,
      icon: "🔒",
      title: "3. Nikshay Reconciler",
      subtitle: "Admin Cross-Verification",
      desc: "State Coordinator aur District Admin daily reported IDs ko government ke official Nikshay Portal se cross-verify karte hain.",
      points: [
        "Daily Notification Verification Tray se 1-click me Excel format me IDs check hoti hain.",
        "DBT Bank Account, HIV/DM Screening aur UDST test report ko Reconciler Ledger me verify kiya jata hai.",
        "Nikshay portal par verification hote hi record permanent ledger me lock ho jata hai."
      ]
    },
    {
      id: 4,
      icon: "🏁",
      title: "4. Journey & DBT",
      subtitle: "Treatment & Poshan Sahayata",
      desc: "Patient ko pure treatment cycle me regular davaiyan milti hain, aur unka DBT Bank validation complete hone se niyamit Poshan Yojana sahayata milti hai.",
      points: [
        "FO apne 'Tracker' tab me jakar kisi bhi patient ka verified status dekh sakte hain.",
        "Green verified shield dikhne ka matlab hai data Nikshay par sync ho chuka hai.",
        "Outcome assign hone ke baad treatment safely complete mark ho jata hai."
      ]
    }
  ];

  const guideTopics = [
    {
      id: "daily_reporting",
      icon: "📝",
      badge: "SOP Step-by-Step",
      badgeColor: "bg-teal-100 text-teal-800 border-teal-200",
      title: "1. Rozana Daily Report Kaise Bharein",
      subtitle: "Field se report submit karne ka aasan niyam",
      keywords: "report bharna submit daily notification visit dbt fdc remarks travel",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 space-y-1.5">
            <span className="font-black text-teal-900 flex items-center gap-1.5">
              <span>🎯</span>
              <span>Daily Target &amp; Timing:</span>
            </span>
            <p className="text-teal-800 text-[11px]">
              Field Officer ko rozana field visit complete karne ke baad sham <strong>7:00 PM</strong> se pehle apni daily report submit karni hoti hai.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <strong className="text-slate-900 block font-bold">District aur Apna Naam Chunein:</strong>
                <span className="text-slate-600 text-[11px]">App kholte hi apna assigned District aur Dropdown se apna Naam select karein. Duty PIN enter karein.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <strong className="text-slate-900 block font-bold">TB Notification Box (Naye Patients):</strong>
                <span className="text-slate-600 text-[11px]">
                  Jo naye TB confirm patient aaj notify huye hain, unki 9-digit Nikshay ID yahan enter karein. Ek ID likhkar Enter dabayein ya Add karein.
                </span>
                <div className="mt-1.5 bg-indigo-50 border border-indigo-200 rounded-xl p-2.5 text-[11px] text-indigo-900">
                  <strong>💡 WhatsApp Paste Trick:</strong> Agar aapke WhatsApp group ya register me 5-10 IDs ek sath likhi hain, toh poora message copy karke yahan input box me paste kar dein! App automatically saari valid IDs ko extract karke add kar lega.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <strong className="text-slate-900 block font-bold">Other Interventions (Alag-Alag Box):</strong>
                <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-600 mt-1">
                  <li><strong>Home Visit:</strong> Jin patients ke ghar jakar physical counseling ki unki IDs.</li>
                  <li><strong>FDC Dawai:</strong> Jinhe mahine ki dawa strip handover ki unki IDs.</li>
                  <li><strong>DBT Bank Details:</strong> Jinka bank khata / Aadhaar seed kiya.</li>
                  <li><strong>UDST Test:</strong> Jinka Drug Susceptibility sample bheja.</li>
                  <li><strong>Follow-up:</strong> Regular 2/4/6 mahine ki follow-up visit.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
              <div>
                <strong className="text-slate-900 block font-bold">Travel KM &amp; Remarks (Zaroori):</strong>
                <span className="text-slate-600 text-[11px]">
                  Field me chala gaya total kilometer aur aaj ki field activity ka brief remark (jaise gaon ka naam ya camp) darj karke <strong>&ldquo;Submit Daily Report&rdquo;</strong> button dabayein.
                </span>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "duplicate_rules",
      icon: "🚨",
      badge: "Strict NTEP Niyam",
      badgeColor: "bg-rose-100 text-rose-800 border-rose-200",
      title: "2. Duplicate Notification vs Repeat Visit (Lal vs Peela Modal)",
      subtitle: "Galat ID submit hone se bachane wale naye rules",
      keywords: "duplicate notification block repeat visit modal amber red lal peela 90 din",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 space-y-2">
            <span className="font-black text-rose-900 flex items-center gap-1.5">
              <span>🛑</span>
              <span>Lal Modal: Strict Duplicate Notification Block</span>
            </span>
            <p className="text-rose-950 text-[11px]">
              NTEP niyam ke anusar TB patient ka Notification uske pure treatment cycle (90 din) me <strong>sirf 1 baar</strong> hi darj hota hai.
            </p>
            <div className="bg-white/80 border border-rose-200 rounded-xl p-2.5 text-[11px] text-rose-900 space-y-1">
              <strong>🔴 Agar Lal Alert Modal aaye to kya hoga?</strong>
              <p>
                Agar aapne aisi Patient ID Notification box me daali jo pichle 90 dino me aapne ya kisi doosre FO ne pehle se report kar rakhi hai, toh app use <strong>Hard Block</strong> kar dega. Wo ID submit nahi ho sakti. Modal me dikhega ki kis date ko kis officer ne pehle report kiya tha.
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
            <span className="font-black text-amber-900 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Peela Modal: Repeat Visit Confirmation (Allowable)</span>
            </span>
            <p className="text-amber-950 text-[11px]">
              Agar koi purana TB patient hai aur aap uske ghar <strong>dobara Home Visit</strong> karne gaye hain, ya <strong>agli FDC dawai</strong> dene gaye hain, ya <strong>DBT bank passbook</strong> lene gaye hain, toh yeh legitimate care activity hai!
            </p>
            <div className="bg-white/80 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 space-y-1">
              <strong>🟡 Agar Peela Alert Modal aaye to kya karein?</strong>
              <p>
                Home Visit ya FDC box me purani ID daalne par Peela Warning Modal aayega: <em>&ldquo;Yeh patient pehle notify ho chuka hai. Kya aap dobara visit/dawai confirm karte hain?&rdquo;</em>. Bas <strong>&ldquo;Haan, Confirm Karein&rdquo;</strong> dabayein aur entry jud jayegi.
              </p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] text-slate-700">
            <strong>📌 Rule of Thumb:</strong> Notification box me sirf naya patient aayega. Repeat visit ke liye Home Visit / FDC box use karein.
          </div>
        </div>
      )
    },
    {
      id: "offline_sync",
      icon: "📶",
      badge: "No Internet Vault",
      badgeColor: "bg-sky-100 text-sky-800 border-sky-200",
      title: "3. Offline Mode & Zero-Loss Sync",
      subtitle: "Gaon me bina internet ke report submit karna",
      keywords: "offline sync bina network internet zero loss pending queue vault indexeddb",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <p>
            Remote dehat ya jungle area me jahan bilkul internet nahi hota, wahan app bina kisi rukawat ke 100% smooth chalta hai.
          </p>

          <div className="space-y-2">
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 space-y-1">
              <strong className="text-sky-950 block font-bold">1. Bina Network Report Submit Karein:</strong>
              <span className="text-sky-900 text-[11px]">
                Jab network nahi hoga, toh &ldquo;Submit Daily Report&rdquo; dabane par data fail nahi hota. Wo aapke phone ki encrypted internal memory (IndexedDB) me surakshit save ho jata hai.
              </span>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 space-y-1">
              <strong className="text-sky-950 block font-bold">2. Top Header me Status Dekhein:</strong>
              <span className="text-sky-900 text-[11px]">
                Offline report submit hote hi screen ke upar peele rang ka badge dikhega: <strong>&ldquo;Offline Queued (1 report)&rdquo;</strong>.
              </span>
            </div>

            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 space-y-1">
              <strong className="text-sky-950 block font-bold">3. Internet Aane Par Auto-Sync:</strong>
              <span className="text-sky-900 text-[11px]">
                Jaise hi aap bazaar ya sadak par aayenge jahan network aayega, app background me cloud par report sync kar dega. Ya aap chahein toh top bar ke <strong>&ldquo;Sync Now&rdquo;</strong> button ko tap karke turant bhej sakte hain.
              </span>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-[11px] text-emerald-900 font-medium">
            🛡️ <strong>Zero Data Loss Guarantee:</strong> Phone band ho jaye, battery khatam ho jaye, ya phone restart ho jaye — aapki offline report phone se kabhi delete nahi hoti jab tak wo cloud par upload na ho jaye.
          </div>
        </div>
      )
    },
    {
      id: "pending_interventions",
      icon: "⏳",
      badge: "Clinical Follow-ups",
      badgeColor: "bg-teal-100 text-teal-800 border-teal-200",
      title: "4. Pending Interventions Action Center (Follow-up Tasks)",
      subtitle: "Bache hue HIV/DM, DBT aur FDC tasks 1-tap me poore karein",
      keywords: "pending tab interventions follow-up cascade action center dbt fdc hiv dm autofill whatsapp",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <p>
            Field me notify kiye gaye TB patients ke zaroori follow-up clinical interventions (HIV/DM screening, DBT bank details, FDC medicine) track aur regularise karne ke liye:
          </p>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
              <div>
                <strong className="text-slate-900 block font-bold">Pending Tab Kholein:</strong>
                <span className="text-slate-600 text-[11px]">Bottom dock me <strong>&ldquo;Pending&rdquo;</strong> icon par tap karein. Yahan aapke district ke pending clinical interventions ki live priority list dikhegi.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
              <div>
                <strong className="text-slate-900 block font-bold">1-Tap Quick Autofill:</strong>
                <span className="text-slate-600 text-[11px]">Kisi bhi pending patient card par tap karein ya <strong>&ldquo;+ Form me Bharein&rdquo;</strong> dabayein. Patient ID automatically aaj ke relevant form bucket me add ho jayegi bina dubara type kiye.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-teal-600 text-white font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
              <div>
                <strong className="text-slate-900 block font-bold">1-Tap WhatsApp Follow-up Export:</strong>
                <span className="text-slate-600 text-[11px]">
                  <strong>&ldquo;Share WhatsApp List&rdquo;</strong> button dabakar aap poori pending list Coordinator ya Field Team ke sath share kar sakte hain taaki field visit plan asani se ban sake.
                </span>
              </div>
            </div>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3 text-[11px] text-teal-900 font-medium">
            💡 <strong>Smart Efficiency:</strong> Jab aap pending patient ka intervention form me submit karte hain, toh wo pending list se automatically update ho jata hai.
          </div>
        </div>
      )
    },
    {
      id: "edit_correction",
      icon: "⏱️",
      badge: "24-Hr Grace Window",
      badgeColor: "bg-amber-100 text-amber-800 border-amber-200",
      title: "5. 24-Ghante ke Andar Galat ID Theek Karna",
      subtitle: "Clerical galti bina Admin ke khud edit karne ka tarika",
      keywords: "edit id correction 24 ghante galti typo pencil delete profile tab",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <p>
            Agar report submit karne ke baad kisi Nikshay ID me koi typo ya galti ho gayi ho, toh aapko District Coordinator ya Admin ko phone karne ki zaroorat nahi hai:
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
            <span className="font-black text-amber-900 flex items-center gap-1.5">
              <span>✏️</span>
              <span>Self-Correction Steps (24 Hours):</span>
            </span>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-amber-950 pl-1">
              <li>Niche diye gaye <strong>Profile</strong> tab par tap karein.</li>
              <li>Calendar me us tareekh par click karein jis din ki report me galti hui thi.</li>
              <li>ID ke bagal me bane pencil <strong>✏️</strong> icon par tap karke nayi correct ID save karein, ya <strong>❌</strong> se galat ID delete karein.</li>
            </ol>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-[11px] text-rose-900 font-medium">
            ⚠️ <strong>Important Constraint:</strong> Yeh self-service edit window submission ke <strong>24 ghante</strong> tak hi open rehti hai. 24 ghante beetne ke baad security lock lag jata hai taaki data tamper na ho sake. Uske baad sirf State Admin hi badlav kar sakte hain.
          </div>
        </div>
      )
    },
    {
      id: "patient_tracker",
      icon: "🔍",
      badge: "Nikshay Status Live",
      badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-200",
      title: "6. Patient Tracker (Nikshay Verification Status)",
      subtitle: "Apne patient ka government verification status check karein",
      keywords: "patient tracker nikshay status verification green shield search 9 digit journey",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <p>
            Aapne jo patients report kiye hain, unka Nikshay Portal par verification aur DBT status check karne ke liye:
          </p>

          <div className="space-y-2">
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 space-y-1">
              <strong className="text-indigo-950 block font-bold">1. Tracker Tab Kholein:</strong>
              <span className="text-indigo-900 text-[11px]">
                Bottom dock me <strong>&ldquo;Tracker&rdquo;</strong> icon par tap karein aur patient ki 9-digit Nikshay ID search bar me daalein.
              </span>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 space-y-1">
              <strong className="text-indigo-950 block font-bold">2. Status Badges ka Matlab:</strong>
              <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-indigo-900 mt-1">
                <li><span className="font-bold text-emerald-700">🟢 Green Shield (Verified):</span> State Coordinator ne Nikshay dump se cross-match karke verify kar diya hai.</li>
                <li><span className="font-bold text-amber-700">🟡 Amber Badge (Pending Sync):</span> Report darj hai, agle 24-72 ghante me official portal par reconcile hogi.</li>
                <li><span className="font-bold text-sky-700">🔵 DBT Validated:</span> Patient ka bank khata Poshan sahayata ke liye verified hai.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "fdc_and_faqs",
      icon: "💊",
      badge: "Dawai Dosage & Help",
      badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-200",
      title: "7. FDC Dawa Dosage Chart & Field FAQs",
      subtitle: "Wazan ke anusar tablet niyam aur aam sawal",
      keywords: "fdc medicine dosage tablet strip wazan band weight faqs dhyan dein adult pediatric",
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <div className="space-y-2">
            <h4 className="font-black text-slate-900 text-xs flex items-center gap-1.5">
              <span>⚖️</span>
              <span>Adult Regimen (≥ 18 Yrs) — IP: 4 FDC (HRZE) • CP: 3 FDC (HRE)</span>
            </h4>
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Weight Band</th>
                    <th className="p-2">Daily Dose</th>
                    <th className="p-2">IP Supply (28d)</th>
                    <th className="p-2">CP Supply (56d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <td className="p-2 font-mono">25–34 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">2 tabs</td>
                    <td className="p-2">4 strips</td>
                    <td className="p-2">8 strips</td>
                  </tr>
                  <tr className="bg-slate-50/50">
                    <td className="p-2 font-mono">35–49 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">3 tabs</td>
                    <td className="p-2">6 strips</td>
                    <td className="p-2">12 strips</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">50–64 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">4 tabs</td>
                    <td className="p-2">8 strips</td>
                    <td className="p-2">16 strips</td>
                  </tr>
                  <tr className="bg-slate-50/50">
                    <td className="p-2 font-mono">65–75 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">5 tabs</td>
                    <td className="p-2">10 strips</td>
                    <td className="p-2">20 strips</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">&gt; 75 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">6 tabs</td>
                    <td className="p-2">12 strips</td>
                    <td className="p-2">24 strips</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-black text-slate-900 text-xs flex items-center gap-1.5">
              <span>🧒</span>
              <span>Pediatric Regimen (&lt; 18 Yrs) — IP: 3 FDC-P + E • CP: 2 FDC-P + E</span>
            </h4>
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
              <table className="w-full text-[11px] text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2">Weight Band</th>
                    <th className="p-2">Daily Tabs</th>
                    <th className="p-2">Strips (28 Days)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                  <tr>
                    <td className="p-2 font-mono">4–7 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">1 tab HRZ + 1 tab E</td>
                    <td className="p-2">1 strip HRZ + 1 strip E</td>
                  </tr>
                  <tr className="bg-slate-50/50">
                    <td className="p-2 font-mono">8–11 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">2 tabs HRZ + 2 tabs E</td>
                    <td className="p-2">2 strips HRZ + 2 strips E</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono">12–15 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">3 tabs HRZ + 3 tabs E</td>
                    <td className="p-2">3 strips HRZ + 3 strips E</td>
                  </tr>
                  <tr className="bg-slate-50/50">
                    <td className="p-2 font-mono">16–24 kg</td>
                    <td className="p-2 text-indigo-700 font-bold">4 tabs HRZ + 4 tabs E</td>
                    <td className="p-2">4 strips HRZ + 4 strips E</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick FAQs */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <h4 className="font-black text-slate-900 text-xs flex items-center gap-1.5">
              <span>❓</span>
              <span>Aam Field Sawal (Field FAQs)</span>
            </h4>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 font-bold block text-[11px]">Q: Agar patient ki ID 8-digit hai toh form lega?</strong>
              <p className="text-slate-600 text-[11px]">
                Haan, puraane NTEP legacy records ke liye form 8-digit aur naye patients ke liye 9-digit dono accept karta hai.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 font-bold block text-[11px]">Q: Duplicate Notification alert aane par kya patient ki visit bhi ruk jayegi?</strong>
              <p className="text-slate-600 text-[11px]">
                Bilkul nahi! Duplicate alert sirf TB Notification count par lagta hai. Patient ki Home Visit, FDC dawai aur DBT bante rahenge. Bas ID ko Home Visit ya FDC box me daalein.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 font-bold block text-[11px]">Q: Agar phone kho jaye ya kharab ho jaye?</strong>
              <p className="text-slate-600 text-[11px]">
                Aapki jo bhi reports submit ho chuki hain wo cloud database me 100% surakshit hain. Naye phone me apna District aur Naam chunein aur duty PIN daal kar turant apna kaam shuru karein.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: "modern_ui_ergonomics",
      icon: "⚡",
      badge: "New UI Features (v2.7.6)",
      badgeColor: "bg-teal-100 text-teal-800 border-teal-200",
      title: "8. Quick Jump Pills, Numeric Keypad & Live Badges",
      subtitle: "Naye UI features aur fast data entry ke aasan tareeqe",
      keywords: "quick jump sticky pills dialpad keypad 9 digit badge tags remove number pad ergonomics v2.7.6",
      content: (
        <div className="space-y-3.5 text-xs text-slate-700 leading-relaxed">
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3.5 space-y-1.5">
            <span className="font-black text-teal-900 flex items-center gap-1.5">
              <span>🚀</span>
              <span>Fast Field Entry &amp; Ergonomics:</span>
            </span>
            <p className="text-teal-800 text-[11px]">
              Version 2.7.6 me field officers ki speed aur sahuliyat ke liye naaye features jode gaye hain taaki reporting me kam se kam samay lage aur typing ki galtiyan na hon.
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 block font-bold flex items-center gap-1.5">
                <span>🧭</span>
                <span>1. Sticky Category Quick-Jump Pills:</span>
              </strong>
              <p className="text-slate-600 text-[11px]">
                Form ke upar sticky horizontal bar me categories (👤 Patient, 🧪 Testing, 🏠 Visits, 💊 FDC, ⭐ Special, 🩺 Doctors, 📝 Remarks) diye gaye hain. Kisi bhi pill par tap karte hi form seedhe us section par chala jayega aur section automatically open ho jayega. Bar-bar lamba scroll karne ki zaroorat nahi hai.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 block font-bold flex items-center gap-1.5">
                <span>📱</span>
                <span>2. Direct Number Dialpad (Numeric Keypad):</span>
              </strong>
              <p className="text-slate-600 text-[11px]">
                Nikshay ID, Duty PIN aur Patient Weight fields me tap karte hi aapke mobile par seedhe <strong>0-9 Number Keypad</strong> khulega. Ab keyboard me baar-baar &ldquo;123&rdquo; button dabane ki jhanjhat khatam ho gayi hai.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 block font-bold flex items-center gap-1.5">
                <span>🔢</span>
                <span>3. Live 9-Digit Formatter &amp; Progress Badge:</span>
              </strong>
              <p className="text-slate-600 text-[11px]">
                Nikshay ID type karte samay input box ke right corner me live counter dikhta hai (jaise <code className="bg-slate-200 px-1 py-0.5 rounded text-[10px] font-mono">[ 7 / 9 digits ]</code>). Pure 9 digits hote hi green <code className="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded text-[10px] font-mono font-bold">[ ✓ Ready ]</code> dikhega. Unglion se ginti karne ki zaroorat nahi padegi!
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-1">
              <strong className="text-slate-900 block font-bold flex items-center gap-1.5">
                <span>🏷️</span>
                <span>4. Removable Patient Tag Chips:</span>
              </strong>
              <p className="text-slate-600 text-[11px]">
                Report me add kiye gaye sabhi Patient IDs ab clean tags ke roop me dikhte hain. Agar galti se koi galat ID jud jaye, toh tag ke bagal me bane cross (✕) button par 1 tap karke use turant hata sakte hain.
              </p>
            </div>
          </div>
        </div>
      )
    }
  ];

  const filteredTopics = guideTopics.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      t.title.toLowerCase().includes(q) ||
      t.subtitle.toLowerCase().includes(q) ||
      t.keywords.toLowerCase().includes(q)
    );
  });

  return (
    <div className="w-full max-w-lg mx-auto animate-fade-in pb-16 space-y-5">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-indigo-950/20 border border-teal-700/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-2xl border border-white/20 shrink-0">
            📖
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">FO Field Manual &amp; App Guide</h2>
            <p className="text-xs text-teal-200 font-medium">
              Daily Reporting, Duplicate Niyam, Offline Mode &amp; Dawai Rules
            </p>
          </div>
        </div>

        {/* Quick Search Bar */}
        <div className="mt-4 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topic (e.g. report, duplicate, offline, edit, dawai)..."
            className="w-full bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-4 py-2.5 pl-9 text-xs text-white placeholder-teal-200/70 outline-none focus:ring-2 focus:ring-teal-400 font-medium"
          />
          <span className="absolute left-3 top-3 text-sm text-teal-200">🔍</span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-xs text-teal-200 hover:text-white font-bold bg-white/10 px-2 py-0.5 rounded-full"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Visual Workflow Graph (Flowchart) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <span>📊</span>
            <span>App Kaise Kaam Karta Hai (System Flowchart)</span>
          </h3>
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            Tap stage to learn
          </span>
        </div>

        {/* 4 Connected Graph Nodes */}
        <div className="grid grid-cols-4 gap-1.5 relative pt-1">
          {stages.map((stage, idx) => {
            const isSelected = activeStage === stage.id;
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setActiveStage(stage.id)}
                className={`flex flex-col items-center p-2 rounded-2xl border transition-all cursor-pointer relative z-10 ${
                  isSelected 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/25 scale-105' 
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                <span className="text-xl mb-1">{stage.icon}</span>
                <span className="text-[10px] font-black text-center leading-tight">{stage.title.split('. ')[1]}</span>
                <span className={`text-[8px] font-bold uppercase mt-1 px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  Step {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Detail Card */}
        {(() => {
          const currentStage = stages.find(s => s.id === activeStage) || stages[0];
          return (
            <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 space-y-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{currentStage.icon}</span>
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                    {currentStage.title}: {currentStage.subtitle}
                  </h4>
                  <p className="text-[11px] text-indigo-800 font-medium">
                    {currentStage.desc}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-indigo-100/80 space-y-1.5">
                {currentStage.points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px] text-slate-700">
                    <span className="text-emerald-600 font-black mt-0.5">✓</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 7 Accordion Topic Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
            <span>📚</span>
            <span>FO Detailed User Manual ({filteredTopics.length} Topics)</span>
          </h3>
          <span className="text-[10px] text-slate-500 font-bold">Tap card to expand</span>
        </div>

        {filteredTopics.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm space-y-2">
            <span className="text-3xl">🔍</span>
            <p className="text-xs font-black text-slate-800">Koi topic nahi mila &ldquo;{searchQuery}&rdquo; ke liye</p>
            <p className="text-[11px] text-slate-500">Kripya doosra keyword type karein jaise &lsquo;report&rsquo;, &lsquo;duplicate&rsquo;, ya &lsquo;dawai&rsquo;.</p>
          </div>
        ) : (
          filteredTopics.map((topic) => {
            const isOpen = openTopic === topic.id || searchQuery.trim().length > 0;
            return (
              <div
                key={topic.id}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden transition-all"
              >
                {/* Accordion Trigger Header */}
                <button
                  type="button"
                  onClick={() => setOpenTopic(openTopic === topic.id ? "" : topic.id)}
                  className="w-full p-4 sm:p-5 flex items-start justify-between text-left hover:bg-slate-50/80 transition-all cursor-pointer gap-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl p-2 bg-slate-100 rounded-2xl shrink-0 mt-0.5">{topic.icon}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${topic.badgeColor}`}>
                          {topic.badge}
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 tracking-tight leading-snug">
                        {topic.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {topic.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className={`text-slate-400 font-black text-sm p-1 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-teal-600' : ''}`}>
                    ▼
                  </span>
                </button>

                {/* Collapsible Content */}
                {isOpen && (
                  <div className="px-4 pb-5 pt-1 border-t border-slate-100 animate-fade-in">
                    {topic.content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// --- Id Bucket ---
const IdBucket = ({ title, ids, onAdd, onAddMultiple, onRemove, showToast, suggestedIds = [], onAddBulk, allow8Digit = false }) => {
  const [currentId, setCurrentId] = useState("");
  const safeIds = Array.isArray(ids) ? ids : [];
  const cleanCurrent = currentId.trim();

  const isCurrentValid = VALID_PATIENT_ID_CONFIG.isValidLength(cleanCurrent.length, allow8Digit) && !isNaN(cleanCurrent);
  const targetDigitsText = allow8Digit ? '8-9' : '9';

  const handleAdd = () => {
    const raw = currentId.trim();
    if (!raw) return;

    // Check if user pasted multiple IDs (separated by comma, space, newline)
    const regex = VALID_PATIENT_ID_CONFIG.getRegex(allow8Digit);
    const matches = raw.match(regex);
    if (matches && matches.length > 1) {
      if (onAddMultiple) {
        onAddMultiple(matches);
        setCurrentId("");
        return;
      }
    }

    const isValid = VALID_PATIENT_ID_CONFIG.isValidLength(raw.length, allow8Digit) && !isNaN(raw);

    if (isValid) {
      onAdd(raw);
      setCurrentId("");
    } else {
      showToast(allow8Digit ? "ID 8 ya 9 digit ki honi chahiye bhai!" : "ID exactly 9 digit ki honi chahiye bhai!", "error");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs hover:border-teal-300 transition-all group">
      <label className="block text-xs font-black text-slate-800 tracking-wider uppercase mb-3 flex items-center justify-between group-hover:text-teal-700 transition-colors">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span>{title}</span>
          {isCurrentValid ? (
            <span className="text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 shadow-2xs animate-fade-in">
              ✓ Ready ({cleanCurrent.length} Digits)
            </span>
          ) : cleanCurrent.length > 0 ? (
            <span className="text-amber-800 bg-amber-50 border border-amber-300 px-2.5 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 shadow-2xs animate-fade-in">
              {cleanCurrent.length} / {targetDigitsText} digits
            </span>
          ) : null}
        </span>
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] ml-1 font-black tabular-num transition-colors ${
          safeIds.length > 0 
            ? 'bg-teal-50 border border-teal-200 text-teal-800' 
            : 'bg-slate-100 border border-slate-200 text-slate-500'
        }`}>
          {safeIds.length} {safeIds.length === 1 ? 'ID' : 'IDs'}
        </span>
      </label>

      {/* Smart Notification ID Suggestion Chips (Only Today's Notified IDs) */}
      {suggestedIds && suggestedIds.length > 0 && (
        <div className="mb-3 bg-teal-50/40 p-2.5 rounded-xl border border-teal-100/90 animate-fade-in">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-900 flex items-center gap-1">
              <span>💡</span> Today's Notified IDs ({suggestedIds.length}):
            </span>
            {suggestedIds.some(sid => !safeIds.includes(sid)) && onAddBulk && (
              <button
                type="button"
                onClick={() => {
                  const missing = suggestedIds.filter(sid => !safeIds.includes(sid));
                  onAddBulk(missing);
                  if (showToast) showToast(`Added ${missing.length} Notification IDs!`, "success");
                }}
                className="text-[9px] font-bold text-teal-800 bg-white hover:bg-teal-100 px-2 py-0.5 rounded-md border border-teal-200 transition-colors active:scale-95 shadow-2xs cursor-pointer"
              >
                + Add All ({suggestedIds.filter(sid => !safeIds.includes(sid)).length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
            {suggestedIds.map((sid, sIdx) => {
              const isAdded = safeIds.includes(sid);
              return (
                <button
                  key={sIdx}
                  type="button"
                  disabled={isAdded}
                  onClick={() => {
                    onAdd(sid);
                    if (showToast) showToast(`ID #${sid} added!`, "success");
                  }}
                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all active:scale-95 flex items-center gap-1 cursor-pointer ${
                    isAdded 
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-900 opacity-80 cursor-default' 
                      : 'bg-white hover:bg-teal-700 hover:text-white border-teal-200 text-teal-800 shadow-2xs'
                  }`}
                  title={isAdded ? "Already Added" : `Tap to add ID #${sid}`}
                >
                  <span>{sid}</span>
                  <span>{isAdded ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 48px Thumb Hitbox Input & Add Button */}
      <div className="flex gap-2">
        <input 
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={currentId}
          onChange={(e) => setCurrentId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={allow8Digit ? "Enter or paste 8 or 9-digit ID" : "Enter or paste 9-digit ID"}
          className="flex-1 w-full h-12 bg-slate-50/90 border border-slate-300 text-slate-900 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-400 font-mono shadow-2xs"
        />
        <button 
          type="button"
          onClick={handleAdd} 
          className="h-12 min-w-[76px] bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white px-4 rounded-xl font-black shadow-xs shadow-teal-700/20 active:scale-[0.98] transition-all text-xs tracking-wider uppercase shrink-0 flex items-center justify-center cursor-pointer"
        >
          ADD
        </button>
      </div>

      {/* Chip-Tags with Instant Removal */}
      {safeIds.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
          {safeIds.map((id, index) => (
            <span 
              key={index} 
              className="inline-flex items-center gap-2 bg-teal-50/90 text-teal-950 border border-teal-200/90 px-3 py-1.5 rounded-xl text-xs font-mono font-bold shadow-2xs hover:border-teal-300 transition-all"
            >
              <span>{id}</span>
              <button 
                type="button"
                onClick={() => onRemove(index)} 
                className="text-teal-700 hover:text-white hover:bg-rose-500 bg-teal-100/90 h-5 w-5 rounded-md flex items-center justify-center font-black text-xs transition-all shadow-2xs cursor-pointer active:scale-90"
                title="Remove ID"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// --- FDC Bucket (Smart Card with Auto-Calculated Dosage) ---
const FdcBucket = ({ title, ids, fdcDetails = [], onAddFdc, onUpdateFdc, onRemoveFdc, showToast, suggestedIds = [] }) => {
  const [currentId, setCurrentId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientType, setPatientType] = useState("adult"); // "adult" | "pediatric"
  const [weightKg, setWeightKg] = useState("");
  const [phase, setPhase] = useState("IP"); // "IP" | "CP"

  const safeIds = Array.isArray(ids) ? ids : [];
  const cleanFdcDetails = Array.isArray(fdcDetails) ? fdcDetails : [];

  const isCurrentValidId = (currentId.length === 8 || currentId.length === 9) && !isNaN(currentId);

  // Live Reactive Dosage Calculation
  const dosage = useMemo(() => {
    if (!weightKg || isNaN(parseFloat(weightKg))) return null;
    return calculateFdcDosage(patientType, weightKg, phase);
  }, [patientType, weightKg, phase]);

  const handleAddSmart = () => {
    const rawId = currentId.trim();
    if (!rawId) {
      showToast("Kripya Nikshay ID enter karein!", "error");
      return;
    }
    if (!(rawId.length === 8 || rawId.length === 9) || isNaN(rawId)) {
      showToast("FDC ID 8 ya 9 digit ki honi chahiye bhai!", "error");
      return;
    }

    if (dosage && !dosage.isValid) {
      showToast(dosage.error || "Weight range invalid hai!", "error");
      return;
    }

    const defaultRegimen = phase === 'IP' 
      ? (patientType === 'adult' ? '4 FDC (HRZE)' : '3 FDC Paed (HRZ)') 
      : (patientType === 'adult' ? '3 FDC (HRE)' : '2 FDC Paed (HR)');
    const defaultFdcType = phase === 'IP' ? 'FDC 4' : 'FDC 3';
    const defaultStrips = 2;

    const stripsCount = dosage && dosage.isValid ? dosage.strips : defaultStrips;
    const regimenName = dosage && dosage.isValid ? dosage.regimenName : defaultRegimen;

    const enrichedDetail = {
      id: rawId,
      patient_name: patientName.trim() || `Patient #${rawId}`,
      patient_type: patientType,
      weight_kg: dosage && dosage.isValid ? dosage.weightKg : (parseFloat(weightKg) || null),
      weight_band: dosage && dosage.isValid ? dosage.weightBand : '',
      phase: phase,
      regimen_name: regimenName,
      daily_dose_text: dosage && dosage.isValid ? dosage.dailyDoseText : `${regimenName} daily`,
      supply_issued: dosage && dosage.isValid ? dosage.supplyIssued : `${stripsCount} strips`,
      daily_tablets: dosage && dosage.isValid ? dosage.dailyTablets : 0,
      strips: stripsCount,
      fdc_type: defaultFdcType
    };

    onAddFdc(rawId, enrichedDetail);
    setCurrentId("");
    setPatientName("");
    setWeightKg("");
    showToast(`✓ #${rawId} FDC successfully added!`, "success");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSmart();
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:border-teal-300 transition-all group space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-black text-slate-700 tracking-wider uppercase flex items-center gap-1.5 group-hover:text-teal-700 transition-colors">
          <span>💊</span>
          <span>{title}</span>
          {isCurrentValidId && (
            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-black inline-flex items-center gap-1 shadow-2xs">
              ✓ Ready
            </span>
          )}
        </label>
        <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-black tabular-num">{safeIds.length}</span>
      </div>

      {/* Smart Notification ID Chips */}
      {suggestedIds && suggestedIds.length > 0 && (
        <div className="bg-teal-50/70 p-2.5 rounded-xl border border-teal-100/90 animate-fade-in">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-teal-900 flex items-center gap-1">
              <span>💡</span> Today's Notified IDs ({suggestedIds.length}):
            </span>
          </div>
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">
            {suggestedIds.map((sid, sIdx) => {
              const isAdded = safeIds.includes(sid);
              return (
                <button
                  key={sIdx}
                  type="button"
                  disabled={isAdded}
                  onClick={() => {
                    setCurrentId(sid);
                    if (showToast) showToast(`Selected ID #${sid} for FDC!`, "info");
                  }}
                  className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all active:scale-[0.98] flex items-center gap-1 cursor-pointer ${
                    isAdded 
                      ? 'bg-emerald-100 border-emerald-200 text-emerald-800 opacity-80 cursor-default' 
                      : 'bg-white hover:bg-teal-700 hover:text-white border-teal-200 text-teal-800 shadow-2xs'
                  }`}
                  title={isAdded ? "Already Added" : `Select ID #${sid}`}
                >
                  <span>{sid}</span>
                  <span>{isAdded ? '✓' : '→'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Nikshay ID Input */}
      <div>
        <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Nikshay ID (8 or 9 Digits)</label>
        <input 
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={currentId}
          onChange={(e) => setCurrentId(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter 8 or 9-digit Nikshay ID"
          className="w-full h-12 bg-slate-50/90 border border-slate-300 text-slate-900 text-sm font-semibold rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white block px-3.5 py-2.5 outline-none transition-all placeholder:text-slate-400 font-mono shadow-2xs"
        />
      </div>

      {/* Inline Smart Card Form */}
      <div className="bg-slate-50/90 p-3 sm:p-4 rounded-xl border border-teal-100 space-y-3 animate-fade-in">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Patient Name (Optional)</label>
            <input 
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full h-10 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-700 mb-1">Weight in KG (Wazan)</label>
            <input 
              type="number"
              inputMode="decimal"
              step="0.5"
              min="4"
              max="150"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="e.g. 45"
              className="w-full h-10 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Adult vs Pediatric */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-slate-600">Category:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setPatientType('adult')}
                className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all cursor-pointer ${patientType === 'adult' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-700 hover:text-teal-700'}`}
              >
                Adult (≥ 18)
              </button>
              <button
                type="button"
                onClick={() => setPatientType('pediatric')}
                className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all cursor-pointer ${patientType === 'pediatric' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-700 hover:text-teal-700'}`}
              >
                Pediatric (&lt; 18)
              </button>
            </div>
          </div>

          {/* IP vs CP Phase */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-slate-600">Phase:</span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setPhase('IP')}
                className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all cursor-pointer ${phase === 'IP' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-700 hover:text-amber-600'}`}
                title="Intensive Phase (4 FDC / HRZE)"
              >
                IP (Intensive)
              </button>
              <button
                type="button"
                onClick={() => setPhase('CP')}
                className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all cursor-pointer ${phase === 'CP' ? 'bg-teal-700 text-white shadow-xs' : 'text-slate-700 hover:text-teal-700'}`}
                title="Continuation Phase (3 FDC / HRE)"
              >
                CP (Continuation)
              </button>
            </div>
          </div>
        </div>

        {/* Quick Weight Selection Chips */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
              <span>⚖️</span> Quick Weight Chips:
            </span>
            {weightKg && (
              <button 
                type="button" 
                onClick={() => setWeightKg("")}
                className="text-[9px] font-bold text-rose-500 hover:underline cursor-pointer"
              >
                ✕ Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {(patientType === 'adult' ? [
              { label: '30 kg', val: '30', band: '25–34 kg' },
              { label: '42 kg', val: '42', band: '35–49 kg' },
              { label: '55 kg', val: '55', band: '50–64 kg' },
              { label: '70 kg', val: '70', band: '65–75 kg' },
              { label: '80 kg', val: '80', band: '>75 kg' }
            ] : [
              { label: '6 kg', val: '6', band: '4–7 kg' },
              { label: '10 kg', val: '10', band: '8–11 kg' },
              { label: '14 kg', val: '14', band: '12–15 kg' },
              { label: '20 kg', val: '20', band: '16–24 kg' },
              { label: '27 kg', val: '27', band: '25–29 kg' },
              { label: '35 kg', val: '35', band: '30–39 kg' }
            ]).map((chip) => {
              const isSelected = String(weightKg) === chip.val;
              return (
                <button
                  key={chip.val}
                  type="button"
                  onClick={() => setWeightKg(chip.val)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-teal-700 text-white border-teal-700 shadow-xs scale-105' 
                      : 'bg-white text-slate-800 border-slate-300 hover:border-teal-400 hover:bg-teal-50/60'
                  }`}
                  title={`${chip.label} (${chip.band})`}
                >
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Reactive Dosage Calculation Card */}
        {dosage && (
          <div className={`p-3 rounded-xl border text-xs animate-fade-in ${
            dosage.isValid 
              ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950 shadow-xs' 
              : 'bg-rose-50/90 border-rose-200 text-rose-900'
          }`}>
            {dosage.isValid ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between font-black">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">💊</span>
                    <div>
                      <span className="font-extrabold text-emerald-950 text-xs block">{dosage.regimenName}</span>
                      <span className="text-[10px] text-emerald-700 font-semibold">{dosage.phaseText}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border uppercase ${
                      dosage.phase === 'IP' 
                        ? 'bg-amber-100 text-amber-900 border-amber-300' 
                        : 'bg-teal-100 text-teal-900 border-teal-300'
                    }`}>
                      {dosage.phase} Phase
                    </span>
                    <span className="bg-emerald-200 text-emerald-900 border border-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase">
                      {dosage.weightBand}
                    </span>
                  </div>
                </div>

                {/* Dosage & Blister Details */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/80 text-[11px]">
                  <div className="bg-white/90 p-2 rounded-lg border border-emerald-100">
                    <span className="text-[9px] font-black uppercase text-emerald-600 block">Daily Intake</span>
                    <span className="font-black text-emerald-900">{dosage.dailyDoseText}</span>
                    {dosage.dailyTablets > 0 && (
                      <div className="flex items-center gap-0.5 mt-1" title={`${dosage.dailyTablets} tablets daily`}>
                        {Array.from({ length: Math.min(6, dosage.dailyTablets) }).map((_, i) => (
                          <span key={i} className="text-xs">🔴</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="bg-white/90 p-2 rounded-lg border border-emerald-100">
                    <span className="text-[9px] font-black uppercase text-emerald-600 block">Supply Allocation</span>
                    <span className="font-black text-emerald-900">{dosage.supplyIssued}</span>
                    <span className="text-[10px] text-emerald-700 block font-bold mt-0.5">
                      📦 {dosage.strips} Foil Strip{dosage.strips > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-bold text-[11px]">
                <span>⚠️</span>
                <span>{dosage.error}</span>
              </div>
            )}
          </div>
        )}

        {!weightKg && (
          <p className="text-[10px] text-slate-500 font-medium italic">
            💡 Tip: Enter patient weight or select a quick weight chip to auto-calculate exact dosage and strip quantity.
          </p>
        )}

        <button
          type="button"
          onClick={handleAddSmart}
          className="w-full h-12 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white rounded-xl font-black shadow-md active:scale-[0.98] transition-all text-xs tracking-wider uppercase cursor-pointer flex items-center justify-center"
        >
          + Add to FDC Distribution
        </button>
      </div>

      {/* Added FDC Entries List */}
      {safeIds.length > 0 && (
        <ul className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
          {safeIds.map((id, index) => {
            const detail = cleanFdcDetails.find(d => d && d.id === id) || { fdc_type: 'FDC 4', strips: 1 };
            const displayName = detail.patient_name || 'Patient';
            const displayRegimen = detail.regimen_name || detail.fdc_type || 'FDC';
            const displayStrips = detail.strips || 1;

            return (
              <li key={index} className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-slate-50/90 border border-slate-200/80 p-3 rounded-xl shadow-2xs hover:bg-white hover:border-slate-300 transition-all">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-800 tracking-wider text-xs sm:text-sm">#{id}</span>
                    <span className="text-xs font-bold text-slate-700 truncate max-w-[150px] sm:max-w-xs">{displayName}</span>
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-black px-2 py-0.5 rounded-md">
                      📦 {displayStrips} Strip{displayStrips > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-indigo-600 font-bold">{displayRegimen}</span>
                    <span>•</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded border ${
                      detail.phase === 'CP' 
                        ? 'bg-teal-50 text-teal-800 border-teal-200' 
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {detail.phase || 'IP'} Phase
                    </span>
                    {detail.weight_kg && (
                      <>
                        <span>•</span>
                        <span>{detail.weight_kg} kg ({detail.weight_band || ''})</span>
                      </>
                    )}
                    {detail.daily_dose_text && (
                      <>
                        <span>•</span>
                        <span>{detail.daily_dose_text}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => onRemoveFdc(index, id)}
                    className="text-slate-400 hover:text-white hover:bg-rose-500 bg-slate-100 h-7 w-7 rounded-lg flex items-center justify-center font-black text-sm transition-all shadow-2xs cursor-pointer"
                    title="Remove FDC Record"
                  >
                    &times;
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};


const sanitizeIncomingFormData = (d, base) => {
  const arrayKeys = [
    'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
    'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
    'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
    'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
    'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids',
    'culture_dst_ids', 'fdc_details'
  ];
  const clean = { ...base };
  if (d && typeof d === 'object') {
    Object.keys(d).forEach(k => {
      if (arrayKeys.includes(k)) {
        clean[k] = Array.isArray(d[k]) ? d[k] : [];
      } else if (k === 'visited_names') {
        clean[k] = Array.isArray(d[k]) ? d[k] : [];
      } else if (d[k] !== null && d[k] !== undefined) {
        clean[k] = d[k];
      }
    });
  }
  arrayKeys.forEach(k => {
    if (!Array.isArray(clean[k])) clean[k] = [];
  });
  if (!Array.isArray(clean.visited_names)) clean.visited_names = [];
  return clean;
};

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

// --- Secure Offline PIN Vault & Cryptographic Utilities ---
const hashPinAsync = async (pin, salt = "dfy_salt_secure_2026") => {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(String(pin) + salt);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  // Deterministic fallback hash if Web Crypto is unavailable
  let hash = 0;
  const str = String(pin) + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
};

const getVaultKey = (district, foName) => {
  const cleanD = canonicalizeDistrict(district).trim().toLowerCase();
  const cleanFo = (foName || '').trim().toLowerCase();
  return `${cleanD}___${cleanFo}`;
};

const saveToPinVault = async (district, foName, pin) => {
  try {
    if (!district || !foName || !pin) return;
    const vaultKey = getVaultKey(district, foName);
    const hashedPin = await hashPinAsync(String(pin));
    const rawVault = localStorage.getItem('dfy_pin_vault');
    const vault = rawVault ? JSON.parse(rawVault) : {};
    vault[vaultKey] = {
      hash: hashedPin,
      lastVerified: Date.now(),
      wp: canonicalizeDistrict(district),
      fo: foName
    };
    localStorage.setItem('dfy_pin_vault', JSON.stringify(vault));
  } catch (e) {
    console.warn("Could not save to PIN vault:", e);
  }
};

const verifyPinOffline = async (district, foName, pin) => {
  try {
    if (!district || !foName || !pin) return { valid: false, reason: 'missing_info' };
    const vaultKey = getVaultKey(district, foName);
    const rawVault = localStorage.getItem('dfy_pin_vault');
    if (rawVault) {
      try {
        const vault = JSON.parse(rawVault);
        if (vault && vault[vaultKey]) {
          const stored = vault[vaultKey];
          const currentHash = await hashPinAsync(String(pin));
          if (stored.hash === currentHash) {
            return { valid: true, type: 'vault' };
          } else {
            return { valid: false, reason: 'wrong_pin' };
          }
        }
      } catch (e) {}
    }
    // Backward-compatibility check: previous active session in localStorage
    try {
      const savedSession = localStorage.getItem('dfy_user_session');
      if (savedSession) {
        const s = JSON.parse(savedSession);
        if (s && s.working_place && s.fo_name && s.pin) {
          const sKey = getVaultKey(s.working_place, s.fo_name);
          if (sKey === vaultKey) {
            if (String(s.pin) === String(pin)) {
              // Migrate to vault
              await saveToPinVault(district, foName, pin);
              return { valid: true, type: 'session_backup' };
            } else {
              return { valid: false, reason: 'wrong_pin' };
            }
          }
        }
      }
    } catch (e) {}

    // Not found in cache
    return { valid: null, reason: 'not_cached' };
  } catch (e) {
    return { valid: null, reason: 'error' };
  }
};

const DEFAULT_BIHAR_DISTRICTS = [
  "Aurangabad", "Begusarai", "Bhojpur", "Buxar", "Darbhanga",
  "East Champaran", "Gaya", "Jamui", "Jehanabad", "Kaimur",
  "Khagaria", "Lakhisarai", "Madhubani", "Munger", "Muzaffarpur",
  "Nawada", "Rohtas", "Samastipur", "Sheikhpura", "Sheohar",
  "Sitamarhi", "Vaishali"
];

// --- Strict Duplicate Notification Blocking Modal ---
export const DuplicateNotificationBlockModal = ({ isOpen, onClose, id, date, fo_name, foName }) => {
  if (!isOpen) return null;
  const reporter = fo_name || foName;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[115] flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border-2 border-rose-300 w-full max-w-sm sm:max-w-md animate-scale-up">
        {/* Header with High-Contrast Rose Banner */}
        <div className="bg-rose-50 border-b border-rose-200 p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-rose-600/30 shrink-0">
            🚫
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider mb-1">
              Duplicate TB Notification Blocked
            </span>
            <h3 className="text-lg font-black text-rose-900 leading-tight">
              Yeh Patient ID Pehle Se Notified Hai!
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-rose-400 hover:text-rose-700 text-2xl font-bold p-1 leading-none transition-colors cursor-pointer"
            title="Band Karein"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 text-rose-900 text-xs sm:text-sm font-medium leading-relaxed space-y-2">
            <div className="flex items-center justify-between border-b border-rose-200/70 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Patient ID:</span>
              <span className="font-mono font-black text-base text-rose-900">#{id}</span>
            </div>
            {date && (
              <div className="flex items-center justify-between border-b border-rose-200/70 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Original Date:</span>
                <span className="font-bold text-rose-900">{date}</span>
              </div>
            )}
            {reporter && (
              <div className="flex items-center justify-between border-b border-rose-200/70 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Reported By:</span>
                <span className="font-bold text-rose-900">{reporter}</span>
              </div>
            )}
            <p className="pt-1 text-[11px] text-rose-900 leading-normal">
              <strong>Niyam:</strong> Nikshay niyam ke anusar TB Notification poore ilaaj ke dauran keval <strong>ek hi baar</strong> darj kiya jata hai. Is ID ko dobara Notification bucket me nahi joda ja sakta.
            </p>
          </div>

          <p className="text-slate-500 text-[11px] font-semibold text-center">
            Agar is patient ko aaj koi doosri suvidha (jaise DBT, FDC, Sample) di gayi hai, toh kripya us bucket me darj karein.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-rose-600/30 transition-all uppercase tracking-wider cursor-pointer"
          >
            Theek Hai, Samajh Gaya / Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Interactive Repeat Intervention Confirmation Modal ---
export const RepeatInterventionConfirmModal = ({ isOpen, onClose, id, label, date, onConfirm }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[115] flex items-center justify-center p-4 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border-2 border-amber-300 w-full max-w-sm sm:max-w-md animate-scale-up">
        {/* Header with Warm Amber Banner */}
        <div className="bg-amber-50 border-b border-amber-200 p-5 flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-2xl shadow-lg shadow-amber-500/30 shrink-0">
            ⚠️
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider mb-1">
              Repeat Intervention Check
            </span>
            <h3 className="text-lg font-black text-amber-900 leading-tight">
              Pehle Bhi Report Hua Hai
            </h3>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-amber-400 hover:text-amber-700 text-2xl font-bold p-1 leading-none transition-colors cursor-pointer"
            title="Band Karein"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-amber-900 text-xs sm:text-sm font-medium leading-relaxed space-y-2">
            <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Patient ID:</span>
              <span className="font-mono font-black text-base text-amber-900">#{id}</span>
            </div>
            <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Category:</span>
              <span className="font-bold text-amber-900">{label || 'Same Category'}</span>
            </div>
            {date && (
              <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pichhli Tareekh:</span>
                <span className="font-bold text-amber-900">{date}</span>
              </div>
            )}
            <p className="pt-1 text-[11px] text-amber-900 leading-normal font-semibold">
              ❓ Kya is patient ke liye yeh intervention aaj sach me dobara kiya gaya hai?
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                if (onConfirm) onConfirm();
                onClose();
              }}
              className="w-full py-3 px-3 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white font-black text-xs rounded-xl shadow-md shadow-amber-600/30 transition-all tracking-wide cursor-pointer flex items-center justify-center gap-1"
            >
              <span>✅ Haan, Dobara Hua Hai (Add)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 px-3 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 font-bold text-xs rounded-xl transition-all tracking-wide cursor-pointer flex items-center justify-center gap-1"
            >
              <span>❌ Galti Se Ho Gaya (Cancel)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [directory, setDirectory] = useState(() => {
    try {
      const saved = localStorage.getItem('dfy_staff_directory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          const normalized = { ...INITIAL_STAFF_DIRECTORY };
          Object.keys(parsed).forEach(k => {
            const cKey = canonicalizeDistrict(k);
            if (normalized[cKey] !== undefined) {
              normalized[cKey] = Array.from(new Set([...(normalized[cKey] || []), ...(parsed[k] || [])])).sort();
            }
          });
          return normalized;
        }
      }
    } catch (e) {}
    return INITIAL_STAFF_DIRECTORY || {};
  });
  
  const [districts, setDistricts] = useState(DEFAULT_BIHAR_DISTRICTS);
  
  useEffect(() => {
    const fetchDirectory = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
        const res = await fetch(`${API_BASE_URL}/staff-directory`);
        const data = await res.json();
        if (data.status === 'success' && data.data && typeof data.data === 'object') {
          const normalized = {};
          DEFAULT_BIHAR_DISTRICTS.forEach(d => { normalized[d] = []; });
          Object.keys(data.data).forEach(k => {
            const cKey = canonicalizeDistrict(k);
            if (normalized[cKey] !== undefined) {
              normalized[cKey] = Array.from(new Set([...(normalized[cKey] || []), ...(data.data[k] || [])])).sort();
            }
          });
          setDirectory(normalized);
          const distList = Object.keys(normalized).filter(d => DEFAULT_BIHAR_DISTRICTS.includes(d)).sort();
          setDistricts(distList.length > 0 ? distList : DEFAULT_BIHAR_DISTRICTS);
          try {
            localStorage.setItem('dfy_staff_directory', JSON.stringify(normalized));
          } catch (e) {}
        } else {
          setDistricts(prev => prev && prev.length > 0 ? prev : DEFAULT_BIHAR_DISTRICTS);
        }
      } catch (err) {
        console.error("Failed to fetch staff directory", err);
        setDistricts(prev => prev && prev.length > 0 ? prev : DEFAULT_BIHAR_DISTRICTS);
      }
    };
    fetchDirectory();
  }, []);
  
  const [formData, setFormData] = useState({
    working_place: "", fo_name: "", pin: "",
    notification_ids: [], hiv_dm_ids: [], dbt_ids: [], 
    sample_collection_ids: [], sample_tested_ids: [], 
    outcome_assigned_ids: [], home_visit_ids: [], 
    contact_tracing_ids: [], follow_up_ids: [], 
    face_to_face_ids: [], presumptive_ids: [], 
    documents_ids: [],
    fdc_provided_ids: [],
    fdc_details: [],
    kit_consumption_ids: [],
    differentiated_tb_ids: [],
    tpt_treatment_start_ids: [],
    tpt_presumptive_ids: [],
    adhar_face_authentication_ids: [],
    consent_with_id_ids: [],
    culture_dst_ids: [],
    remark: "", visited_names: []
  });

      
  
      
  const [docName, setDocName] = useState("");
  const [pinStatus, setPinStatus] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentView, setCurrentView] = useState('form');
  const [toast, setToast] = useState({ message: "", type: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBtn, setShowInstallBtn] = useState(true);
  const [showIosInstallModal, setShowIosInstallModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showPostSubmitSuccess, setShowPostSubmitSuccess] = useState(false);
  const [submittedReportSummary, setSubmittedReportSummary] = useState(null);
  const [copiedPostSubmit, setCopiedPostSubmit] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);

  // Field Staff Broadcast Announcements State
  const [activeFoBroadcasts, setActiveFoBroadcasts] = useState([]);
  const [unreadBroadcastPopup, setUnreadBroadcastPopup] = useState(null);
  const [showAllAlertsModal, setShowAllAlertsModal] = useState(false);

  // Field Staff Pending Interventions State
  const [cascadeAlerts, setCascadeAlerts] = useState([]);
  const [cascadeSummary, setCascadeSummary] = useState({});
  const [loadingCascadeAlerts, setLoadingCascadeAlerts] = useState(false);

  // Field Staff Monthly Ledger for Duplicate Warning
  const [foMonthlyHistory, setFoMonthlyHistory] = useState(null);

  // Duplicate Notification & Repeat Intervention Modal States
  const [duplicateBlockModal, setDuplicateBlockModal] = useState({
    isOpen: false,
    id: '',
    date: '',
    fo_name: ''
  });
  const [repeatConfirmModal, setRepeatConfirmModal] = useState({
    isOpen: false,
    id: '',
    field: '',
    label: '',
    date: '',
    onConfirm: null
  });

  // Current working place and officer name refs to prevent stale closure in listeners
  const workingPlaceRef = useRef(formData.working_place);
  const foNameRef = useRef(formData.fo_name);
  useEffect(() => {
    workingPlaceRef.current = formData.working_place;
    foNameRef.current = formData.fo_name;
  }, [formData.working_place, formData.fo_name]);

  // Derived Live Metric Tallies for Floating Mini-HUD
  const liveTotalIds = useMemo(() => {
    const idKeys = [
      'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
      'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
      'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
      'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
      'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids',
      'culture_dst_ids'
    ];
    return idKeys.reduce((sum, k) => sum + (Array.isArray(formData[k]) ? formData[k].length : 0), 0);
  }, [formData]);

  const liveFdcCount = useMemo(() => {
    return Array.isArray(formData.fdc_provided_ids) ? formData.fdc_provided_ids.length : 0;
  }, [formData.fdc_provided_ids]);

  const liveVisitsCount = useMemo(() => {
    return Array.isArray(formData.visited_names) ? formData.visited_names.length : 0;
  }, [formData.visited_names]);

  const liveNotifCount = useMemo(() => {
    return Array.isArray(formData.notification_ids) ? formData.notification_ids.length : 0;
  }, [formData.notification_ids]);

  // Map of IDs reported by this officer earlier in the current month for non-blocking duplicate warnings
  const monthlyReportedIdsMap = useMemo(() => {
    if (!foMonthlyHistory || !foMonthlyHistory.daily_history) return {};
    const map = {};
    const catNames = {
      notification: "TB Notification",
      hiv_dm: "HIV & DM",
      dbt: "DBT",
      sample_collection: "Sample Collection",
      sample_tested: "Samples Tested",
      outcome_assigned: "Outcome Assigned",
      home_visit: "Home Visit",
      contact_tracing: "Contact Tracing",
      follow_up: "Follow Up",
      face_to_face: "Face to Face",
      presumptive: "Presumptive",
      documents: "Documents",
      fdc_provided: "FDC Provided",
      kit_consumption: "Kit Consumption",
      differentiated_tb: "Differentiated TB",
      tpt_treatment_start: "TPT Treatment Start",
      tpt_presumptive: "TPT Presumptive",
      adhar_face_authentication: "Aadhaar Face Auth",
      consent_with_id: "Consent with ID",
      culture_dst: "Culture / DST"
    };

    Object.entries(foMonthlyHistory.daily_history).forEach(([dateStr, dayObj]) => {
      if (!dayObj || !dayObj.categories) return;
      Object.entries(dayObj.categories).forEach(([rawCat, idList]) => {
        if (!Array.isArray(idList)) return;
        const cleanCat = rawCat.replace(/_ids$/, '');
        const catLabel = catNames[cleanCat] || cleanCat.replace(/_/g, ' ').toUpperCase();
        const normFieldKey = cleanCat + '_ids';

        idList.forEach(id => {
          const cleanId = String(id).trim();
          if (!cleanId) return;
          if (!map[cleanId]) map[cleanId] = [];
          map[cleanId].push({
            date: dateStr,
            category: normFieldKey,
            categoryClean: cleanCat,
            categoryLabel: catLabel
          });
        });
      });
    });
    return map;
  }, [foMonthlyHistory]);

  const checkMonthlyDuplicate = (field, id) => {
    if (!monthlyReportedIdsMap || !monthlyReportedIdsMap[id]) return null;
    const pastEntries = monthlyReportedIdsMap[id];
    const cleanCurrentCat = (field || '').replace(/_ids$/, '');
    const sameCatEntries = pastEntries.filter(e => e.categoryClean === cleanCurrentCat);
    if (sameCatEntries.length > 0) {
      const latest = sameCatEntries[sameCatEntries.length - 1];
      return {
        isSameCategory: true,
        date: latest.date,
        label: latest.categoryLabel
      };
    }
    const firstOther = pastEntries[0];
    return {
      isSameCategory: false,
      date: firstOther.date,
      label: firstOther.categoryLabel
    };
  };

  const fetchFoMonthlyHistory = async (district, fo_name, pin) => {
    if (!district || !fo_name) return;
    try {
      const today = new Date();
      const monthStr = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, '0');
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/my-profile-stats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          working_place: district,
          fo_name: fo_name,
          pin: pin || formData.pin,
          month: monthStr
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          setFoMonthlyHistory(data);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch FO monthly ledger", e);
    }
  };

  const fetchFoCascadeAlerts = async (district, fo_name) => {
    if (!district || !fo_name) return;
    try {
      setLoadingCascadeAlerts(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/reports/cascade-alerts?district=${encodeURIComponent(district)}&fo_name=${encodeURIComponent(fo_name)}`);
      if (res.ok) {
        const json = await res.json();
        setCascadeAlerts(json.data?.alerts || []);
        setCascadeSummary(json.data?.summary || {});
      }
    } catch (e) {
      console.warn("Failed to fetch FO cascade alerts", e);
    } finally {
      setLoadingCascadeAlerts(false);
    }
  };

  const fetchAndStoreDistrictRegistry = useCallback(async (district, force = false) => {
    const targetDist = district || workingPlaceRef.current || formData.working_place;
    if (!targetDist) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    // Freshness guard: If cached within the last 2 hours (7,200,000 ms), skip network fetch to save Firestore reads
    if (!force) {
      try {
        const cached = await getDistrictRegistry(targetDist);
        if (cached && cached.updated_at && (Date.now() - cached.updated_at < 2 * 60 * 60 * 1000) && cached.registry) {
          return;
        }
      } catch (e) {
        // Continue to network fetch if check fails
      }
    }

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/district-notification-registry?district=${encodeURIComponent(targetDist)}&months=3`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.registry) {
          await saveDistrictRegistry(data.district || targetDist, data.registry, data.total_count);
        }
      }
    } catch (err) {
      console.warn("Failed to sync district notification registry:", err);
    }
  }, [formData.working_place]);

  useEffect(() => {
    if (isLoggedIn && formData.working_place) {
      fetchAndStoreDistrictRegistry(formData.working_place);
      if (formData.fo_name) {
        fetchFoCascadeAlerts(formData.working_place, formData.fo_name);
        fetchFoMonthlyHistory(formData.working_place, formData.fo_name, formData.pin);
      }
    }
  }, [isLoggedIn, formData.working_place, formData.fo_name, fetchAndStoreDistrictRegistry]);

  const fetchFoBroadcasts = async (district) => {
    if (!district) return;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/api/broadcasts/active?district=${encodeURIComponent(district)}&role=FIELD_STAFF`);
      if (res.ok) {
        const data = await res.json();
        const list = data.broadcasts || [];
        setActiveFoBroadcasts(list);

        // Check for latest unread HIGH/URGENT announcement
        if (list.length > 0) {
          const highPriority = list.filter(b => b.priority === 'HIGH');
          if (highPriority.length > 0) {
            const latest = highPriority[0];
            try {
              const seenIds = JSON.parse(localStorage.getItem('dfy_seen_broadcasts') || '[]');
              if (!seenIds.includes(latest.id)) {
                setUnreadBroadcastPopup(latest);
              }
            } catch (e) {
              setUnreadBroadcastPopup(latest);
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to fetch active FO broadcasts", err);
    }
  };

  const dismissBroadcastPopup = (broadcastId) => {
    try {
      const seenIds = JSON.parse(localStorage.getItem('dfy_seen_broadcasts') || '[]');
      if (!seenIds.includes(broadcastId)) {
        seenIds.push(broadcastId);
        localStorage.setItem('dfy_seen_broadcasts', JSON.stringify(seenIds));
      }
    } catch (e) {}
    setUnreadBroadcastPopup(null);
  };
  const handleDismissPopup = dismissBroadcastPopup;

  // PWA Install Prompt Listener
  useEffect(() => {
    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setShowInstallBtn(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice && choice.outcome === 'accepted') {
        setShowInstallBtn(false);
        showToast("DFY MIS App install ho gayi hai!", "success");
      }
      setDeferredPrompt(null);
    } else {
      setShowIosInstallModal(true);
    }
  };

  // Persistent Session Auto-Restore on Page Refresh & Morning Offline Auto-Rollover
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const savedSession = localStorage.getItem('dfy_user_session');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        const hasValidCredentials = session && session.working_place && session.fo_name && session.pin;
        const isSameDay = session && session.date === today;
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

        // Restore if it's the same day OR if device is offline (morning field duty rollover)
        if (hasValidCredentials && (isSameDay || isOffline)) {
          const canonicalWp = canonicalizeDistrict(session.working_place);
          
          // Ensure vault is up to date with existing session credentials
          saveToPinVault(canonicalWp, session.fo_name, session.pin);

          // Update session date to today so new submissions have today's timestamp
          if (!isSameDay) {
            session.date = today;
            try {
              localStorage.setItem('dfy_user_session', JSON.stringify(session));
            } catch (e) {}
          }

          // Check for local draft backup
          const draftKey = `dfy_draft_${canonicalWp}_${session.fo_name}`;
          let initialData = {
            working_place: canonicalWp,
            fo_name: session.fo_name,
            pin: session.pin,
            date_of_reporting: today
          };
          const rawDraft = localStorage.getItem(draftKey) || localStorage.getItem(`dfy_draft_${session.working_place}_${session.fo_name}`);
          if (rawDraft) {
            try {
              const parsedDraft = JSON.parse(rawDraft);
              initialData = sanitizeIncomingFormData(parsedDraft, initialData);
            } catch (e) {}
          }
          setFormData(prev => sanitizeIncomingFormData(initialData, { ...prev, ...initialData }));
          setPinStatus("success");
          setIsLoggedIn(true);
          if (!isOffline) {
            fetchFoBroadcasts(canonicalWp);
            fetchFoCascadeAlerts(canonicalWp, session.fo_name);
            fetchAndStoreDistrictRegistry(canonicalWp);
          }
        }
      }
    } catch (e) {
      console.warn("Session restore error", e);
    }
  }, [fetchAndStoreDistrictRegistry]);


  const updateOfflineCount = async () => {
    try {
      const count = await getOfflineReportsCount();
      setOfflineQueueCount(count);
    } catch (e) {}
  };

  const triggerOfflineSync = async () => {
    if (isSyncingOffline) return;
    try {
      setIsSyncingOffline(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await syncAllOfflineReports(API_BASE_URL, (syncedItem, resData) => {
        if (resData && resData.pruned_count > 0) {
          showToast(`ℹ️ Offline report (${syncedItem.date}) me se ${resData.pruned_count} duplicate notifications auto-prune kiye gaye.`, "info");
        }
        showToast(`✓ Offline report for ${syncedItem.date} synced to server! 🎉`, "success");
      });
      await updateOfflineCount();
      if (res.syncedCount > 0) {
        showToast(`✓ All ${res.syncedCount} offline reports synced successfully!`, "success");
        const currentDistrict = workingPlaceRef.current || formData.working_place || (typeof localStorage !== 'undefined' ? (() => {
          try { return JSON.parse(localStorage.getItem('dfy_user_session') || '{}')?.working_place; } catch { return ''; }
        })() : '');
        if (currentDistrict) {
          fetchAndStoreDistrictRegistry(currentDistrict);
        }
      }
    } catch (err) {
      console.warn("Offline sync error", err);
    } finally {
      setIsSyncingOffline(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("🌐 Internet connected! Syncing offline reports...", "success");
      triggerOfflineSync();
      const currentDistrict = workingPlaceRef.current || formData.working_place || (typeof localStorage !== 'undefined' ? (() => {
        try { return JSON.parse(localStorage.getItem('dfy_user_session') || '{}')?.working_place; } catch { return ''; }
      })() : '');
      if (currentDistrict) {
        fetchAndStoreDistrictRegistry(currentDistrict);
        const currentFo = foNameRef.current || formData.fo_name || (typeof localStorage !== 'undefined' ? (() => {
          try { return JSON.parse(localStorage.getItem('dfy_user_session') || '{}')?.fo_name; } catch { return ''; }
        })() : '');
        if (currentFo) {
          fetchFoCascadeAlerts(currentDistrict, currentFo);
        }
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("📴 Offline Mode. Reports will be saved locally.", "info");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateOfflineCount();
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      triggerOfflineSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  // Auto-save draft whenever form data changes while logged in
  useEffect(() => {
    if (isLoggedIn && formData.fo_name && formData.working_place) {
      try {
        const draftKey = `dfy_draft_${formData.working_place}_${formData.fo_name}`;
        localStorage.setItem(draftKey, JSON.stringify(formData));
      } catch (e) {}
    }
  }, [formData, isLoggedIn]);

  const closeToast = () => setToast({ message: "", type: "" });



  useEffect(() => {
    if (formData.pin && formData.pin.length === 4 && formData.fo_name && formData.working_place) {
      setPinStatus("checking");
      let isMounted = true;

      const verify = async () => {
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

        // 1. Direct Offline Verification via PIN Vault
        if (isOffline) {
          const offRes = await verifyPinOffline(formData.working_place, formData.fo_name, formData.pin);
          if (!isMounted) return;

          if (offRes.valid === true) {
            setPinStatus("success");
            showToast("📴 Offline PIN Verified! You can continue your duty.", "success");
          } else if (offRes.valid === false && offRes.reason === 'wrong_pin') {
            setPinStatus("error");
            showToast("Galat PIN! Kripya apna sahi PIN darj karein.", "error");
          } else {
            // Not in vault yet (brand new phone or cleared cache while offline)
            // Emergency Offline Field Duty Mode: Allow valid 4-digit PIN so work is never blocked!
            if (/^\d{4}$/.test(formData.pin)) {
              await saveToPinVault(formData.working_place, formData.fo_name, formData.pin);
              setPinStatus("success");
              showToast("📴 Offline Duty Mode: Sham ko server se verify ho jayega.", "info");
            } else {
              setPinStatus("error");
            }
          }
          return;
        }

        // 2. Online Verification with Server & Fallback
        try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout for spotty 2G/3G

          const res = await fetch(`${API_BASE_URL}/verify-pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, pin: formData.pin }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const data = await res.json();
          if (!isMounted) return;

          if (data.valid) {
            setPinStatus("success");
            await saveToPinVault(formData.working_place, formData.fo_name, formData.pin);
          } else {
            setPinStatus("error");
          }
        } catch (netErr) {
          console.warn("Online PIN check failed or timed out, trying offline vault fallback:", netErr);
          if (!isMounted) return;

          // Fallback to offline vault when network drops or server is slow
          const offRes = await verifyPinOffline(formData.working_place, formData.fo_name, formData.pin);
          if (!isMounted) return;

          if (offRes.valid === true) {
            setPinStatus("success");
            showToast("Network slow hai, offline PIN verify ho gaya.", "info");
          } else if (offRes.valid === false && offRes.reason === 'wrong_pin') {
            setPinStatus("error");
          } else if (/^\d{4}$/.test(formData.pin)) {
            // Emergency fallback
            setPinStatus("success");
            await saveToPinVault(formData.working_place, formData.fo_name, formData.pin);
          } else {
            setPinStatus("error");
          }
        }
      };

      verify();
      return () => { isMounted = false; };
    } else {
      setPinStatus(null);
    }
  }, [formData.pin, formData.fo_name, formData.working_place]);

  const handleDistrictChange = (e) => {
    setFormData({ ...formData, working_place: (e.target.value || "").trim(), fo_name: "", pin: "" });
    setPinStatus(null);
  }

  const handleNameChange = (e) => {
    setFormData({ ...formData, fo_name: (e.target.value || "").trim(), pin: "" });
    setPinStatus(null);
  }

  const morningQuotes = [
    "Ek naya din, ek nayi shuruwat! Jeet ke aana!",
    "Great things never come from comfort zones. Field par macha do!",
    "Success is what happens after you have survived all your mistakes. All the best for today!",
    "Your hard work makes a difference. Have a successful field day!",
    "Aapki mehnat se hi farak padta hai. Best of luck!"
  ];

  const eveningQuotes = [
    "Well done! Aaj ka din bahut badhiya raha. Aaram karein!",
    "Great work today! Aapka dedication lajawab hai.",
    "Mission accomplished! Ab kal milte hain naye josh ke sath.",
    "Another day, another success. Proud of your hard work!",
    "Ek aur behtareen din khatam hua. Good job and good night!"
  ];

  const handleLogout = () => {
    try {
      localStorage.removeItem('dfy_user_session');
    } catch (e) {}
    setIsLoggedIn(false);
    setFormData({
      working_place: "", fo_name: "", pin: "",
      notification_ids: [], hiv_dm_ids: [], dbt_ids: [], 
      sample_collection_ids: [], sample_tested_ids: [], 
      outcome_assigned_ids: [], home_visit_ids: [], 
      contact_tracing_ids: [], follow_up_ids: [], 
      face_to_face_ids: [], presumptive_ids: [], 
      documents_ids: [], fdc_provided_ids: [], fdc_details: [],
      kit_consumption_ids: [], differentiated_tb_ids: [],
      tpt_treatment_start_ids: [], tpt_presumptive_ids: [],
      adhar_face_authentication_ids: [], consent_with_id_ids: [],
      culture_dst_ids: [],
      remark: "", visited_names: []
    });
    setPinStatus(null);
    setCurrentView('form');
    showToast("Logged out successfully", "success");
  };

  const handleLogin = async () => {
    if (pinStatus === 'success') {
      setIsSubmitting(true);
      const today = new Date().toISOString().split('T')[0];
      try {
        // Always ensure credentials saved to local offline PIN vault
        await saveToPinVault(formData.working_place, formData.fo_name, formData.pin);

        if (typeof navigator !== 'undefined' && navigator.onLine) {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const res = await fetch(`${API_BASE_URL}/check-today-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ working_place: formData.working_place, fo_name: formData.fo_name, date: today })
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data && data.data && Object.keys(data.data).length > 0) {
              const d = data.data;
              setFormData(prev => sanitizeIncomingFormData(d, {
                ...prev,
                date_of_reporting: d.date_of_reporting || today
              }));
            } else {
              setFormData(prev => ({ ...prev, date_of_reporting: today }));
            }
          } else {
            setFormData(prev => ({ ...prev, date_of_reporting: today }));
          }
        } else {
          // Offline login: restore from local draft if any exists
          const canonicalWp = canonicalizeDistrict(formData.working_place);
          const draftKey = `dfy_draft_${canonicalWp}_${formData.fo_name}`;
          const rawDraft = localStorage.getItem(draftKey) || localStorage.getItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`);
          if (rawDraft) {
            try {
              const parsedDraft = JSON.parse(rawDraft);
              setFormData(prev => sanitizeIncomingFormData(parsedDraft, { ...prev, ...parsedDraft, date_of_reporting: today }));
            } catch (e) {
              setFormData(prev => ({ ...prev, date_of_reporting: today }));
            }
          } else {
            setFormData(prev => ({ ...prev, date_of_reporting: today }));
          }
        }
      } catch (err) {
        console.warn("Status check notice, continuing login:", err);
        setFormData(prev => ({ ...prev, date_of_reporting: today }));
      } finally {
        // ALWAYS allow login and persist session safely
        try {
          localStorage.setItem('dfy_user_session', JSON.stringify({
            working_place: formData.working_place,
            fo_name: formData.fo_name,
            pin: formData.pin,
            date: today
          }));
        } catch (e) {}

        setIsLoggedIn(true);
        setIsSubmitting(false);
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          fetchFoBroadcasts(formData.working_place);
          fetchFoCascadeAlerts(formData.working_place, formData.fo_name);
          fetchFoMonthlyHistory(formData.working_place, formData.fo_name, formData.pin);
          fetchAndStoreDistrictRegistry(formData.working_place);
        }
        showToast(
          typeof navigator !== 'undefined' && !navigator.onLine 
            ? `📴 Offline Login: Welcome, ${formData.fo_name}!` 
            : `Welcome back, ${formData.fo_name}!`,
          'success'
        );
      }
    }
  };

  // --- Form Ingestion Gate & Duplicate Defense ---
  const handleDirectAddId = async (field, id) => {
    const current = formData[field] || [];
    if (current.includes(id)) {
      showToast(`ID ${id} pehle se added hai!`, "error");
      return false;
    }
    if (field === 'tpt_treatment_start_ids') {
      const presumptive = formData.tpt_presumptive_ids || [];
      if (!presumptive.includes(id)) {
        showToast("Tip: Patient ko TPT Presumptive bucket me bhi record karein.", "success");
      }
    }

    // 1. Strict Duplicate Notification Blocking Gate
    if (field === 'notification_ids') {
      let isDuplicate = false;
      let dupDate = '';
      let dupFoName = '';

      // Check 1: 90-day canonical district registry in IndexedDB/localStorage
      try {
        const regCheck = await isPatientIdNotified(formData.working_place, id);
        if (regCheck && regCheck.notified) {
          isDuplicate = true;
          dupDate = regCheck.date || '';
          dupFoName = regCheck.fo_name || '';
        }
      } catch (e) {
        console.warn("Registry lookup error:", e);
      }

      // Check 2: FO's current month reported history
      if (!isDuplicate) {
        const prevReport = checkMonthlyDuplicate(field, id);
        if (prevReport && prevReport.isSameCategory) {
          isDuplicate = true;
          dupDate = prevReport.date || '';
          dupFoName = formData.fo_name || '';
        }
      }

      if (isDuplicate) {
        setDuplicateBlockModal({
          isOpen: true,
          id: String(id),
          date: dupDate,
          fo_name: dupFoName
        });
        return false;
      }

      setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), id] }));
      return true;
    }

    // 2. Interactive Repeat Intervention Confirmation Gate (Non-notification fields)
    const prevReport = checkMonthlyDuplicate(field, id);
    if (prevReport && prevReport.isSameCategory) {
      setRepeatConfirmModal({
        isOpen: true,
        id: String(id),
        field: field,
        label: prevReport.label || field,
        date: prevReport.date || '',
        onConfirm: () => {
          setFormData(prev => {
            const list = prev[field] || [];
            if (!list.includes(id)) {
              return { ...prev, [field]: [...list, id] };
            }
            return prev;
          });
          showToast(`✓ #${id} added to ${prevReport.label || field}!`, "success");
        }
      });
      return false;
    }

    // Standard unique addition
    setFormData(prev => ({ ...prev, [field]: [...(prev[field] || []), id] }));
    return true;
  };

  const handleMultiAddIds = async (field, newIds) => {
    if (!Array.isArray(newIds) || newIds.length === 0) return;

    const current = formData[field] || [];
    const rawUnique = Array.from(new Set(newIds)).filter(id => !current.includes(id));
    const inFormDuplicatesCount = newIds.length - rawUnique.length;

    // Strict multi-add filtering for Notification IDs
    if (field === 'notification_ids') {
      const uniqueNew = [];
      const blockedDuplicates = [];

      for (const id of rawUnique) {
        let isDup = false;
        let dupInfo = null;

        try {
          const regCheck = await isPatientIdNotified(formData.working_place, id);
          if (regCheck && regCheck.notified) {
            isDup = true;
            dupInfo = regCheck;
          }
        } catch (e) {
          console.warn("Registry lookup error in multi-add:", e);
        }

        if (!isDup) {
          const monthMatch = checkMonthlyDuplicate(field, id);
          if (monthMatch && monthMatch.isSameCategory) {
            isDup = true;
            dupInfo = monthMatch;
          }
        }

        if (isDup) {
          blockedDuplicates.push({ id, ...dupInfo });
        } else {
          uniqueNew.push(id);
        }
      }

      if (uniqueNew.length > 0) {
        setFormData(prev => {
          const prevList = prev[field] || [];
          const toAdd = uniqueNew.filter(id => !prevList.includes(id));
          return {
            ...prev,
            [field]: [...prevList, ...toAdd]
          };
        });
      }

      if (blockedDuplicates.length > 0) {
        const sample = blockedDuplicates.slice(0, 2).map(d => `#${d.id}`).join(', ');
        const extra = blockedDuplicates.length > 2 ? ` (+${blockedDuplicates.length - 2} aur)` : '';
        if (uniqueNew.length > 0) {
          showToast(`⚠️ ${uniqueNew.length} IDs add hui. ${blockedDuplicates.length} duplicate TB Notifications block kiye gaye: ${sample}${extra}`, 'warning');
        } else {
          showToast(`🚫 Sabhi ${blockedDuplicates.length} IDs pehle se Notified hain aur block kar di gayi: ${sample}${extra}`, 'error');
        }
      } else if (inFormDuplicatesCount > 0) {
        showToast(`${uniqueNew.length} IDs add hui (${inFormDuplicatesCount} duplicates ignore ki gayi)`, 'success');
      } else {
        showToast(`${uniqueNew.length} IDs add hui!`, 'success');
      }
      return;
    }

    // Standard multi-add with repeat warnings for other indicators
    const uniqueNew = rawUnique;
    const duplicatesCount = inFormDuplicatesCount;

    const monthlyDuplicates = uniqueNew.filter(id => {
      const match = checkMonthlyDuplicate(field, id);
      return match && match.isSameCategory;
    });

    if (uniqueNew.length > 0) {
      setFormData(prev => {
        const prevList = prev[field] || [];
        const toAdd = uniqueNew.filter(id => !prevList.includes(id));
        return {
          ...prev,
          [field]: [...prevList, ...toAdd]
        };
      });
    }

    if (monthlyDuplicates.length > 0) {
      const sample = monthlyDuplicates.slice(0, 2).map(id => {
        const match = checkMonthlyDuplicate(field, id);
        return `#${id} (${match?.date || ''})`;
      }).join(', ');
      const extra = monthlyDuplicates.length > 2 ? ` (+${monthlyDuplicates.length - 2} aur)` : '';
      const catLabel = checkMonthlyDuplicate(field, monthlyDuplicates[0])?.label || 'issi field';
      showToast(`⚠️ Dhyan dein: ${monthlyDuplicates.length} IDs ${catLabel} me pehle bhi report ho chuki hain: ${sample}${extra}`, 'warning');
    } else if (duplicatesCount > 0) {
      showToast(`${uniqueNew.length} IDs add hui (${duplicatesCount} duplicates ignore ki gayi)`, 'success');
    } else {
      showToast(`${uniqueNew.length} IDs add hui!`, 'success');
    }
  };

  const addId = handleDirectAddId;
  const addMultipleIds = handleMultiAddIds;
  
  const removeId = (field, idx) => {
    setFormData({ ...formData, [field]: formData[field].filter((_, i) => i !== idx) });
  };

  const handleAddFdc = (id, enrichedOrRegimen, strips) => {
    const current = formData.fdc_provided_ids || [];
    if (current.includes(id)) {
      showToast(`ID ${id} pehle se added hai!`, "error");
      return;
    }

    const newDetail = typeof enrichedOrRegimen === 'object' && enrichedOrRegimen !== null
      ? { ...enrichedOrRegimen, id }
      : { 
          id, 
          patient_name: `Patient #${id}`,
          patient_type: 'adult',
          weight_kg: null,
          weight_band: '',
          phase: 'IP',
          fdc_type: enrichedOrRegimen || 'FDC 4', 
          regimen_name: enrichedOrRegimen || '4 FDC (HRZE)', 
          daily_dose_text: `${enrichedOrRegimen || 'FDC 4'} daily`,
          supply_issued: `${strips || 1} strips`,
          strips: strips || 1 
        };

    const prevReport = checkMonthlyDuplicate('fdc_provided_ids', id);
    if (prevReport && prevReport.isSameCategory) {
      setRepeatConfirmModal({
        isOpen: true,
        id: String(id),
        field: 'fdc_provided_ids',
        label: prevReport.label || 'FDC Medicine Distribution',
        date: prevReport.date || '',
        onConfirm: () => {
          setFormData(prev => {
            const existing = (prev.fdc_details || []).filter(d => d.id !== id);
            const currentFdc = prev.fdc_provided_ids || [];
            return {
              ...prev,
              fdc_provided_ids: currentFdc.includes(id) ? currentFdc : [...currentFdc, id],
              fdc_details: [...existing, newDetail]
            };
          });
          showToast(`✓ #${id} added to FDC Medicine Distribution!`, "success");
        }
      });
      return;
    }

    setFormData(prev => {
      const existing = (prev.fdc_details || []).filter(d => d.id !== id);
      return {
        ...prev,
        fdc_provided_ids: [...(prev.fdc_provided_ids || []), id],
        fdc_details: [...existing, newDetail]
      };
    });
  };

  const handleUpdateFdc = (id, patch) => {
    setFormData(prev => {
      const existing = (prev.fdc_details || []);
      const idx = existing.findIndex(d => d.id === id);
      let updatedList;
      if (idx !== -1) {
        updatedList = [...existing];
        updatedList[idx] = { ...updatedList[idx], ...patch };
      } else {
        updatedList = [...existing, { id, fdc_type: 'FDC 4', strips: 1, ...patch }];
      }
      return {
        ...prev,
        fdc_details: updatedList
      };
    });
  };

  const handleRemoveFdc = (idx, id) => {
    removeId('fdc_provided_ids', idx);
    setFormData(prev => ({
      ...prev,
      fdc_details: (prev.fdc_details || []).filter(d => d.id !== id)
    }));
  };

  const handleAutofillPendingId = async (fieldKey, patientId, label) => {
    const current = formData[fieldKey] || [];
    if (current.includes(patientId)) {
      showToast(`ID #${patientId} pehle se ${label} me add hai!`, "error");
      return;
    }
    const added = await handleDirectAddId(fieldKey, patientId);
    if (added) {
      showToast(`✓ #${patientId} added to ${label}!`, "success");
    }
    setCurrentView('form');
  };
  
  const addDoctor = () => {
    const trimmed = docName.trim();
    if(trimmed) {
      if (formData.visited_names.includes(trimmed)) {
        showToast(`${trimmed} pehle se added hai!`, "error");
        return;
      }
      setFormData({ ...formData, visited_names: [...formData.visited_names, trimmed] });
      setDocName("");
    }
  };



  const generateWhatsAppText = () => {
    const reportDate = formData.date_of_reporting || new Date().toISOString().split('T')[0];
    let text = `*Daily Field Report - ${reportDate}*\n`;
    text += `*Name:* ${formData.fo_name} (${formData.working_place})\n`;
    text += `*Designation:* Field Officer\n`;
    text += `*Status:* Report Submitted ✓\n\n`;

    if (formData.visited_names && formData.visited_names.length > 0) {
      text += `*Doctors/Stores Visited:*\n`;
      text += formData.visited_names.join('\n') + '\n\n';
    }

    text += `*Work Metrics:*\n`;
    
    const categories = [
      { key: 'notification_ids', label: 'Notification' },
      { key: 'hiv_dm_ids', label: 'HIV & DM' },
      { key: 'dbt_ids', label: 'DBT' },
      { key: 'sample_collection_ids', label: 'Sample Collection' },
      { key: 'sample_tested_ids', label: 'Sample Tested' },
      { key: 'outcome_assigned_ids', label: 'Outcome Assigned' },
      { key: 'home_visit_ids', label: 'Home Visit' },
      { key: 'contact_tracing_ids', label: 'Contact Tracing' },
      { key: 'follow_up_ids', label: 'Follow Up' },
      { key: 'face_to_face_ids', label: 'Face to Face' },
      { key: 'presumptive_ids', label: 'Presumptive' },
      { key: 'documents_ids', label: 'Documents' },
      { key: 'fdc_provided_ids', label: 'FDC Provided' },
      { key: 'kit_consumption_ids', label: 'Kit Consumption' },
      { key: 'differentiated_tb_ids', label: 'Differentiated TB' },
      { key: 'tpt_treatment_start_ids', label: 'TPT Treatment Start' },
      { key: 'tpt_presumptive_ids', label: 'TPT Presumptive' },
      { key: 'adhar_face_authentication_ids', label: 'Adhar Face Auth' },
      { key: 'consent_with_id_ids', label: 'Consent with ID' },
      { key: 'culture_dst_ids', label: 'Culture / DST' }
    ];

    let hasMetrics = false;
    categories.forEach(cat => {
      const ids = formData[cat.key] || [];
      if (ids.length > 0) {
        hasMetrics = true;
        text += `\n*${cat.label}:* ${ids.length}\n`;
        if (cat.key === 'fdc_provided_ids' && formData.fdc_details && formData.fdc_details.length > 0) {
          const fdcLines = ids.map(id => {
            const det = formData.fdc_details.find(d => d && d.id === id);
            return det ? `${id} (${det.fdc_type || 'FDC 4'}, ${det.strips || 1} Strip)` : id;
          });
          text += fdcLines.join('\n') + '\n';
        } else {
          text += ids.join('\n') + '\n';
        }
      }
    });

    if (!hasMetrics) {
      text += '\nNone\n';
    }

    if (formData.remark && formData.remark.trim() !== '') {
      text += `\n*Remarks:*\n` + formData.remark.trim() + '\n';
    }

    return text.trim();
  };

  const copyToWhatsApp = () => {
    const text = generateWhatsAppText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast('Copied! Paste in WhatsApp.', 'success')).catch(() => showToast('Failed to copy', 'error'));
    }
  };


  const submitReport = async () => {
    if (isSubmitting) return;
    if(!formData.working_place || !formData.fo_name || !formData.pin) {
      showToast("Pehle Zila, Naam aur PIN bharo!", "error");
      return;
    }
    
    setIsSubmitting(true);
    const payload = { 
      ...formData, 
      working_place: (formData.working_place || '').trim(),
      fo_name: (formData.fo_name || '').trim(),
      date: formData.date_of_reporting || new Date().toISOString().split('T')[0] 
    };

    // Keep credentials secured in offline vault
    try {
      await saveToPinVault(payload.working_place, payload.fo_name, payload.pin);
    } catch (e) {}

    const summaryText = generateWhatsAppText();
    const totalCount = [
      'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
      'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
      'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
      'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
      'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids',
      'culture_dst_ids'
    ].reduce((sum, k) => sum + (Array.isArray(formData[k]) ? formData[k].length : 0), 0);

    const hasVisited = Array.isArray(formData.visited_names) && formData.visited_names.length > 0;
    const hasRemark = Boolean(formData.remark && formData.remark.trim());

    if (totalCount === 0 && !hasVisited && !hasRemark) {
      showToast("⚠️ Khali report submit nahi ho sakti! Kripya kam se kam ek Patient ID, Doctor Visit, ya Remark darj karein.", "error");
      setIsSubmitting(false);
      return;
    }

    // Direct Offline Submission via IndexedDB
    if (!navigator.onLine) {
      try {
        await saveOfflineReport(payload);
        setShowReviewModal(false);
        try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}
        await updateOfflineCount();

        setSubmittedReportSummary({
          text: summaryText,
          date: payload.date,
          totalIds: totalCount,
          isOffline: true
        });
        setShowPostSubmitSuccess(true);
        showToast("📴 Internet nahi hai. Report phone me safe save ho gayi hai aur connection aane par auto-sync ho jayegi!", "success");
      } catch (err) {
        showToast("Failed to save report to offline queue.", "error");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    try {
      showToast("Saving your report...", "success");
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const response = await fetch(`${API_BASE_URL}/submit-daily-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if(response.ok) {
        setShowReviewModal(false);
        try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}
        showToast("✓ Final Report Submitted Successfully!", "success");

        setSubmittedReportSummary({
          text: summaryText,
          date: payload.date,
          totalIds: totalCount,
          isOffline: false
        });
        setShowPostSubmitSuccess(true);
        fetchFoMonthlyHistory(formData.working_place, formData.fo_name, formData.pin);
        fetchFoCascadeAlerts(formData.working_place, formData.fo_name);
        fetchAndStoreDistrictRegistry(formData.working_place);
      } else {
        const result = await response.json();
        showToast(result.detail || "Error in saving data.", "error");
      }
    } catch(err) {
      console.warn("Network drop during submit, saving to IndexedDB:", err);
      try {
        await saveOfflineReport(payload);
        setShowReviewModal(false);
        try { localStorage.removeItem(`dfy_draft_${formData.working_place}_${formData.fo_name}`); } catch (e) {}
        await updateOfflineCount();

        setSubmittedReportSummary({
          text: summaryText,
          date: payload.date,
          totalIds: totalCount,
          isOffline: true
        });
        setShowPostSubmitSuccess(true);
        showToast("📴 Network issue! Report phone ke offline database me safe save ho gayi hai.", "success");
      } catch (e2) {
        showToast("Network error while submitting report.", "error");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const group1 = [
    { key: "notification_ids", label: "Notification" },
    { key: "hiv_dm_ids", label: "HIV & DM" },
    { key: "dbt_ids", label: "DBT" },
  ];
  const group2 = [
    { key: "sample_collection_ids", label: "Sample Collection" },
    { key: "sample_tested_ids", label: "Sample Tested" },
    { key: "outcome_assigned_ids", label: "Outcome Assigned" },
  ];
  const group3 = [
    { key: "home_visit_ids", label: "Home Visit" },
    { key: "contact_tracing_ids", label: "Contact Tracing" },
    { key: "follow_up_ids", label: "Follow Up" },
    { key: "face_to_face_ids", label: "Face to Face" },
    { key: "presumptive_ids", label: "Presumptive" },
  ];
  const group4 = [
    { key: "documents_ids", label: "Documents" },
    { key: "fdc_provided_ids", label: "FDC Provided" },
    { key: "kit_consumption_ids", label: "Kit Consumption" }
  ];
  const group5 = [
    { key: "differentiated_tb_ids", label: "Differentiated TB" },
    { key: "tpt_treatment_start_ids", label: "TPT Treatment Start" },
    { key: "tpt_presumptive_ids", label: "TPT Presumptive" },
    { key: "adhar_face_authentication_ids", label: "Adhar Face Auth" },
    { key: "consent_with_id_ids", label: "Consent with ID" }
  ];

  const handleScrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (el) {
      const accordionBtn = el.querySelector('button[data-accordion-btn]');
      if (accordionBtn && el.getAttribute('data-is-open') === 'false') {
        accordionBtn.click();
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans pb-40 text-slate-800 flex flex-col">
      <Toast message={toast.message} type={toast.type} onClose={closeToast} />

      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 p-3.5 sm:p-4 sticky top-0 z-40 shadow-xs">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-700 h-10 w-10 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center shadow-md shadow-teal-700/20 text-white font-black text-xl shrink-0">
              <svg width="20" height="20" className="sm:w-[22px] sm:h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-tight text-slate-800">DFY <span className="text-teal-700">REPORTING</span></h1>
              <p className="text-slate-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-0.5">Mobile MIS Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <button onClick={() => window.location.href = '/admin'} className="flex items-center gap-1 sm:gap-1.5 text-slate-500 hover:text-teal-700 bg-slate-100/80 hover:bg-teal-50 px-2.5 py-1 rounded-full transition-colors border border-transparent hover:border-teal-200 text-[10px] font-black tracking-wider cursor-pointer" title="Admin Portal">
              <svg width="12" height="12" className="sm:w-[13px] sm:h-[13px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M16 21v-2a4 4 0 0 0-4-3.87"/></svg>
              <span className="hidden sm:inline">ADMIN</span>
            </button>
            <button onClick={handleInstallApp} className="flex items-center gap-1 bg-gradient-to-r from-teal-700 to-emerald-700 text-white hover:from-teal-800 hover:to-emerald-800 px-3 py-1 rounded-full text-[10px] font-black shadow-xs shadow-teal-700/20 transition-all active:scale-[0.98] cursor-pointer" title="Install App">
              <span>📲</span>
              <span className="hidden xs:inline">Install</span>
            </button>
            <div className="bg-teal-50/90 text-teal-800 px-2.5 sm:px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-black border border-teal-200 shadow-2xs tracking-wider">v{APP_VERSION}</div>
            {(!isOnline || offlineQueueCount > 0) && (
              <button
                onClick={triggerOfflineSync}
                disabled={!isOnline || isSyncingOffline}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-black border transition-all ${
                  !isOnline 
                    ? 'bg-amber-50 text-amber-800 border-amber-200 cursor-default' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 cursor-pointer animate-pulse'
                }`}
                title={!isOnline ? "Offline Mode: Internet nahi hai, data phone me save hoga" : `${offlineQueueCount} offline reports queued. Click to sync now.`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${!isOnline ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                <span>{!isOnline ? 'Offline' : `Sync (${offlineQueueCount})`}</span>
              </button>
            )}
            {isLoggedIn && (
              <>
                {activeFoBroadcasts.length > 0 && (
                  <button 
                    onClick={() => setShowAllAlertsModal(true)} 
                    className="relative flex items-center justify-center p-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 transition-all active:scale-95 cursor-pointer"
                    title="View Important Announcements"
                  >
                    <span className="text-sm">📢</span>
                    <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-pulse">
                      {activeFoBroadcasts.length}
                    </span>
                  </button>
                )}

                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors ml-1 cursor-pointer" title="Logout">
                  <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={`max-w-4xl mx-auto px-4 sm:px-6 w-full flex-1 flex flex-col ${!isLoggedIn ? "items-center justify-center py-10" : "py-6"}`}>
        {!isLoggedIn ? (
          /* Login Screen */
          <div className="max-w-md mx-auto animate-fade-in-down w-full">
            <div className="text-center mb-8">
              <div className="mx-auto bg-gradient-to-br from-teal-600 to-emerald-700 text-white w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-md shadow-teal-700/20">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-1">Field Officer Login</h2>
              <p className="text-slate-500 text-xs font-semibold">Select your district, name &amp; enter 4-digit PIN.</p>
            </div>
            
            {/* PWA Install Banner */}
            {showInstallBtn && (
              <div className="mb-5 bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 rounded-3xl p-4 sm:p-5 text-white flex items-center justify-between shadow-lg shadow-teal-900/20 border border-teal-600/30 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl shrink-0">
                    📲
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-black tracking-wide leading-tight">Install Mobile App</h4>
                    <p className="text-[10px] text-teal-100 font-medium">Home screen par 1-click access</p>
                  </div>
                </div>
                <button 
                  onClick={handleInstallApp}
                  className="bg-white text-teal-800 hover:bg-teal-50 font-black text-[11px] sm:text-xs px-3.5 py-2 rounded-xl shadow-md active:scale-[0.98] transition-all shrink-0 uppercase tracking-wider cursor-pointer"
                >
                  Install
                </button>
              </div>
            )}

            <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(15,118,110,0.06)] p-6 sm:p-8 border border-slate-200/80">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1.5 ml-0.5">District (Zila)</label>
                  <select value={formData.working_place} onChange={handleDistrictChange} className="w-full bg-slate-50/90 border border-slate-200/90 rounded-xl px-4 py-3 text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white transition-all shadow-2xs cursor-pointer">
                    <option value="">Select District</option>
                    {districts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                
                {formData.working_place && (
                  <div className="animate-fade-in">
                    <label className="block text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1.5 ml-0.5">Select / Enter Name</label>
                    {directory[formData.working_place] && directory[formData.working_place].length > 0 ? (
                      <select value={formData.fo_name} onChange={handleNameChange} className="w-full bg-slate-50/90 border border-slate-200/90 rounded-xl px-4 py-3 text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white transition-all shadow-2xs cursor-pointer">
                        <option value="">Select Name</option>
                        {directory[formData.working_place].map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={formData.fo_name}
                        onChange={handleNameChange}
                        placeholder="Apna Naam Likhein (e.g. Rajesh Kumar)"
                        className="w-full bg-slate-50/90 border border-slate-200/90 rounded-xl px-4 py-3 text-sm text-slate-800 font-bold outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white transition-all shadow-2xs"
                        required
                      />
                    )}
                  </div>
                )}

                {formData.fo_name && (
                  <div className="animate-fade-in">
                    <label className="block text-[10px] text-slate-500 font-black uppercase tracking-wider mb-1.5 ml-0.5 flex items-center justify-between">
                      <span>Enter Secret PIN</span>
                      {!isOnline && (
                        <span className="text-[10px] text-amber-600 font-bold">📴 offline mode</span>
                      )}
                    </label>
                    <input 
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      placeholder="****" 
                      maxLength="4" 
                      value={formData.pin} 
                      onChange={(e) => setFormData({...formData, pin: e.target.value.replace(/\D/g, '')})} 
                      className={`w-full bg-slate-50/90 border ${pinStatus === 'success' ? 'border-emerald-500 ring-2 ring-emerald-200' : pinStatus === 'error' ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-200/90'} rounded-xl px-4 py-3.5 text-2xl tracking-widest text-slate-800 font-black outline-none text-center transition-all shadow-inner focus:bg-white`} 
                    />
                    {pinStatus === 'checking' && (
                      <p className="text-[11px] text-teal-600 font-bold text-center mt-1.5 animate-pulse">
                        Verifying PIN...
                      </p>
                    )}
                    {pinStatus === 'success' && (
                      <p className="text-[11px] text-emerald-600 font-bold text-center mt-1.5 flex items-center justify-center gap-1">
                        <span>✓</span> {!isOnline ? 'Offline PIN Verified' : 'PIN Verified'}
                      </p>
                    )}
                    {pinStatus === 'error' && (
                      <p className="text-[11px] text-rose-500 font-bold text-center mt-1.5">
                        ✕ Sahi 4-digit PIN darj karein
                      </p>
                    )}
                  </div>
                )}

                <button 
                  onClick={handleLogin}
                  disabled={pinStatus !== 'success' || isSubmitting}
                  className={`w-full mt-4 py-3.5 rounded-xl font-black text-xs tracking-wider uppercase shadow-md transition-all cursor-pointer ${pinStatus === 'success' && !isSubmitting ? 'bg-gradient-to-r from-teal-700 to-emerald-700 text-white hover:from-teal-800 hover:to-emerald-800 hover:shadow-teal-700/30 active:scale-[0.98]' : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-teal-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Checking Status...</span>
                    </div>
                  ) : 'Continue'}
                </button>
              </div>
            </div>
          </div>
          ) : currentView === 'pending' ? (
            <div className="animate-fade-in w-full max-w-lg mx-auto pb-10">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                    <span>⚡</span>
                    <span>Pending Interventions</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Priority follow-up actions for your notified TB patients
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fetchFoCascadeAlerts(formData.working_place, formData.fo_name)}
                  disabled={loadingCascadeAlerts}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <span className={loadingCascadeAlerts ? "animate-spin" : ""}>🔄</span>
                  <span>Sync</span>
                </button>
              </div>

              <PendingInterventionsActionCenter 
                cascadeAlerts={cascadeAlerts}
                cascadeSummary={cascadeSummary}
                loading={loadingCascadeAlerts}
                formData={formData}
                onAutofill={handleAutofillPendingId}
                showToast={showToast}
                onRefresh={() => fetchFoCascadeAlerts(formData.working_place, formData.fo_name)}
                fullView={true}
              />
            </div>
          ) : currentView === 'profile' ? (
            <MyProfileDashboard 
              formData={formData} 
              showToast={showToast} 
              stats={foMonthlyHistory}
              setStats={setFoMonthlyHistory}
              onRefreshStats={() => fetchFoMonthlyHistory(formData.working_place, formData.fo_name, formData.pin)}
            />
          ) : currentView === 'tracker' ? (
            <PatientJourneyTracker 
              formData={formData}
              showToast={showToast}
              suggestedIds={formData.notification_ids || []}
            />
          ) : currentView === 'guide' ? (
            <FoHelpGuide />
          ) : (
            /* Main Dashboard */
            <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">
              {/* Top Urgent Notice Banner for Field Officers */}
              {activeFoBroadcasts.length > 0 && (
                <div className="mb-5 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <span>📢</span>
                      <span>Notice Board ({activeFoBroadcasts.length})</span>
                    </h3>
                    <button 
                      onClick={() => fetchFoBroadcasts(formData.working_place)} 
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      Refresh
                    </button>
                  </div>
                  {activeFoBroadcasts.map((b) => {
                    const isHigh = b.priority === 'HIGH';
                    const isMed = b.priority === 'MEDIUM';
                    const bgClass = isHigh ? 'bg-gradient-to-r from-rose-50 to-red-50 border-rose-200' : isMed ? 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200' : 'bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200';
                    const textClass = isHigh ? 'text-rose-950' : isMed ? 'text-amber-950' : 'text-indigo-950';
                    const badgeClass = isHigh ? 'bg-rose-600 text-white' : isMed ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white';
                    const icon = isHigh ? '🚨' : isMed ? '⚠️' : '📢';

                    return (
                      <div key={b.id} className={`p-4 rounded-2xl border shadow-sm ${bgClass} ${textClass} space-y-2`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{icon}</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeClass}`}>
                              {b.priority || 'MEDIUM'}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 bg-white/70 px-2 py-0.5 rounded-md border border-slate-200/50">
                            {b.created_by_user}
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-black tracking-tight">{b.title}</h4>
                        <p className="text-xs font-medium opacity-90 leading-relaxed whitespace-pre-wrap">{b.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}


              {/* Real-time Floating Mini-HUD for daily entries */}
              <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 p-3 shadow-sm mb-4 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${liveTotalIds > 0 ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${liveTotalIds > 0 ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    </span>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block leading-tight">Live Session Tally</span>
                      <span className="text-xs font-black text-slate-800">
                        {liveTotalIds} {liveTotalIds === 1 ? 'Patient ID' : 'Patient IDs'} Recorded
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border transition-colors ${
                      liveNotifCount > 0 
                        ? 'bg-teal-50 text-teal-800 border-teal-200 shadow-2xs' 
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`} title="TB Notifications">
                      📋 {liveNotifCount} Notif
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border transition-colors ${
                      liveFdcCount > 0 
                        ? 'bg-teal-50 text-teal-700 border-teal-200 shadow-2xs' 
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`} title="FDC Medicine Distributed">
                      💊 {liveFdcCount} FDC
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border transition-colors ${
                      liveVisitsCount > 0 
                        ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-2xs' 
                        : 'bg-slate-50 text-slate-400 border-slate-200'
                    }`} title="Doctor / Chemist Visits">
                      🏥 {liveVisitsCount} Visits
                    </span>
                  </div>
                </div>

                {/* Sticky Category Quick-Jumping Pills (Scroll Navigator) */}
                <div className="mt-2.5 pt-2 border-t border-slate-100/80 flex items-center gap-1.5 overflow-x-auto custom-scrollbar no-scrollbar py-0.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 shrink-0 mr-0.5">Jump:</span>
                  {[
                    { id: 'sec-registration', label: '👤 Patient' },
                    { id: 'sec-diagnostics', label: '🧪 Testing' },
                    { id: 'sec-fieldwork', label: '🏠 Visits' },
                    { id: 'sec-logistics', label: '💊 FDC / Logistics' },
                    { id: 'sec-special', label: '⭐ Special' },
                    { id: 'sec-doctors', label: '🩺 Doctors' },
                    { id: 'sec-remarks', label: '📝 Remarks' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleScrollToSection(cat.id)}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100/80 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 text-slate-600 border border-slate-200/80 transition-all active:scale-[0.98] shrink-0 cursor-pointer shadow-2xs whitespace-nowrap flex items-center gap-1"
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <Accordion id="sec-registration" title="1. Patient Registration" defaultOpen={true}>
                  {group1.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={cat.key !== 'notification_ids' ? (formData.notification_ids || []) : []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion id="sec-diagnostics" title="2. Diagnostics & Testing">
                  {group2.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                      allow8Digit={cat.key === 'outcome_assigned_ids'}
                    />
                  ))}
                  {formData.working_place === 'Buxar' && (
                    <IdBucket 
                      key="culture_dst_ids" 
                      title="Culture / DST (Buxar Special)" 
                      ids={formData.culture_dst_ids || []} 
                      onAdd={(id) => addId('culture_dst_ids', id)} 
                      onAddMultiple={(ids) => addMultipleIds('culture_dst_ids', ids)} 
                      onRemove={(idx) => removeId('culture_dst_ids', idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds('culture_dst_ids', newIds)}
                    />
                  )}
                </Accordion>
                <Accordion id="sec-fieldwork" title="3. Field Work & Visits">
                  {group3.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key]} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion id="sec-logistics" title="4. Logistics & Outcomes">
                  {group4.map((cat) => {
                    if (cat.key === 'fdc_provided_ids') {
                      return (
                        <FdcBucket 
                          key={cat.key} 
                          title={cat.label} 
                          ids={formData.fdc_provided_ids} 
                          fdcDetails={formData.fdc_details || []}
                          onAddFdc={handleAddFdc}
                          onUpdateFdc={handleUpdateFdc}
                          onRemoveFdc={handleRemoveFdc}
                          showToast={showToast}
                          suggestedIds={formData.notification_ids || []}
                        />
                      );
                    }
                    return (
                      <IdBucket 
                        key={cat.key} 
                        title={cat.label} 
                        ids={formData[cat.key]} 
                        onAdd={(id) => addId(cat.key, id)} 
                        onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                        onRemove={(idx) => removeId(cat.key, idx)} 
                        showToast={showToast}
                        suggestedIds={formData.notification_ids || []}
                        onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                      />
                    );
                  })}
                </Accordion>
                <Accordion id="sec-special" title="5. Special Tracking">
                  {group5.map((cat) => (
                    <IdBucket 
                      key={cat.key} 
                      title={cat.label} 
                      ids={formData[cat.key] || []} 
                      onAdd={(id) => addId(cat.key, id)} 
                      onAddMultiple={(ids) => addMultipleIds(cat.key, ids)} 
                      onRemove={(idx) => removeId(cat.key, idx)} 
                      showToast={showToast}
                      suggestedIds={formData.notification_ids || []}
                      onAddBulk={(newIds) => addMultipleIds(cat.key, newIds)}
                    />
                  ))}
                </Accordion>
                <Accordion id="sec-remarks" title="6. Additional Remarks">
                  <div className="p-4 sm:p-5">
                    <textarea 
                      value={formData.remark || ''} 
                      onChange={e => setFormData({...formData, remark: e.target.value})} 
                      placeholder="Koi extra information ya remark yahan likhein..." 
                      className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-teal-500 transition-all placeholder:text-slate-400 min-h-[120px]"
                    ></textarea>
                  </div>
                </Accordion>

              {/* Travel & Doctors Section */}
              <div id="sec-doctors" className="grid grid-cols-1 gap-4 mt-6 scroll-mt-36">
                <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xs border border-emerald-200/80 overflow-hidden">
                  <div className="bg-emerald-50/70 px-5 py-4 border-b border-emerald-100/90 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <label className="block text-xs font-black text-emerald-900 tracking-wide uppercase">Doctor / Chemist Store Visits</label>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={docName} 
                        onChange={(e) => setDocName(e.target.value)} 
                        placeholder="Doctor ya Medical Store ka Naam Likhein" 
                        className="flex-1 w-full h-12 bg-slate-50/90 border border-slate-300 text-slate-900 text-sm font-semibold rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 focus:bg-white transition-all placeholder:text-slate-400 shadow-2xs" 
                      />
                      <button 
                        type="button"
                        onClick={addDoctor} 
                        className="h-12 min-w-[76px] bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white px-4 rounded-xl font-black shadow-xs shadow-teal-700/20 active:scale-[0.98] transition-all text-xs tracking-wider uppercase shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        ADD
                      </button>
                    </div>
                    {formData.visited_names.length > 0 && (
                      <ul className="mt-3.5 space-y-2">
                        {formData.visited_names.map((name, i) => (
                          <li key={i} className="flex justify-between items-center bg-slate-50/90 border border-slate-200/80 px-4 py-2.5 rounded-xl text-xs text-slate-800 font-bold shadow-2xs hover:bg-white hover:border-slate-300 transition-all">
                            <span className="flex items-center gap-2.5">
                              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                              <span>{name}</span>
                            </span>
                            <button 
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, visited_names: formData.visited_names.filter((_, idx) => idx !== i) });
                              }} 
                              className="text-slate-400 hover:text-white hover:bg-rose-500 bg-slate-100 h-6 w-6 rounded-lg flex items-center justify-center font-black text-xs transition-all shadow-2xs cursor-pointer"
                              title="Remove"
                            >
                              &times;
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Spacer for Sticky Footer */}
              <div className="h-36 w-full pointer-events-none"></div>

              {/* Modern Sticky Bottom Action Bar (Sits right above bottom nav dock) */}
              <div className="fixed bottom-14 sm:bottom-16 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 p-3 sm:p-3.5 shadow-[0_-10px_35px_rgba(0,0,0,0.06)] z-40">
                <div className="max-w-md mx-auto space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 px-1">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${liveTotalIds > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                      <span>Total IDs: <strong className="text-slate-900 tabular-num">{liveTotalIds}</strong></span>
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      {liveFdcCount > 0 && (
                        <span className="bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded-md font-black tabular-num">
                          💊 {liveFdcCount} FDC
                        </span>
                      )}
                      {liveVisitsCount > 0 && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-md font-black tabular-num">
                          🏥 {liveVisitsCount} Visits
                        </span>
                      )}
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      if(!formData.working_place || !formData.fo_name || !formData.pin) {
                        showToast("Pehle Zila, Naam aur PIN bharo!", "error");
                        return;
                      }
                      const totalCount = [
                        'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
                        'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
                        'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
                        'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
                        'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids',
                        'culture_dst_ids'
                      ].reduce((sum, k) => sum + (Array.isArray(formData[k]) ? formData[k].length : 0), 0);

                      const hasVisited = Array.isArray(formData.visited_names) && formData.visited_names.length > 0;
                      const hasRemark = Boolean(formData.remark && formData.remark.trim());

                      if (totalCount === 0 && !hasVisited && !hasRemark) {
                        showToast("⚠️ Khali report submit nahi ho sakti! Kripya kam se kam ek Patient ID, Doctor Visit, ya Remark darj karein.", "error");
                        return;
                      }
                      setShowReviewModal(true);
                    }} 
                    disabled={isSubmitting}
                    className={`w-full min-h-[52px] bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white font-black text-xs sm:text-sm py-3 px-6 rounded-2xl shadow-lg shadow-teal-800/25 active:scale-[0.98] transition-all tracking-wider uppercase flex justify-center items-center gap-2 cursor-pointer ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span>Submitting...</span>
                      </>
                    ) : 'Review & Submit Daily Report →'}
                  </button>
                </div>
              </div>
            </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* --- FO MOBILE BOTTOM NAVIGATION DOCK (FIXED DOCK) --- */}
      {/* ========================================================================= */}
      {isLoggedIn && (
        <nav 
          aria-label="Bottom Navigation" 
          className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 z-50 shadow-[0_-4px_25px_rgba(0,0,0,0.08)]"
        >
          <div className="max-w-md mx-auto grid grid-cols-5 px-1 sm:px-2 py-1 gap-0.5 sm:gap-1">
            {/* Tab 1: Form / Report */}
            <button
              type="button"
              onClick={() => setCurrentView('form')}
              className={`min-h-[48px] h-12 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                currentView === 'form' 
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 font-black shadow-2xs' 
                  : 'text-slate-400 hover:text-slate-600 font-bold'
              }`}
            >
              <span className="text-base sm:text-lg">📝</span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-tight mt-0.5 font-bold truncate">Report</span>
            </button>

            {/* Tab 2: Pending Interventions */}
            <button
              type="button"
              onClick={() => setCurrentView('pending')}
              className={`min-h-[48px] h-12 relative flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                currentView === 'pending' 
                  ? 'bg-rose-50 text-rose-800 border border-rose-200 font-black shadow-2xs' 
                  : 'text-slate-400 hover:text-slate-600 font-bold'
              }`}
            >
              <span className="text-base sm:text-lg">⚡</span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-tight mt-0.5 font-bold truncate">Pending</span>
              {cascadeAlerts.length > 0 && (
                <span className="absolute top-0.5 right-1 sm:right-2 bg-rose-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-pulse tabular-num">
                  {cascadeAlerts.length > 99 ? '99+' : cascadeAlerts.length}
                </span>
              )}
            </button>

            {/* Tab 3: Tracker / Patient Journey */}
            <button
              type="button"
              onClick={() => setCurrentView('tracker')}
              className={`min-h-[48px] h-12 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                currentView === 'tracker' 
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 font-black shadow-2xs' 
                  : 'text-slate-400 hover:text-slate-600 font-bold'
              }`}
            >
              <span className="text-base sm:text-lg">🔍</span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-tight mt-0.5 font-bold truncate">Tracker</span>
            </button>

            {/* Tab 4: Profile */}
            <button
              type="button"
              onClick={() => setCurrentView('profile')}
              className={`min-h-[48px] h-12 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                currentView === 'profile' 
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 font-black shadow-2xs' 
                  : 'text-slate-400 hover:text-slate-600 font-bold'
              }`}
            >
              <span className="text-base sm:text-lg">👤</span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-tight mt-0.5 font-bold truncate">Profile</span>
            </button>

            {/* Tab 5: Guide */}
            <button
              type="button"
              onClick={() => setCurrentView('guide')}
              className={`min-h-[48px] h-12 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 cursor-pointer ${
                currentView === 'guide' 
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 font-black shadow-2xs' 
                  : 'text-slate-400 hover:text-slate-600 font-bold'
              }`}
            >
              <span className="text-base sm:text-lg">📖</span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-tight mt-0.5 font-bold truncate">Guide</span>
            </button>
          </div>
        </nav>
      )}

        {/* Post-Submission Success & WhatsApp Summary Modal */}
      {showPostSubmitSuccess && submittedReportSummary && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-fade-in">
            
            {/* Success Header */}
            <div className="text-center pb-4 border-b border-slate-100 mb-3">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-2 shadow-inner">
                🎉
              </div>
              <h3 className="text-xl font-black text-slate-800">Daily Field Report Submitted Successfully!</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">
                {formData.fo_name} &bull; {formData.working_place} &bull; {submittedReportSummary.date}
              </p>
            </div>

            {/* WhatsApp Summary Box */}
            <div className="flex-1 overflow-y-auto space-y-2.5 custom-scrollbar pr-1 my-1">
              <div className="flex justify-between items-center px-1">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <span>📱</span> WhatsApp Summary:
                </span>
                <span className="text-[10px] font-bold bg-teal-50 text-teal-800 px-2.5 py-0.5 rounded-full border border-teal-200/80">
                  {submittedReportSummary.totalIds} IDs Recorded
                </span>
              </div>

              <div className="bg-slate-900 text-emerald-400 font-mono text-xs p-4 rounded-2xl border border-slate-800 whitespace-pre-wrap max-h-56 overflow-y-auto custom-scrollbar select-all">
                {submittedReportSummary.text}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(submittedReportSummary.text)}`;
                    window.open(shareUrl, '_blank');
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-all text-xs tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                  title="Directly open WhatsApp to send summary"
                >
                  <span className="text-base">💬</span>
                  <span>WhatsApp Share</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(submittedReportSummary.text);
                      setCopiedPostSubmit(true);
                      showToast("WhatsApp summary copied to clipboard!", "success");
                      setTimeout(() => setCopiedPostSubmit(false), 2500);
                    }
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3.5 rounded-2xl active:scale-[0.98] transition-all text-xs tracking-wider uppercase flex items-center justify-center gap-2 border border-slate-200 cursor-pointer"
                >
                  <span>📋</span>
                  <span>{copiedPostSubmit ? '✓ Copied!' : 'Copy Text'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPostSubmitSuccess(false);
                    setCurrentView('profile');
                  }}
                  className="bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold py-3 rounded-xl text-xs transition-all border border-teal-200/80 active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>✏️</span>
                  <span>Edit / Correct IDs</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPostSubmitSuccess(false);
                    window.location.reload();
                  }}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl text-xs transition-colors"
                >
                  Done / Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Pre-Submission Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Review Daily Submission</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{formData.fo_name} &bull; {formData.working_place}</p>
              </div>
              <button onClick={() => setShowReviewModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
              <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Total IDs in this Report</span>
                  <p className="text-2xl font-black text-indigo-700">
                    {[
                      'notification_ids', 'hiv_dm_ids', 'dbt_ids', 'sample_collection_ids', 'sample_tested_ids',
                      'outcome_assigned_ids', 'home_visit_ids', 'contact_tracing_ids', 'follow_up_ids',
                      'face_to_face_ids', 'presumptive_ids', 'documents_ids', 'fdc_provided_ids',
                      'kit_consumption_ids', 'differentiated_tb_ids', 'tpt_treatment_start_ids',
                      'tpt_presumptive_ids', 'adhar_face_authentication_ids', 'consent_with_id_ids',
                      'culture_dst_ids'
                    ].reduce((sum, k) => sum + (Array.isArray(formData[k]) ? formData[k].length : 0), 0)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Reporting Date</span>
                  <p className="text-xs font-bold text-slate-700">{formData.date_of_reporting || new Date().toISOString().split('T')[0]}</p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                  <span>Entered Indicators &amp; Patient IDs</span>
                  <span className="text-[10px] text-slate-400 font-bold">Kripya sabhi IDs check karein</span>
                </h4>
                
                <div className="space-y-3">
                  {[
                    { key: 'notification_ids', label: '1. TB Notification', color: 'indigo' },
                    { key: 'hiv_dm_ids', label: '2. HIV & Diabetes Testing', color: 'purple' },
                    { key: 'dbt_ids', label: '3. DBT Bank Details', color: 'emerald' },
                    { key: 'sample_collection_ids', label: '4. Sample Collection', color: 'blue' },
                    { key: 'sample_tested_ids', label: '5. Sample Tested', color: 'blue' },
                    { key: 'outcome_assigned_ids', label: '6. Outcome Assigned', color: 'teal' },
                    { key: 'home_visit_ids', label: '7. Home Visit', color: 'amber' },
                    { key: 'contact_tracing_ids', label: '8. Contact Tracing', color: 'rose' },
                    { key: 'follow_up_ids', label: '9. Follow Up Done', color: 'indigo' },
                    { key: 'face_to_face_ids', label: '10. Face to Face Counseling', color: 'cyan' },
                    { key: 'presumptive_ids', label: '11. Presumptive TB', color: 'orange' },
                    { key: 'documents_ids', label: '12. Documents Collected', color: 'slate' },
                    { key: 'fdc_provided_ids', label: '13. FDC Provided', color: 'emerald' },
                    { key: 'kit_consumption_ids', label: '14. Kit Consumption', color: 'violet' },
                    { key: 'differentiated_tb_ids', label: '15. Differentiated TB Care', color: 'pink' },
                    { key: 'tpt_treatment_start_ids', label: '16. TPT Treatment Start', color: 'blue' },
                    { key: 'tpt_presumptive_ids', label: '17. TPT Presumptive Screened', color: 'sky' },
                    { key: 'adhar_face_authentication_ids', label: '18. Aadhar Face Auth', color: 'indigo' },
                    { key: 'consent_with_id_ids', label: '19. Patient Consent Form', color: 'emerald' },
                    { key: 'culture_dst_ids', label: '20. Culture / DST (Buxar)', color: 'indigo' }
                  ].map(cat => {
                    const ids = Array.isArray(formData[cat.key]) ? formData[cat.key] : [];
                    if (ids.length === 0) return null;
                    return (
                      <div key={cat.key} className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 shadow-xs">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                            {cat.label}
                          </span>
                          <span className="font-black text-indigo-700 bg-indigo-100 text-[10px] px-2.5 py-0.5 rounded-full border border-indigo-200">
                            {ids.length} {ids.length === 1 ? 'ID' : 'IDs'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                          {ids.map((idVal, iIdx) => {
                            const fdcDet = cat.key === 'fdc_provided_ids' ? (formData.fdc_details || []).find(d => d && d.id === idVal) : null;
                            return (
                              <span key={iIdx} className="font-mono text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-2xs inline-flex items-center gap-1.5">
                                <span>{idVal}</span>
                                {fdcDet && (
                                  <span className="font-sans text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                                    {fdcDet.fdc_type || 'FDC 4'} &bull; {fdcDet.strips || 1} Strip
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {formData.visited_names && formData.visited_names.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                  <span className="font-bold text-slate-400 uppercase text-[10px] block mb-1">Visited Doctors / Stores</span>
                  <p className="font-semibold text-slate-700">{formData.visited_names.join(', ')}</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 mt-auto">
              <button 
                onClick={() => setShowReviewModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors"
              >
                Edit Form
              </button>
              <button 
                onClick={submitReport}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 px-6 rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Submitting...</span>
                  </>
                ) : '✓ Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS / Manual Install Modal */}
      {showIosInstallModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-2xl border border-slate-100 text-center animate-fade-in">
            <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4 font-black">
              📲
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">App Install Guide</h3>
            <p className="text-xs text-slate-500 mb-5 font-medium leading-relaxed">
              Apne mobile home screen par is app ko add karne ke liye:
            </p>

            <div className="text-left space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs font-semibold text-slate-700 mb-6">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>Chrome ya Safari me <strong>Share (📤)</strong> ya <strong>3-dots (⋮)</strong> par click karein.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span><strong>"Install app"</strong> ya <strong>"Add to Home screen"</strong> par tap karein.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                <span>App aapke mobile phone me install ho jayegi! 🎉</span>
              </div>
            </div>

            <button 
              onClick={() => setShowIosInstallModal(false)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-600/20 active:scale-95"
            >
              Samajh Gaya (Close)
            </button>
          </div>
        </div>
      )}

      {/* FO Unread Urgent Broadcast Alert Popup Modal */}
      {unreadBroadcastPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-100 w-full max-w-sm sm:max-w-md animate-scale-up">
            <div className={`p-5 sm:p-6 text-white ${
              unreadBroadcastPopup.priority === 'HIGH' ? 'bg-gradient-to-r from-rose-600 to-red-600' :
              unreadBroadcastPopup.priority === 'MEDIUM' ? 'bg-gradient-to-r from-amber-500 to-orange-600' :
              'bg-gradient-to-r from-indigo-600 to-purple-600'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-3xl">
                  {unreadBroadcastPopup.priority === 'HIGH' ? '🚨' : unreadBroadcastPopup.priority === 'MEDIUM' ? '⚠️' : '📢'}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm border border-white/20 text-white">
                  {unreadBroadcastPopup.priority || 'MEDIUM'} NOTICE
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black mt-3 leading-tight tracking-tight">
                {unreadBroadcastPopup.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] text-white/90 font-medium">
                <span>👤 Posted by: {unreadBroadcastPopup.created_by_user}</span>
                <span>&bull;</span>
                <span>📍 {unreadBroadcastPopup.target_districts?.includes('All') ? 'Statewide' : unreadBroadcastPopup.target_districts?.join(', ')}</span>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs sm:text-sm text-slate-800 font-medium leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                {unreadBroadcastPopup.message}
              </div>

              <div className="pt-2">
                <button
                  onClick={() => dismissBroadcastPopup(unreadBroadcastPopup.id)}
                  className={`w-full py-3.5 rounded-xl font-black text-xs sm:text-sm text-white shadow-lg active:scale-95 transition-all uppercase tracking-wider ${
                    unreadBroadcastPopup.priority === 'HIGH' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' :
                    unreadBroadcastPopup.priority === 'MEDIUM' ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30' :
                    'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
                  }`}
                >
                  ✓ Samajh Gaya / Acknowledge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Active Notices Modal (From Header Bell) */}
      {showAllAlertsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-100 flex flex-col max-h-[85vh] overflow-hidden animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">📢</span>
                <div>
                  <h3 className="text-base font-black text-slate-800 tracking-tight">Active Notices &amp; Directives</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {formData.working_place || 'DFY Team'} Bulletin
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAllAlertsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none"
              >
                &times;
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1 custom-scrollbar space-y-3">
              {activeFoBroadcasts.length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-400 font-medium">No active notices for your district.</p>
              ) : (
                activeFoBroadcasts.map((b) => {
                  const isHigh = b.priority === 'HIGH';
                  const isMed = b.priority === 'MEDIUM';
                  const borderClass = isHigh ? 'border-rose-200 bg-rose-50/70 text-rose-950' : isMed ? 'border-amber-200 bg-amber-50/70 text-amber-950' : 'border-indigo-200 bg-indigo-50/70 text-indigo-950';
                  const badgeClass = isHigh ? 'bg-rose-600 text-white' : isMed ? 'bg-amber-500 text-white' : 'bg-indigo-600 text-white';

                  return (
                    <div key={b.id} className={`p-4 rounded-2xl border ${borderClass} space-y-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${badgeClass}`}>
                          {b.priority || 'MEDIUM'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <h4 className="text-xs font-black tracking-tight">{b.title}</h4>
                      <p className="text-xs font-medium opacity-90 leading-relaxed whitespace-pre-wrap">{b.message}</p>
                      <p className="text-[9px] font-bold text-slate-400">By: {b.created_by_user}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowAllAlertsModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate TB Notification Strict Blocking Modal */}
      <DuplicateNotificationBlockModal
        isOpen={duplicateBlockModal.isOpen}
        onClose={() => setDuplicateBlockModal({ isOpen: false, id: '', date: '', fo_name: '' })}
        id={duplicateBlockModal.id}
        date={duplicateBlockModal.date}
        fo_name={duplicateBlockModal.fo_name}
      />

      {/* Repeat Intervention Interactive Confirmation Modal */}
      <RepeatInterventionConfirmModal
        isOpen={repeatConfirmModal.isOpen}
        onClose={() => setRepeatConfirmModal({ isOpen: false, id: '', field: '', label: '', date: '', onConfirm: null })}
        id={repeatConfirmModal.id}
        label={repeatConfirmModal.label}
        date={repeatConfirmModal.date}
        onConfirm={repeatConfirmModal.onConfirm}
      />

      {/* Branding Footer */}
        <footer className="w-full text-center py-6 mt-auto">
          <p className="text-xs font-bold text-slate-500 tracking-widest uppercase opacity-70">
            Designed by <span className="text-indigo-600 font-black">Insomniac</span>
          </p>
          <div className="mt-2.5">
            <button
              onClick={async () => {
                try {
                  if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (let r of regs) await r.unregister();
                  }
                  if ('caches' in window) {
                    const keys = await caches.keys();
                    for (let k of keys) await caches.delete(k);
                  }
                } catch(e) {}
                window.location.reload(true);
              }}
              className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 active:scale-95 px-3 py-1 rounded-full border border-indigo-100 transition-all cursor-pointer shadow-2xs"
              title="Clear offline cache and get latest update"
            >
              <span>🔄</span>
              <span>Sync Latest Update (v1.0.1)</span>
            </button>
          </div>
        </footer>
      
    </div>
  )
}

export default App












