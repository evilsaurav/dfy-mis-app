import React, { useState, useEffect, useRef } from 'react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const FoDigitalIdCard = ({ formData, showToast }) => {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '',
    blood_group: '',
    emergency_contact: ''
  });

  const cardRef = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://dfy-mis-app.onrender.com';

  const fetchDossier = async () => {
    if (!formData?.working_place || !formData?.fo_name || !formData?.pin) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const url = `${API_BASE_URL}/fo/profile-dossier?district=${encodeURIComponent(formData.working_place)}&fo_name=${encodeURIComponent(formData.fo_name)}&pin=${encodeURIComponent(formData.pin)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.staff) {
          setDossier(data.staff);
          setEditForm({
            phone: data.staff.phone || '',
            blood_group: data.staff.blood_group || '',
            emergency_contact: data.staff.emergency_contact || ''
          });
        }
      }
    } catch (err) {
      console.warn('Could not fetch staff dossier:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDossier();
  }, [formData?.working_place, formData?.fo_name, formData?.pin]);

  const handleSaveContact = async (e) => {
    e.preventDefault();
    if (isSaving) return;

    // Validate phone
    const cleanPhone = (editForm.phone || '').trim().replace(/\D/g, '');
    if (cleanPhone && cleanPhone.length !== 10) {
      showToast?.('Mobile number 10 digits ka hona chahiye', 'error');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch(`${API_BASE_URL}/fo/update-profile-contact`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district: formData.working_place,
          fo_name: formData.fo_name,
          pin: formData.pin,
          phone: cleanPhone || null,
          blood_group: editForm.blood_group || null,
          emergency_contact: (editForm.emergency_contact || '').trim() || null
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDossier(data.staff);
        showToast?.('Contact & Blood Group details updated! 🎉', 'success');
        setShowEditModal(false);
      } else {
        showToast?.(data.detail || 'Update failed', 'error');
      }
    } catch (err) {
      showToast?.('Network error while updating details', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrintCard = () => {
    const printWindow = window.open('', '_blank', 'width=650,height=800');
    if (!printWindow) {
      showToast?.('Please allow popups to print ID card', 'warning');
      return;
    }

    const staffName = dossier?.name || formData.fo_name || 'Staff Member';
    const empNo = dossier?.emp_no || 'EP-DFY';
    const jobTitle = dossier?.job_title || dossier?.designation || 'Field Officer';
    const district = dossier?.district || formData.working_place || 'Bihar';
    const bloodGroup = dossier?.blood_group || 'Not Specified';
    const phone = dossier?.phone || 'Not Available';
    const emergencyContact = dossier?.emergency_contact || 'State Control Cell';
    const reportingTo = dossier?.reporting_to || 'District Coordinator';
    const dateJoined = dossier?.date_joined || 'Active Service';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Official Staff ID - ${staffName}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background-color: #f8fafc;
              margin: 0;
              padding: 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .instructions {
              text-align: center;
              color: #64748b;
              font-size: 13px;
              margin-bottom: 20px;
            }
            .id-card {
              width: 320px;
              background: #ffffff;
              border-radius: 18px;
              border: 2px solid #0f766e;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              position: relative;
            }
            .lanyard-hole {
              width: 40px;
              height: 10px;
              background: #e2e8f0;
              border: 1.5px solid #cbd5e1;
              border-radius: 6px;
              margin: 10px auto 4px auto;
            }
            .card-header {
              background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
              color: #ffffff;
              padding: 14px 16px;
              text-align: center;
            }
            .logo-row {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              margin-bottom: 4px;
            }
            .logo-img {
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: #ffffff;
              padding: 2px;
            }
            .org-title {
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 1px;
              text-transform: uppercase;
              margin: 0;
            }
            .org-subtitle {
              font-size: 9px;
              font-weight: 600;
              opacity: 0.9;
              letter-spacing: 0.5px;
              margin: 2px 0 0 0;
              color: #ccfbf1;
            }
            .card-body {
              padding: 16px 20px;
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .photo-box {
              width: 110px;
              height: 140px; /* Standard 35mm x 45mm proportion */
              border: 2px dashed #0d9488;
              border-radius: 10px;
              background: #f0fdfa;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              margin-bottom: 12px;
              color: #0f766e;
              padding: 6px;
              box-sizing: border-box;
            }
            .photo-box span {
              font-size: 9px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              line-height: 1.3;
              color: #0f766e;
            }
            .photo-box .sub-hint {
              font-size: 8px;
              font-weight: 500;
              color: #64748b;
              margin-top: 4px;
            }
            .officer-name {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
              margin: 0 0 4px 0;
              text-transform: uppercase;
            }
            .job-badge {
              display: inline-block;
              background: #e6fffa;
              color: #0d9488;
              font-size: 11px;
              font-weight: 700;
              padding: 3px 10px;
              border-radius: 999px;
              border: 1px solid #99f6e4;
              margin-bottom: 12px;
            }
            .info-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
              text-align: left;
              margin-top: 4px;
            }
            .info-table td {
              padding: 5px 4px;
              border-bottom: 1px solid #f1f5f9;
            }
            .info-table .label {
              font-weight: 700;
              color: #64748b;
              width: 38%;
            }
            .info-table .value {
              font-weight: 600;
              color: #1e293b;
            }
            .blood-pill {
              background: #fee2e2;
              color: #dc2626;
              padding: 2px 8px;
              border-radius: 6px;
              font-weight: 900;
              border: 1px solid #fecaca;
              display: inline-block;
            }
            .card-footer {
              background: #f8fafc;
              border-top: 1px solid #e2e8f0;
              padding: 10px 16px;
              text-align: center;
              font-size: 8.5px;
              color: #64748b;
            }
            .auth-sign {
              margin-top: 6px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              padding: 0 10px;
            }
            .sign-box {
              text-align: center;
              font-size: 8px;
              color: #94a3b8;
              border-top: 1px dashed #cbd5e1;
              padding-top: 3px;
              width: 90px;
            }
            @media print {
              .no-print { display: none; }
              body { padding: 0; background: transparent; }
              .id-card { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="instructions no-print">
            <p><strong>Official Doctors For You Bihar Cadre ID Card</strong></p>
            <p>Print on glossy cardstock or PVC sheet. Affix official 35mm x 45mm passport photograph.</p>
            <button onclick="window.print()" style="background:#0f766e;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">🖨️ Click to Print Card</button>
          </div>

          <div class="id-card">
            <div class="lanyard-hole"></div>
            <div class="card-header">
              <div class="logo-row">
                <img src="/dfy-logo.png" class="logo-img" alt="DFY Logo" onerror="this.style.display='none'" />
                <h1 class="org-title">DOCTORS FOR YOU</h1>
              </div>
              <p class="org-subtitle">BIHAR TB ELIMINATION PROGRAM • PPSA PROJECT</p>
            </div>

            <div class="card-body">
              <div class="photo-box">
                <div style="font-size: 26px; margin-bottom: 2px;">👤</div>
                <span>Affix Photo Here</span>
                <span class="sub-hint">35mm × 45mm</span>
                <span class="sub-hint">पासपोर्ट फोटो</span>
              </div>

              <h2 class="officer-name">${staffName}</h2>
              <div class="job-badge">${jobTitle}</div>

              <table class="info-table">
                <tr>
                  <td class="label">Employee ID:</td>
                  <td class="value"><strong style="font-family: monospace; letter-spacing: 0.5px; color: #0f766e;">${empNo}</strong></td>
                </tr>
                <tr>
                  <td class="label">Assigned District:</td>
                  <td class="value">${district}</td>
                </tr>
                <tr>
                  <td class="label">Emergency Blood:</td>
                  <td class="value"><span class="blood-pill">🩸 ${bloodGroup}</span></td>
                </tr>
                <tr>
                  <td class="label">Mobile Contact:</td>
                  <td class="value">${phone}</td>
                </tr>
                <tr>
                  <td class="label">Supervisor:</td>
                  <td class="value">${reportingTo}</td>
                </tr>
                <tr>
                  <td class="label">Emergency Helpline:</td>
                  <td class="value">${emergencyContact}</td>
                </tr>
                <tr>
                  <td class="label">Service Tenure:</td>
                  <td class="value">${dateJoined}</td>
                </tr>
              </table>
            </div>

            <div class="card-footer">
              <div>This card is the property of Doctors For You. If found, please return to DFY Bihar State Office.</div>
              <div class="auth-sign">
                <div class="sign-box">Officer Signature</div>
                <div class="sign-box">State Coordinator</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const staffName = dossier?.name || formData?.fo_name || 'Field Officer';
  const empNo = dossier?.emp_no || 'EP-DFY';
  const jobTitle = dossier?.job_title || dossier?.designation || 'Field Officer';
  const district = dossier?.district || formData?.working_place || 'Bihar';
  const bloodGroup = dossier?.blood_group || null;
  const phone = dossier?.phone || null;
  const supervisor = dossier?.reporting_to || null;
  const tenure = dossier?.date_joined || null;

  return (
    <div className="w-full mb-6">
      {/* Official Lanyard ID Card Container */}
      <div 
        ref={cardRef} 
        className="relative bg-white dark:bg-slate-900 rounded-3xl border border-teal-500/20 shadow-xl shadow-teal-950/5 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:border-teal-500/40"
      >
        {/* Subtle Lanyard Slot Header */}
        <div className="flex justify-center pt-2 pb-1 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200/60 dark:border-slate-700/60">
          <div className="w-12 h-2 rounded-full bg-slate-300 dark:bg-slate-600 shadow-inner"></div>
        </div>

        {/* Card Header Gradient with DFY Emblem */}
        <div className="relative bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 text-white p-5 text-center overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute -right-8 -top-8 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          
          <div className="flex items-center justify-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-full bg-white p-1 shadow-md flex items-center justify-center ring-2 ring-white/30">
              <img src="/dfy-logo.png" alt="Doctors For You" className="w-full h-full object-contain" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-black tracking-wider uppercase leading-tight text-white drop-shadow-sm">
                DOCTORS FOR YOU
              </h3>
              <p className="text-[10px] font-semibold text-teal-100 tracking-tight leading-none">
                Bihar TB Elimination Program • PPSA Project
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full bg-teal-950/40 border border-teal-300/30 text-[9px] font-bold text-teal-200 tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Official Cadre Identity Card
          </div>
        </div>

        {/* Card Main Body */}
        <div className="p-5 flex flex-col items-center text-center">
          {/* 35x45mm Aspect-Ratio Photo Placeholder Box */}
          <div className="relative group mb-3">
            <div className="w-28 h-36 rounded-2xl border-2 border-dashed border-teal-400 dark:border-teal-600 bg-teal-50/70 dark:bg-slate-800/70 flex flex-col items-center justify-center p-3 shadow-inner transition-all group-hover:border-teal-500 group-hover:bg-teal-50">
              <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 flex items-center justify-center text-2xl font-black mb-1.5 shadow-sm">
                {(staffName || 'U').charAt(0)}
              </div>
              <span className="text-[9px] font-black uppercase text-teal-800 dark:text-teal-200 tracking-wider leading-tight">
                Affix Photo
              </span>
              <span className="text-[8px] font-medium text-slate-500 dark:text-slate-400 leading-tight">
                35mm × 45mm
              </span>
              <span className="text-[7.5px] font-semibold text-teal-600 dark:text-teal-400 mt-0.5">
                फोटो चिपकाएं
              </span>
            </div>
            {/* Status indicator on photo */}
            <span className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" title="Active Staff"></span>
          </div>

          {/* Officer Name & Employee ID */}
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase">
            {staffName}
          </h2>
          
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1.5 mb-4">
            <span className="font-mono text-[11px] font-black bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60 px-2.5 py-0.5 rounded-full shadow-xs">
              ID: {empNo}
            </span>
            <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 rounded-full">
              {jobTitle}
            </span>
            <span className="text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/50 px-2.5 py-0.5 rounded-full">
              📍 {district}
            </span>
          </div>

          {/* Key HR & Emergency Attributes Grid */}
          <div className="w-full grid grid-cols-2 gap-2 text-left bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 mb-4 text-xs">
            {/* Blood Group */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Emergency Blood</span>
              {bloodGroup ? (
                <span className="inline-flex items-center gap-1 font-black text-rose-600 dark:text-rose-400 mt-0.5">
                  <span className="text-xs">🩸</span> {bloodGroup}
                </span>
              ) : (
                <button 
                  onClick={() => setShowEditModal(true)} 
                  className="text-[10px] font-bold text-rose-500 underline text-left hover:text-rose-600 mt-0.5"
                >
                  + Add Blood Group
                </button>
              )}
            </div>

            {/* Mobile Contact */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mobile Phone</span>
              {phone ? (
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                  📞 {phone}
                </span>
              ) : (
                <button 
                  onClick={() => setShowEditModal(true)} 
                  className="text-[10px] font-bold text-teal-600 underline text-left hover:text-teal-700 mt-0.5"
                >
                  + Add Phone
                </button>
              )}
            </div>

            {/* Supervisor */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reporting To</span>
              <span className="font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5" title={supervisor || 'District Coordinator'}>
                👤 {supervisor || 'District Coordinator'}
              </span>
            </div>

            {/* Service Tenure */}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Serving Since</span>
              <span className="font-bold text-slate-700 dark:text-slate-300 truncate mt-0.5">
                🗓️ {tenure ? tenure.slice(0, 10) : 'Active Cadre'}
              </span>
            </div>

            {/* Emergency Contact Line if available */}
            {dossier?.emergency_contact && (
              <div className="col-span-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">🚨 Emergency Helpline:</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{dossier.emergency_contact}</span>
              </div>
            )}
          </div>

          {/* Actions: Self-Edit Contact & Download/Print Badge */}
          <div className="w-full flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>✏️</span>
              <span>Edit Contact & Blood</span>
            </button>
            <button
              type="button"
              onClick={handlePrintCard}
              className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white font-bold text-xs transition-all shadow-md shadow-teal-900/20 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>📥</span>
              <span>Download ID Card</span>
            </button>
          </div>
        </div>
      </div>

      {/* Slide-Up Self-Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🪪</span>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-base">
                    Update Contact & Emergency Info
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Changes reflect immediately on your Official ID Card.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              {/* Mobile Phone Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mobile Number (10 Digits) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={editForm.phone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                    placeholder="9876543210"
                    className="w-full pl-12 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-white"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Used for program communications and emergency contact.</p>
              </div>

              {/* Blood Group Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Emergency Blood Group 🩸
                </label>
                <select
                  value={editForm.blood_group}
                  onChange={(e) => setEditForm(prev => ({ ...prev, blood_group: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- Select Blood Group --</option>
                  {BLOOD_GROUPS.map(bg => (
                    <option key={bg} value={bg}>{bg}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Critical for frontline field travel & road emergency safety.</p>
              </div>

              {/* Emergency Contact Name / Relation / Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Emergency Relative / Contact Line 🚨
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={editForm.emergency_contact}
                  onChange={(e) => setEditForm(prev => ({ ...prev, emergency_contact: e.target.value }))}
                  placeholder="e.g. Brother (Amit Kumar) - 9876500000"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-white"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs transition-all shadow-md shadow-teal-900/20 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save & Update Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
