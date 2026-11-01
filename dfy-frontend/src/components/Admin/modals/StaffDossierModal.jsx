import React, { useState, useEffect } from 'react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function StaffDossierModal({
  officer,
  onClose,
  currentUser,
  onStaffUpdated,
  showToast
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (officer) {
      setFormData({
        emp_no: officer.emp_no || '',
        name: officer.name || '',
        designation: officer.designation || 'Field Officer',
        job_title: officer.job_title || '',
        district: officer.district || '',
        phone: officer.phone || '',
        email: officer.email || '',
        blood_group: officer.blood_group || '',
        dob: officer.dob ? String(officer.dob).slice(0, 10) : '',
        date_joined: officer.date_joined ? String(officer.date_joined).slice(0, 10) : '',
        gender: officer.gender || '',
        marital_status: officer.marital_status || '',
        reporting_to: officer.reporting_to || '',
        reporting_manager_emp_no: officer.reporting_manager_emp_no || '',
        emergency_contact: officer.emergency_contact || '',
        location: officer.location || ''
      });
      setIsEditing(false);
      setError('');
    }
  }, [officer]);

  if (!officer) return null;

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN' || currentUser?.username === 'admin';
  const allowedDistricts = currentUser?.allowed_districts || [];
  const canEdit = isSuperAdmin || allowedDistricts.includes('All') || allowedDistricts.includes(officer.district);

  const handleSave = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setError('');

    // Phone validation
    const cleanPhone = (formData.phone || '').trim().replace(/\D/g, '');
    if (cleanPhone && cleanPhone.length !== 10) {
      setError('Mobile phone must be exactly 10 digits.');
      return;
    }

    try {
      setIsSaving(true);
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';
      const token = localStorage.getItem('dfy_admin_token') || '';

      const payload = {
        emp_no: formData.emp_no.trim() || null,
        name: formData.name.trim(),
        designation: formData.designation.trim() || null,
        job_title: formData.job_title.trim() || null,
        phone: cleanPhone || null,
        email: formData.email.trim().toLowerCase() || null,
        blood_group: formData.blood_group || null,
        dob: formData.dob || null,
        date_joined: formData.date_joined || null,
        gender: formData.gender || null,
        marital_status: formData.marital_status || null,
        reporting_to: formData.reporting_to.trim() || null,
        reporting_manager_emp_no: formData.reporting_manager_emp_no.trim() || null,
        emergency_contact: formData.emergency_contact.trim() || null,
        location: formData.location.trim() || null
      };

      const res = await fetch(`${API_BASE_URL}/admin/staff/${encodeURIComponent(officer.id)}/update-dossier`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update staff dossier.');
      }

      showToast?.('Staff HR Master Dossier updated successfully! 🎉', 'success');
      if (onStaffUpdated && data.staff) {
        onStaffUpdated(data.staff);
      }
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Error updating dossier.');
    } finally {
      setIsSaving(false);
    }
  };

  const empNo = formData.emp_no || officer.emp_no || 'EP-DFY';
  const staffName = formData.name || officer.name;
  const jobTitle = formData.job_title || officer.job_title || officer.designation || 'Field Officer';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8 animate-scale-up">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white p-1 shadow-md flex items-center justify-center ring-2 ring-white/30">
              <img src="/dfy-logo.png" alt="Doctors For You" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-wide uppercase leading-tight">
                  Staff HR Master Dossier
                </h3>
                <span className="font-mono text-xs font-black bg-teal-950/50 text-teal-200 border border-teal-300/30 px-2 py-0.5 rounded-full">
                  {empNo}
                </span>
              </div>
              <p className="text-[11px] text-teal-100 font-medium">
                Official Doctors For You • Bihar State Operations Cadre
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* View Mode */}
        {!isEditing ? (
          <div className="p-6 space-y-6">
            {/* Top Identity Card Header */}
            <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
              {/* Photo Box Placeholder */}
              <div className="w-24 h-32 rounded-xl border-2 border-dashed border-teal-400 dark:border-teal-600 bg-white dark:bg-slate-800 flex flex-col items-center justify-center p-2 text-center shadow-xs shrink-0">
                <span className="text-2xl mb-1">👤</span>
                <span className="text-[8px] font-black uppercase text-teal-700 dark:text-teal-300 leading-tight">
                  35×45mm
                </span>
                <span className="text-[7px] text-slate-400 mt-0.5">
                  Passport Photo
                </span>
              </div>

              {/* Personal Title & Badges */}
              <div className="text-center sm:text-left flex-1 space-y-2">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase">
                    {staffName}
                  </h2>
                  <p className="text-sm font-bold text-teal-700 dark:text-teal-400">
                    {jobTitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    📍 {formData.district}
                  </span>
                  {formData.blood_group && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      🩸 {formData.blood_group}
                    </span>
                  )}
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    PIN: {officer.pin || '••••'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    officer.is_active !== false && officer.status !== 'inactive'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {officer.is_active !== false && officer.status !== 'inactive' ? '● Active' : '○ Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Dossier Attributes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category 1: Official & Service Details */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                  🏢 Official Service Details
                </h4>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Employee No:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{empNo}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Designation:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.designation}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Official Job Title:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.job_title || 'Field Officer'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Date Joined:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.date_joined || 'Active Service'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Location / Project:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.location || formData.district}</span>
                </div>
              </div>

              {/* Category 2: Management & Reporting */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                  👥 Reporting & Governance
                </h4>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Supervisor:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.reporting_to || 'District Coordinator'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Supervisor Code:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formData.reporting_manager_emp_no || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Emergency Contact:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.emergency_contact || 'State Health Cell'}</span>
                </div>
              </div>

              {/* Category 3: Contact Details */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                  📞 Contact & Communications
                </h4>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Mobile Phone:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formData.phone || 'Not Registered'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Work Email:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[180px]" title={formData.email}>
                    {formData.email || 'Not Registered'}
                  </span>
                </div>
              </div>

              {/* Category 4: Personal & Demographics */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
                <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-700">
                  🩺 Personal & Demographics
                </h4>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Blood Group:</span>
                  <span className="font-black text-rose-600 dark:text-rose-400">{formData.blood_group || 'Not Specified'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Date of Birth:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.dob || 'Not Recorded'}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500 font-semibold">Gender / Marital:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {[formData.gender, formData.marital_status].filter(Boolean).join(' • ') || 'Not Recorded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-md shadow-teal-900/20 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <span>✏️</span>
                  <span>Edit HR Dossier</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Edit Mode Form */
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Employee ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Employee Number (Emp No)
                </label>
                <input
                  type="text"
                  value={formData.emp_no}
                  onChange={(e) => setFormData(prev => ({ ...prev, emp_no: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EP00021"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Job Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Official Job Title
                </label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
                  placeholder="e.g. Field Coordinator"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Designation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
                  placeholder="e.g. Field Officer"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Mobile Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Phone (10 digits)
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Work Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Work Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="officer@doctorsforyou.org"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Blood Group */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Blood Group 🩸
                </label>
                <select
                  value={formData.blood_group}
                  onChange={(e) => setFormData(prev => ({ ...prev, blood_group: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold focus:ring-2 focus:ring-teal-500 dark:text-white"
                >
                  <option value="">-- Select Blood Group --</option>
                  {BLOOD_GROUPS.map(bg => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>

              {/* Date Joined */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Date Joined
                </label>
                <input
                  type="date"
                  value={formData.date_joined}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_joined: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Date of Birth */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                >
                  <option value="">-- Select Gender --</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Supervisor Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reporting To (Supervisor)
                </label>
                <input
                  type="text"
                  value={formData.reporting_to}
                  onChange={(e) => setFormData(prev => ({ ...prev, reporting_to: e.target.value }))}
                  placeholder="e.g. Pankaj Kumar"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Supervisor Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Supervisor Emp No
                </label>
                <input
                  type="text"
                  value={formData.reporting_manager_emp_no}
                  onChange={(e) => setFormData(prev => ({ ...prev, reporting_manager_emp_no: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EP00041"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Emergency Contact */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Emergency Relative / Contact Line 🚨
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact: e.target.value }))}
                  placeholder="e.g. Brother (Amit Kumar) - 9876500000"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>
            </div>

            {/* Form Action Buttons */}
            <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-md shadow-teal-900/20 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isSaving ? 'Saving Dossier...' : 'Save Dossier Updates'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
