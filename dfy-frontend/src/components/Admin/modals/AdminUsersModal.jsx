import React from 'react';

export default function AdminUsersModal({
  show,
  onClose,
  loadingAdminUsers,
  adminUsersList,
  deleteAdminUser,
  userFormModal,
  setUserFormModal,
  saveAdminUser,
  staffDirectory = {}
}) {
  if (!show) return null;

  return (
    <>
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
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-2xl p-1 leading-none ml-1">&times;</button>
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
            <button onClick={onClose} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-2 px-5 rounded-xl transition-colors">Close</button>
          </div>
        </div>
      </div>

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
    </>
  );
}
