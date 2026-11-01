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
        emp_no: formData.emp_no ? formData.emp_no.trim() : null,
        name: formData.name ? formData.name.trim() : officer.name,
        designation: formData.designation ? formData.designation.trim() : null,
        job_title: formData.job_title ? formData.job_title.trim() : null,
        phone: cleanPhone || null,
        email: formData.email ? formData.email.trim().toLowerCase() : null,
        blood_group: formData.blood_group || null,
        dob: formData.dob || null,
        date_joined: formData.date_joined || null,
        gender: formData.gender || null,
        marital_status: formData.marital_status || null,
        reporting_to: formData.reporting_to ? formData.reporting_to.trim() : null,
        reporting_manager_emp_no: formData.reporting_manager_emp_no ? formData.reporting_manager_emp_no.trim() : null,
        emergency_contact: formData.emergency_contact ? formData.emergency_contact.trim() : null,
        location: formData.location ? formData.location.trim() : null
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in">
      {/* ── Screen-Fitting Adaptive Modal Container ── */}
      <div className="w-full max-w-xl max-h-[96vh] sm:max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-teal-600/30 overflow-hidden animate-scale-up">
        
        {/* ── Sticky Fixed Header (Always visible at top) ── */}
        <div className="shrink-0 p-3 sm:p-3.5 bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white flex items-center justify-between border-b border-teal-600/30">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white p-1 shadow-sm flex items-center justify-center ring-2 ring-white/30 shrink-0">
              <img src="/dfy-logo.png" alt="Doctors For You" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-xs sm:text-sm font-black tracking-wide uppercase leading-tight truncate">
                  Staff HR Master Dossier
                </h3>
                <span className="font-mono text-[10px] font-black bg-teal-950/60 text-teal-200 border border-teal-300/30 px-2 py-0.2 rounded-full">
                  {empNo}
                </span>
              </div>
              <p className="text-[9.5px] text-teal-100 font-semibold truncate leading-none mt-0.5">
                Doctors For You • Bihar State Operations Cadre
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors shrink-0 ml-2"
            title="Close Dossier"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="shrink-0 px-3 py-1.5 bg-rose-50 border-b border-rose-200 text-rose-700 text-[11px] font-bold flex items-center gap-1.5">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── View Mode: Compact, Adaptive, Screen-Fitting Content ── */}
        {!isEditing ? (
          <div className="flex-1 overflow-y-auto sm:overflow-hidden p-3 sm:p-4 space-y-2.5 flex flex-col justify-between">
            {/* Top Identity Strip */}
            <div className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shrink-0">
              {/* Photo Box Placeholder (Compact 35x45mm ratio) */}
              <div className="w-14 h-18 rounded-lg border-2 border-dashed border-teal-500/80 dark:border-teal-500 bg-white dark:bg-slate-800 flex flex-col items-center justify-center p-1 text-center shrink-0 shadow-xs">
                <span className="text-lg leading-none">👤</span>
                <span className="text-[7px] font-black uppercase text-teal-800 dark:text-teal-300 leading-tight mt-0.5">
                  35×45mm
                </span>
                <span className="text-[6.5px] text-slate-400 leading-tight">
                  Photo
                </span>
              </div>

              {/* Personal Title & Badges */}
              <div className="min-w-0 flex-1 space-y-1">
                <div>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase truncate leading-tight">
                    {staffName}
                  </h2>
                  <p className="text-[11px] font-bold text-teal-700 dark:text-teal-400 truncate leading-tight">
                    {jobTitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    📍 {formData.district}
                  </span>
                  {formData.blood_group && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      🩸 {formData.blood_group}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    PIN: {officer.pin || '••••'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    officer.is_active !== false && officer.status !== 'inactive'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {officer.is_active !== false && officer.status !== 'inactive' ? '● Active' : '○ Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* 4-Quadrant High-Density Attributes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] flex-1">
              {/* Box 1: Official & Service Details */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 pb-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  🏢 Official Service Details
                </h4>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Emp No:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{empNo}</span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Designation:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.designation}</span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Job Title:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px] text-right" title={formData.job_title}>
                    {formData.job_title || 'Field Officer'}
                  </span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Date Joined:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.date_joined || 'Active Service'}</span>
                </div>
              </div>

              {/* Box 2: Management & Reporting */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 pb-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  👥 Reporting & Governance
                </h4>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Supervisor:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px] text-right" title={formData.reporting_to}>
                    {formData.reporting_to || 'District Coordinator'}
                  </span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Manager Code:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formData.reporting_manager_emp_no || 'N/A'}</span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Emergency Line:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px] text-right" title={formData.emergency_contact}>
                    {formData.emergency_contact || 'State Health Cell'}
                  </span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Location:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px] text-right">
                    {formData.location || formData.district}
                  </span>
                </div>
              </div>

              {/* Box 3: Contact & Communications */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 pb-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  📞 Contact & Communications
                </h4>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Mobile Phone:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formData.phone || 'Not Registered'}</span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Work Email:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px] text-right" title={formData.email}>
                    {formData.email || 'Not Registered'}
                  </span>
                </div>
              </div>

              {/* Box 4: Personal & Demographics */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 pb-0.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  🩺 Personal & Demographics
                </h4>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Blood Group:</span>
                  <span className="font-black text-rose-600 dark:text-rose-400">{formData.blood_group || 'Not Specified'}</span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">DOB:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{formData.dob || 'Not Recorded'}</span>
                </div>
                <div className="flex justify-between py-0.2">
                  <span className="text-slate-500">Gender / Marital:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {[formData.gender, formData.marital_status].filter(Boolean).join(' • ') || 'Not Recorded'}
                  </span>
                </div>
              </div>
            </div>

            {/* Official Registered Address & Advisory Strip */}
            <div className="p-2 bg-teal-500/10 dark:bg-teal-950/40 rounded-xl border border-teal-500/20 text-[9px] text-slate-600 dark:text-slate-300 space-y-0.5 shrink-0">
              <div className="font-bold text-teal-900 dark:text-teal-200 truncate">
                🛡️ Officially Assigned Digital ID • Valid for Field Operations under Bihar TB Elimination Program (PPSA)
              </div>
              <div className="text-[8.5px] text-slate-500 dark:text-slate-400 leading-tight">
                <strong>Doctors For You:</strong> Flat No - 201/203, Bldg No - 22, Lallubhai Compound, Mankhurd, Mumbai-400043, INDIA • Portal:{' '}
                <a href="https://doctorsforyou.org/" target="_blank" rel="noopener noreferrer" className="font-bold text-teal-700 dark:text-teal-400 underline">
                  https://doctorsforyou.org/
                </a>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-1.5 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-md shadow-teal-900/20 cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <span>✏️</span>
                  <span>Edit HR Dossier</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* ── Edit Mode: Clean Form with Fixed Header ── */
          <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Employee Number (Emp No)
                </label>
                <input
                  type="text"
                  value={formData.emp_no}
                  onChange={(e) => setFormData(prev => ({ ...prev, emp_no: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EP00021"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Official Job Title
                </label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))}
                  placeholder="e.g. Field Coordinator"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Designation
                </label>
                <input
                  type="text"
                  value={formData.designation}
                  onChange={(e) => setFormData(prev => ({ ...prev, designation: e.target.value }))}
                  placeholder="e.g. Field Officer"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Mobile Phone (10 digits)
                </label>
                <input
                  type="tel"
                  maxLength={10}
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                  placeholder="9876543210"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Work Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="officer@doctorsforyou.org"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Blood Group 🩸
                </label>
                <select
                  value={formData.blood_group}
                  onChange={(e) => setFormData(prev => ({ ...prev, blood_group: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold focus:ring-2 focus:ring-teal-500 dark:text-white"
                >
                  <option value="">-- Select Blood Group --</option>
                  {BLOOD_GROUPS.map(bg => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Date Joined
                </label>
                <input
                  type="date"
                  value={formData.date_joined}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_joined: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData(prev => ({ ...prev, dob: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                >
                  <option value="">-- Select Gender --</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Reporting To (Supervisor)
                </label>
                <input
                  type="text"
                  value={formData.reporting_to}
                  onChange={(e) => setFormData(prev => ({ ...prev, reporting_to: e.target.value }))}
                  placeholder="e.g. Shyamsundar Yadav"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Supervisor Emp No
                </label>
                <input
                  type="text"
                  value={formData.reporting_manager_emp_no}
                  onChange={(e) => setFormData(prev => ({ ...prev, reporting_manager_emp_no: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EP02113"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Emergency Relative / Contact Line 🚨
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact}
                  onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact: e.target.value }))}
                  placeholder="e.g. Brother (Amit Kumar) - 9876500000"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs shadow-md shadow-teal-900/20 disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Dossier'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
