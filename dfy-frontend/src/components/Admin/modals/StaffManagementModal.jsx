import React, { useState, useMemo } from 'react';
import { canonicalizeDistrict, isOfficerNameMatch, parseTargetVal, DEFAULT_BIHAR_DISTRICTS } from '../../../utils/districtHelpers';

export default function StaffManagementModal({
  showStaffSuite,
  setShowStaffSuite,
  staffList = [],
  districts = [],
  staffFilterDistrict,
  setStaffFilterDistrict,
  staffSearchQuery,
  setStaffSearchQuery,
  staffStatusFilter,
  setStaffStatusFilter,
  targetsData = [],
  currentUser,
  showPinMap = {},
  setShowPinMap,
  pinChangeModal,
  setPinChangeModal,
  handleExecuteUpdatePin,
  addStaffModal,
  setAddStaffModal,
  handleExecuteAddStaff,
  deleteStaffModal,
  setDeleteStaffModal,
  handleExecuteDeleteStaff,
  staffToggleModal,
  setStaffToggleModal,
  handleExecuteToggleStaffStatus,
  isTogglingStaff,
  fetchStaffList
}) {
  // 1. Internal states for Transfer Modal & Local Staff Overrides
  const [transferModal, setTransferModal] = useState(null);
  const [staffOverrides, setStaffOverrides] = useState({});

  // 2. Role Gating: SUPER_ADMIN or MAIN_INCHARGE
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.username === 'admin';
  const isMainIncharge = currentUser?.role === 'MAIN_INCHARGE';
  const canTransferStaff = isSuperAdmin || isMainIncharge;

  // 3. Derived Staff List with Optimistic Overrides
  const displayStaffList = useMemo(() => {
    return (staffList || []).map(s => {
      if (staffOverrides[s.id]) {
        return { ...s, ...staffOverrides[s.id] };
      }
      return s;
    });
  }, [staffList, staffOverrides]);

  // 4. Available Destination Districts for selected officer
  const availableDestinationDistricts = useMemo(() => {
    if (!transferModal || !transferModal.officer) return [];
    const currentOfficerDist = canonicalizeDistrict(transferModal.officer.district || '');
    const candidateList = districts && districts.length > 0 ? districts : DEFAULT_BIHAR_DISTRICTS;
    return candidateList.filter(d => d !== 'All' && canonicalizeDistrict(d) !== currentOfficerDist);
  }, [districts, transferModal]);

  // 5. Transfer Execution Handler
  const handleExecuteTransfer = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!transferModal || !transferModal.officer || !transferModal.toDistrict) return;

    const { officer, toDistrict, requiresConfirmation } = transferModal;
    const isConfirm = Boolean(requiresConfirmation);

    setTransferModal(prev => ({ ...prev, loading: true, error: '' }));

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const token = localStorage.getItem('dfy_admin_token') || '';
      const res = await fetch(`${API_BASE_URL}/admin/staff/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          staff_id: officer.id,
          to_district: toDistrict,
          confirm_despite_active_roster: isConfirm
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.detail && data.detail.requires_confirmation) {
        setTransferModal(prev => ({
          ...prev,
          loading: false,
          requiresConfirmation: true,
          warningMessage: data.detail.message || "Active TA roster exists for current month in old district.",
          error: ''
        }));
        return;
      }

      if (!res.ok) {
        const errMsg = typeof data.detail === 'string' ? data.detail : (data.detail?.message || data.message || "Transfer failed.");
        setTransferModal(prev => ({
          ...prev,
          loading: false,
          error: errMsg
        }));
        return;
      }

      // Success: Mutate in-place and trigger state override with district, district_id, and slug
      const updatedDistrict = data.district || toDistrict;
      const updatedDistrictId = data.district_id;
      const updatedSlug = data.slug;

      officer.district = updatedDistrict;
      if (updatedDistrictId !== undefined) officer.district_id = updatedDistrictId;
      if (updatedSlug) officer.slug = updatedSlug;

      setStaffOverrides(prev => ({
        ...prev,
        [officer.id]: {
          district: updatedDistrict,
          ...(updatedDistrictId !== undefined ? { district_id: updatedDistrictId } : {}),
          ...(updatedSlug ? { slug: updatedSlug } : {})
        }
      }));

      if (typeof fetchStaffList === 'function') {
        try {
          fetchStaffList();
        } catch (fe) {
          console.warn("Background fetchStaffList error after transfer:", fe);
        }
      }

      setTransferModal(null);
    } catch (err) {
      setTransferModal(prev => ({
        ...prev,
        loading: false,
        error: err.message || "Network error transferring staff."
      }));
    }
  };

  if (!showStaffSuite && !pinChangeModal && !addStaffModal && !deleteStaffModal && !staffToggleModal && !transferModal) {
    return null;
  }

  return (
    <>
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
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{displayStaffList.filter(s => s.is_active !== false && s.status !== 'inactive').length} Active Officers ({displayStaffList.length} Total) across {districts.filter(d => d !== 'All').length} Districts</p>
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
                  <option value="All">All Districts ({displayStaffList.length})</option>
                  {districts.filter(d => d !== 'All').map(d => (
                    <option key={d} value={d}>{d} ({displayStaffList.filter(s => s.district === d).length})</option>
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
              const totalCount = displayStaffList.length;
              const activeCount = displayStaffList.filter(s => s.is_active !== false && s.status !== 'inactive').length;
              const inactiveCount = displayStaffList.filter(s => s.is_active === false || s.status === 'inactive').length;

              const filteredStaff = displayStaffList.filter(s => {
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
                                  {canTransferStaff && (
                                    <button
                                      type="button"
                                      disabled={!isActive}
                                      onClick={() => {
                                        const cDist = canonicalizeDistrict(s.district || '');
                                        const candidateList = (districts && districts.length > 0 ? districts : DEFAULT_BIHAR_DISTRICTS)
                                          .filter(d => d !== 'All' && canonicalizeDistrict(d) !== cDist);
                                        setTransferModal({
                                          officer: s,
                                          toDistrict: candidateList[0] || '',
                                          requiresConfirmation: false,
                                          warningMessage: '',
                                          loading: false,
                                          error: ''
                                        });
                                      }}
                                      className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                        isActive
                                          ? 'text-purple-600 bg-purple-50 hover:bg-purple-100'
                                          : 'text-slate-300 bg-slate-50 cursor-not-allowed'
                                      }`}
                                      title={isActive ? "Transfer officer to another district" : "Officer inactive hai, transfer ke liye pehle reactivate karein"}
                                    >
                                      🔄 Transfer
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const cDist = canonicalizeDistrict(s.district);
                                      const tObj = (targetsData || []).find(t => 
                                        canonicalizeDistrict(t.district) === cDist && 
                                        isOfficerNameMatch(t.fo_name, s.name, cDist)
                                      );
                                      setPinChangeModal({
                                        name: s.name,
                                        district: s.district,
                                        newPin: s.pin,
                                        designation: s.designation || 'Field Officer',
                                        target: parseTargetVal(tObj, 50),
                                        error: ''
                                      });
                                    }}
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
                  <option value="Hub Agent">Hub Agent</option>
                  <option value="SCT Agent">SCT Agent</option>
                  <option value="Lab Technician (LT)">Lab Technician (LT)</option>
                  <option value="District Coordinator">District Coordinator</option>
                  <option value="Senior Treatment Supervisor (STS)">Senior Treatment Supervisor (STS)</option>
                  <option value="TB Health Visitor (TBHV)">TB Health Visitor (TBHV)</option>
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

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Monthly Target</label>
                <input
                  type="number"
                  min="0"
                  value={pinChangeModal.target ?? 50}
                  onChange={(e) => setPinChangeModal(prev => ({ ...prev, target: e.target.value }))}
                  placeholder="e.g. 50"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                  <option value="Hub Agent">Hub Agent</option>
                  <option value="SCT Agent">SCT Agent</option>
                  <option value="Lab Technician (LT)">Lab Technician (LT)</option>
                  <option value="District Coordinator">District Coordinator</option>
                  <option value="Senior Treatment Supervisor (STS)">Senior Treatment Supervisor (STS)</option>
                  <option value="TB Health Visitor (TBHV)">TB Health Visitor (TBHV)</option>
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

      {/* Transfer Staff Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 font-sans">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-slate-100 animate-fade-in">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg font-black">
                  🔄
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Transfer Officer District</h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    {transferModal.officer?.name} (Current: {transferModal.officer?.district})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !transferModal.loading && setTransferModal(null)}
                disabled={transferModal.loading}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                  Destination District
                </label>
                <select
                  value={transferModal.toDistrict}
                  onChange={(e) => setTransferModal(prev => ({ ...prev, toDistrict: e.target.value, requiresConfirmation: false, warningMessage: '', error: '' }))}
                  disabled={transferModal.loading}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {availableDestinationDistricts.map(d => (
                    <option key={d} value={d}>{d} District</option>
                  ))}
                </select>
              </div>

              {/* Warning / Confirmation Banner (Option B: Active TA roster) */}
              {transferModal.requiresConfirmation && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 text-xs">
                  <p className="font-bold mb-1 flex items-center gap-1.5">
                    <span>⚠️</span> Active Travel Allowance Roster Detected
                  </p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    {transferModal.warningMessage || "This officer has an existing TA roster for this month in their current district. Transferring will leave that roster in the current district; the new district starts next month."}
                  </p>
                  <p className="text-[11px] font-bold text-amber-900 mt-2">
                    Are you sure you want to proceed with the transfer?
                  </p>
                </div>
              )}

              {transferModal.error && (
                <p className="text-red-500 text-xs font-bold bg-red-50 p-2.5 rounded-xl border border-red-100">
                  {transferModal.error}
                </p>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTransferModal(null)}
                  disabled={transferModal.loading}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={transferModal.loading || !transferModal.toDistrict}
                  className={`font-bold px-4 py-2 rounded-xl text-xs shadow-md active:scale-95 transition-all text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    transferModal.requiresConfirmation
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                  }`}
                >
                  {transferModal.loading ? (
                    <>
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Transferring...</span>
                    </>
                  ) : (
                    <span>{transferModal.requiresConfirmation ? 'Confirm & Transfer Anyway' : 'Transfer Officer'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
