import { useMemo } from 'react';
import { canonicalizeDistrict, normalizeStaffKey } from '../utils/districtHelpers';

export function useAdminAttendance({
  currentUser,
  attendanceDate,
  month,
  selectedDistrict,
  staffDirectory,
  rawRecords,
  staffList,
  authFetch,
  showToast,
  attendance,
  setAttendance,
  setIsAttendanceLoading,
  leaveActionModal,
  setLeaveActionModal,
  isSavingLeave,
  setIsSavingLeave,
  attendanceRemarkModal,
  setAttendanceRemarkModal,
  isSavingAttendanceRemark,
  setIsSavingAttendanceRemark,
  pacingHolidaysCount,
  setPacingHolidaysCount,
  setCopiedAttendance,
  fetchData
}) {
  // Zero-Firestore In-Memory Derivation: Instantly computes attendance from loaded rawRecords (0 reads, 0 Render load)
  const deriveAttendanceFromRecords = (targetDate) => {
    if (!staffDirectory || Object.keys(staffDirectory).length === 0 || !rawRecords) return null;

    const allowedDistSet = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? new Set(currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase()))
      : null;

    // Fast lookup for inactive_since / lifecycle status from staffList
    const staffMetaMap = {};
    (staffList || []).forEach(s => {
      const d = canonicalizeDistrict(s.district || '').toLowerCase();
      const cleanFo = (s.name || s.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      staffMetaMap[`${d}_${cleanFo}`] = s;
    });

    const staffRoster = [];
    Object.entries(staffDirectory).forEach(([rawDist, names]) => {
      const cDist = canonicalizeDistrict(rawDist);
      if (allowedDistSet && !allowedDistSet.has(cDist.toLowerCase())) return;
      (names || []).forEach(name => {
        if (name && String(name).trim()) {
          const foName = String(name).trim();
          const cleanFo = foName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          const meta = staffMetaMap[`${cDist.toLowerCase()}_${cleanFo}`];

          // Filter out any staff whose inactive_since is on or before targetDate
          if (meta) {
            const isInactive = meta.is_active === false || meta.status === 'inactive';
            const inactiveSince = (meta.inactive_since || '').slice(0, 10);
            if (isInactive) {
              if (!inactiveSince || targetDate >= inactiveSince) return;
            } else {
              if (inactiveSince && targetDate >= inactiveSince) return;
            }
          }

          staffRoster.push({
            district: cDist,
            fo_name: foName,
            designation: (meta && meta.designation) || "Field Officer"
          });
        }
      });
    });

    // Also include any active staff from staffList not in static staffDirectory
    const existingRosterKeys = new Set(staffRoster.map(s => `${canonicalizeDistrict(s.district).toLowerCase()}_${s.fo_name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`));
    (staffList || []).forEach(s => {
      const cDist = canonicalizeDistrict(s.district || '');
      if (allowedDistSet && !allowedDistSet.has(cDist.toLowerCase())) return;
      const foName = (s.name || s.fo_name || '').trim();
      if (!foName) return;
      const cleanFo = foName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `${cDist.toLowerCase()}_${cleanFo}`;
      if (existingRosterKeys.has(key)) return;

      const isInactive = s.is_active === false || s.status === 'inactive';
      const inactiveSince = (s.inactive_since || '').slice(0, 10);
      if (isInactive) {
        if (!inactiveSince || targetDate >= inactiveSince) return;
      } else {
        if (inactiveSince && targetDate >= inactiveSince) return;
      }

      staffRoster.push({
        district: cDist,
        fo_name: foName,
        designation: s.designation || "Field Officer"
      });
    });

    const dateReports = rawRecords.filter(r => {
      const rDate = String(r.date_of_reporting || r.date || '').split('T')[0];
      return rDate === targetDate;
    });

    const reportsMap = {};
    dateReports.forEach(r => {
      const dist = canonicalizeDistrict(r.working_place || '');
      if (allowedDistSet && !allowedDistSet.has(dist.toLowerCase())) return;
      const cleanFo = (r.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `${dist}_${cleanFo}`.replace(/\s+/g, '').toLowerCase();

      const rawTs = r.timestamp_completed || r.timestamp || r.submitted_at || r.timestamp_raw || '';
      let submittedTime = r.submitted_time || "Submitted";
      if ((!submittedTime || submittedTime === "Submitted") && rawTs) {
        try {
          const cleanTs = String(rawTs).includes('T') ? rawTs : String(rawTs).replace(' ', 'T');
          const d = new Date(cleanTs);
          if (!isNaN(d.getTime())) {
            submittedTime = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
          }
        } catch (e) {}
      }

      // Stealth 10 AM Cutoff Segregation for in-memory derivation:
      const isNextDay = Boolean(r.is_next_day_submission || r.is_next_day);
      const morningTime = r.submitted_morning_time || (isNextDay ? submittedTime : '');
      const submittedLabel = r.morning_submission_label || r.submitted_label || (isNextDay ? `Next day morning ${morningTime}` : (submittedTime || 'Submitted'));

      // Total IDs: use r.total_ids if present (computed across all _ids lists), else sum available numeric categories
      const computedTotalIds = r.total_ids !== undefined
        ? r.total_ids
        : ((r.notifications || 0) + (r.tests || 0) + (r.presumptive || 0) + (r.hiv_dm || 0) + (r.dbt || 0) + (r.differentiated_tb || 0) + (r.tpt_treatment_start || 0) + (r.sample_collection || 0) + (r.contact_tracing || 0) + (r.face_to_face || 0) + (r.documents || 0));

      reportsMap[key] = {
        district: dist,
        fo_name: (r.fo_name || '').trim(),
        submission_count: r.submission_count || 1,
        total_ids: computedTotalIds,
        submitted_time: submittedTime,
        timestamp_raw: rawTs,
        total_km: r.total_km || 0,
        is_next_day: isNextDay,
        submitted_morning_time: morningTime,
        submitted_label: submittedLabel
      };
    });

    // Existing leaves for this date (from state if same targetDate)
    const leavesMap = {};
    if (attendance && (attendance.date === targetDate || !attendance.date) && attendance.on_leave_fos) {
      attendance.on_leave_fos.forEach(l => {
        const dist = canonicalizeDistrict(l.district || '');
        const cleanFo = (l.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        leavesMap[`${dist}_${cleanFo}`.toLowerCase()] = l;
      });
    }

    const submittedFull = [];
    const submittedPartial = [];
    const onLeaveFos = [];
    const missingFos = [];
    const matchedKeys = new Set();

    staffRoster.forEach(s => {
      const cleanFo = s.fo_name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const key = `${s.district}_${cleanFo}`.replace(/\s+/g, '').toLowerCase();
      if (reportsMap[key]) {
        matchedKeys.add(key);
        const rep = reportsMap[key];
        const info = { ...s, ...rep };
        if (rep.submission_count >= 2) submittedFull.push(info);
        else submittedPartial.push(info);
      } else if (leavesMap[key]) {
        onLeaveFos.push({ ...s, ...leavesMap[key] });
      } else {
        missingFos.push(s);
      }
    });

    Object.entries(reportsMap).forEach(([rkey, rinfo]) => {
      if (!matchedKeys.has(rkey)) {
        submittedPartial.push({ ...rinfo, designation: "Field Officer" });
      }
    });

    const submittedFos = [...submittedFull, ...submittedPartial].sort((a, b) => (b.timestamp_raw || '').localeCompare(a.timestamp_raw || ''));
    missingFos.sort((a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name));
    onLeaveFos.sort((a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name));

    return {
      date: targetDate,
      total_staff: staffRoster.length,
      submitted_count: submittedFos.length,
      submitted_full_count: submittedFull.length,
      submitted_partial_count: submittedPartial.length,
      on_leave_count: onLeaveFos.length,
      missing_count: missingFos.length,
      submitted_fos: submittedFos,
      submitted_full: submittedFull,
      submitted_partial: submittedPartial,
      on_leave_fos: onLeaveFos,
      missing_fos: missingFos,
      is_derived: true
    };
  };

  const fetchAttendance = async (force = false, targetDate = attendanceDate) => {
    const isWithinLoadedMonth = targetDate && targetDate.slice(0, 7) === month;
    const todayStr = new Date().toISOString().slice(0, 10);
    const isPastDateInMonth = isWithinLoadedMonth && targetDate !== todayStr;

    // Instant Zero-Read Derivation for loaded month dates (0 reads, 0 Render load)
    if (!force && isWithinLoadedMonth && rawRecords && rawRecords.length > 0) {
      const derived = deriveAttendanceFromRecords(targetDate);
      if (derived) {
        setAttendance(derived);
        // Only return early if we have valid timestamps in derived data (guards against stale pre-cached records)
        const hasTimestamps = derived.submitted_fos.length === 0 || derived.submitted_fos.some(fo => fo.submitted_time && fo.submitted_time !== 'Submitted');
        if (isPastDateInMonth && hasTimestamps) {
          return; // Past date in loaded month is 100% complete in rawRecords with timestamps! No network request needed!
        }
      }
    }

    setIsAttendanceLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const params = new URLSearchParams();
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        params.set('districts', currentUser.allowed_districts.join(','));
      }
      if (targetDate) {
        params.set('date', targetDate);
      }
      if (force) {
        params.set('force_refresh', 'true');
        params.set('_t', Date.now().toString());
      }
      const q = params.toString() ? `?${params.toString()}` : '';
      const res = await authFetch(`${API_BASE_URL}/admin/today-attendance${q}`);
      if (res.ok) {
        const data = await res.json();
        setAttendance(data);
      }
    } catch (e) {
      console.error("Attendance fetch error", e);
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  const handleExecuteMarkLeave = async () => {
    if (!leaveActionModal) return;
    if (isSavingLeave) return;

    const { district, fo_name, date, status, reason_type, remark } = leaveActionModal;
    if (!district || !fo_name) {
      showToast("⚠️ District and Field Officer name are required.", "error");
      return;
    }

    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      if (!allowed.includes(canonicalizeDistrict(district).toLowerCase())) {
        showToast("⚠️ Permission denied for this district.", "error");
        return;
      }
    }

    setIsSavingLeave(true);
    const targetDate = date || attendanceDate;
    const leaveStatus = status || 'leave';
    const leaveReason = reason_type || 'Casual';
    const leaveRemark = remark || '';

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const payload = {
        district,
        fo_name,
        date: targetDate,
        status: leaveStatus,
        reason_type: leaveReason,
        remark: leaveRemark
      };

      const res = await authFetch(`${API_BASE_URL}/admin/attendance/mark-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to record leave");

      // Optimistic state update: move officer from missing_fos to on_leave_fos
      setAttendance(prev => {
        if (!prev) return prev;
        const cleanFo = fo_name.trim().toLowerCase();
        const cleanDist = canonicalizeDistrict(district).toLowerCase();

        const nextMissing = (prev.missing_fos || []).filter(
          f => !(f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist)
        );

        const newLeaveRecord = {
          district,
          fo_name,
          status: leaveStatus,
          reason_type: leaveReason,
          remark: leaveRemark,
          marked_by_name: currentUser?.name || currentUser?.username || 'Admin',
          marked_at: new Date().toISOString()
        };

        const nextLeaves = [
          ...(prev.on_leave_fos || []).filter(
            f => !(f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist)
          ),
          newLeaveRecord
        ].sort((a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name));

        return {
          ...prev,
          missing_fos: nextMissing,
          missing_count: nextMissing.length,
          on_leave_fos: nextLeaves,
          on_leave_count: nextLeaves.length
        };
      });

      showToast(`✓ Marked ${leaveStatus === 'absent' ? 'absent' : leaveStatus === 'weekly_off' ? 'weekly off' : 'leave'} for ${fo_name}`, "success");
      setLeaveActionModal(null);
      fetchAttendance(true, targetDate);
    } catch (err) {
      console.error("Mark leave error:", err);
      showToast(`⚠️ ${err.message}`, "error");
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleExecuteUnmarkLeave = async (district, fo_name, date) => {
    if (isSavingLeave) return;

    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      if (!allowed.includes(canonicalizeDistrict(district).toLowerCase())) {
        showToast("⚠️ Permission denied for this district.", "error");
        return;
      }
    }

    if (!window.confirm(`Kya aap sure hain ki ${fo_name} (${district}) ka leave revert karna chahte hain?`)) {
      return;
    }

    setIsSavingLeave(true);
    const targetDate = date || attendanceDate;

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/attendance/unmark-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ district, fo_name, date: targetDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to revert leave");

      // Optimistic state update: move officer back to missing_fos
      setAttendance(prev => {
        if (!prev) return prev;
        const cleanFo = fo_name.trim().toLowerCase();
        const cleanDist = canonicalizeDistrict(district).toLowerCase();

        const nextLeaves = (prev.on_leave_fos || []).filter(
          f => !(f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist)
        );

        const alreadyMissing = (prev.missing_fos || []).some(
          f => f.fo_name.trim().toLowerCase() === cleanFo && canonicalizeDistrict(f.district).toLowerCase() === cleanDist
        );

        const nextMissing = alreadyMissing
          ? prev.missing_fos
          : [...(prev.missing_fos || []), { district, fo_name, designation: "Field Officer" }].sort(
              (a, b) => a.district.localeCompare(b.district) || a.fo_name.localeCompare(b.fo_name)
            );

        return {
          ...prev,
          on_leave_fos: nextLeaves,
          on_leave_count: nextLeaves.length,
          missing_fos: nextMissing,
          missing_count: nextMissing.length
        };
      });

      showToast(`✓ Leave reverted for ${fo_name}`, "success");
      fetchAttendance(true, targetDate);
    } catch (err) {
      console.error("Unmark leave error:", err);
      showToast(`⚠️ ${err.message}`, "error");
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleExecuteAttendanceRemark = async () => {
    if (!attendanceRemarkModal || isSavingAttendanceRemark) return;
    const { district, fo_name, date, action, remark, status, reason_type } = attendanceRemarkModal;
    if (!district || !fo_name) {
      showToast("⚠️ District and Field Officer name are required.", "error");
      return;
    }
    if (!remark || !remark.trim()) {
      showToast("⚠️ Please enter a remark.", "error");
      return;
    }
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowed = currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase());
      if (!allowed.includes(canonicalizeDistrict(district).toLowerCase())) {
        showToast("⚠️ Permission denied for this district.", "error");
        return;
      }
    }

    setIsSavingAttendanceRemark(true);
    const targetDate = date || attendanceDate;
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await authFetch(`${API_BASE_URL}/admin/attendance/add-remark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district,
          fo_name,
          date: targetDate,
          action: action || 'remark',
          remark: remark.trim(),
          status: status || 'leave',
          reason_type: reason_type || 'Casual'
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to record remark");

      showToast(action === 'remark' ? "✓ Attendance inspection remark recorded successfully!" : "✓ Leave status overridden successfully!", "success");
      setAttendanceRemarkModal(null);
      fetchAttendance(true, targetDate);
    } catch (err) {
      showToast(`❌ ${err.message}`, "error");
    } finally {
      setIsSavingAttendanceRemark(false);
    }
  };

  const fetchPacingSettings = async (targetMonth = month, targetDistrict = selectedDistrict) => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let distParam = "all";
      if (targetDistrict && targetDistrict !== 'All') {
        distParam = canonicalizeDistrict(targetDistrict);
      } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts?.length > 0 && !currentUser.allowed_districts.includes('All')) {
        distParam = canonicalizeDistrict(currentUser.allowed_districts[0]);
      }
      const res = await authFetch(`${API_BASE_URL}/admin/pacing/settings?month=${targetMonth}&district=${distParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.declared_holidays === 'number') {
          setPacingHolidaysCount(data.declared_holidays);
        }
      }
    } catch (err) {
      console.error("Fetch pacing settings error:", err);
    }
  };

  const handleUpdatePacingHolidays = async (delta) => {
    const newCount = Math.max(0, Math.min(15, (Number(pacingHolidaysCount) || 0) + delta));
    setPacingHolidaysCount(newCount);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      let distParam = "all";
      if (selectedDistrict && selectedDistrict !== 'All') {
        distParam = canonicalizeDistrict(selectedDistrict);
      } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts?.length > 0 && !currentUser.allowed_districts.includes('All')) {
        distParam = canonicalizeDistrict(currentUser.allowed_districts[0]);
      }

      if (currentUser?.role === 'SUB_ADMIN' && distParam === 'all') {
        showToast("⚠️ Sub-Admins must select their district to configure holidays.", "error");
        return;
      }

      const res = await authFetch(`${API_BASE_URL}/admin/pacing/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          district: distParam,
          declared_holidays: newCount
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to update declared holidays");
      }
      showToast(`✓ Declared holidays updated to ${newCount}`, "success");
    } catch (err) {
      console.error("Update pacing holidays error:", err);
      showToast(`⚠️ ${err.message}`, "error");
    }
  };

  const copyMissingReminder = () => {
    if (!attendance || !attendance.missing_fos) return;
    const onLeaveSet = new Set(
      (attendance.on_leave_fos || []).map(l => `${canonicalizeDistrict(l.district || '').toLowerCase()}_${(l.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`)
    );
    const byDistrict = {};
    attendance.missing_fos.forEach(fo => {
      const key = `${canonicalizeDistrict(fo.district || '').toLowerCase()}_${(fo.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;
      if (onLeaveSet.has(key)) return; // Strictly exclude staff on leave
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo.fo_name);
    });

    let msg = `*DFY MIS Reminder - Pending Daily Reports*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Missing: ${attendance.missing_count} of ${attendance.total_staff} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(name => {
        msg += `  - ${name}\n`;
      });
      msg += `\n`;
    }

    if (attendance?.on_leave_count > 0) {
      msg += `ℹ️ (${attendance.on_leave_count} staff on approved leave/absent today)\n\n`;
    }

    msg += `Kripya sabhi sadasya turant apni field report submit karein!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast("✓ Pending reminder copied for WhatsApp!", "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copySubmittedSummary = () => {
    const list = attendance?.submitted_fos || [...(attendance?.submitted_full || []), ...(attendance?.submitted_partial || [])];
    if (!list || list.length === 0) return;
    const byDistrict = {};
    list.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo);
    });

    let msg = `*DFY MIS - Submitted Field Reports*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Submitted: ${list.length} of ${attendance.total_staff} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(fo => {
        const timeNote = fo.is_next_day 
          ? `[⏰ ${fo.submitted_label || ('Next day morning ' + fo.submitted_time)}]`
          : `⏰ ${fo.submitted_time || 'Submitted'}`;
        msg += `  - ${fo.fo_name} (${fo.total_ids || 0} IDs) - ${timeNote}\n`;
      });
      msg += `\n`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  // Punctuality & Time Classification Helper (Standard evening window: 5 PM - 8 PM)
  const getSubmissionTimeClassification = (submittedTimeStr, timestampRaw, isNextDay = false) => {
    if (isNextDay) {
      return {
        bracket: 'next_day',
        label: 'Next Day Morning (< 10 AM)',
        shortLabel: 'Next Day Morning',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
      };
    }
    let hour = null;
    if (submittedTimeStr && typeof submittedTimeStr === 'string') {
      const match = submittedTimeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const meridiem = (match[3] || '').toUpperCase();
        if (meridiem === 'PM' && h !== 12) h += 12;
        if (meridiem === 'AM' && h === 12) h = 0;
        hour = h;
      }
    }
    if (hour === null && timestampRaw) {
      try {
        const d = new Date(timestampRaw);
        if (!isNaN(d.getTime())) {
          // IST (UTC + 5:30)
          hour = (d.getUTCHours() + 5 + Math.floor((d.getUTCMinutes() + 30) / 60)) % 24;
        }
      } catch (e) {}
    }
    if (hour === null) {
      return { bracket: 'unknown', label: 'Submitted', shortLabel: 'Submitted', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
    // 1. Standard On-Time: 5:00 PM – 8:00 PM (17:00 – 19:59)
    if (hour >= 17 && hour < 20) {
      return { 
        bracket: 'on_time', 
        label: 'On-Time (5 PM - 8 PM)', 
        shortLabel: 'On-Time', 
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' 
      };
    }
    // 2. Late Evening: 8:00 PM – 10:00 PM (20:00 – 21:59)
    if (hour >= 20 && hour < 22) {
      return { 
        bracket: 'late', 
        label: 'Late Evening (8 PM - 10 PM)', 
        shortLabel: 'Late (8-10 PM)', 
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 font-bold' 
      };
    }
    // 3. Delayed / Night: After 10:00 PM (22:00 – 23:59 or 00:00 - 04:00)
    if (hour >= 22 || hour < 4) {
      return { 
        bracket: 'delayed', 
        label: 'Night Submission (> 10 PM)', 
        shortLabel: 'Night (> 10 PM)', 
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' 
      };
    }
    // 4. Mid-Day / Early: Before 5:00 PM (04:00 – 16:59)
    return { 
      bracket: 'early', 
      label: 'Mid-Day (< 5 PM)', 
      shortLabel: 'Mid-Day (< 5 PM)', 
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' 
    };
  };

  // Set of inactive staff normalized keys from staffList
  const inactiveStaffNamesSet = useMemo(() => {
    const sSet = new Set();
    (staffList || []).forEach(s => {
      if (s.is_active === false || s.status === 'inactive') {
        sSet.add(normalizeStaffKey(s.district, s.name || s.fo_name));
      }
    });
    return sSet;
  }, [staffList]);

  // Chronic Non-Submitter / Absence Streaks (2+ consecutive days without report)
  const chronicDefaulters = useMemo(() => {
    if (!staffDirectory || Object.keys(staffDirectory).length === 0 || !rawRecords) return [];

    const submissionSet = new Set();
    (rawRecords || []).forEach(r => {
      const d = String(r.date_of_reporting || r.date || '').split('T')[0];
      const cDist = canonicalizeDistrict(r.working_place || '').toLowerCase();
      const cleanFo = (r.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (d && cDist && cleanFo) {
        submissionSet.add(`${cDist}_${cleanFo}_${d}`);
      }
    });

    const targetDateObj = new Date(attendanceDate);
    const checkDates = [];
    for (let i = 0; i <= 5; i++) {
      const d = new Date(targetDateObj);
      d.setDate(d.getDate() - i);
      checkDates.push(d.toISOString().slice(0, 10));
    }

    // Set of officers currently on leave or absent today
    const onLeaveSet = new Set(
      (attendance?.on_leave_fos || []).map(l => `${canonicalizeDistrict(l.district || '').toLowerCase()}_${(l.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`)
    );

    // Inactive cutoff lookup from staffList
    const inactiveCutoffMap = {};
    (staffList || []).forEach(s => {
      const d = canonicalizeDistrict(s.district || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const n = (s.name || s.fo_name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const normKey = normalizeStaffKey(s.district, s.name || s.fo_name);
      if (s.is_active === false || s.status === 'inactive' || s.inactive_since) {
        const cutoff = (s.inactive_since || '').slice(0, 10);
        inactiveCutoffMap[`${d}_${n}`] = cutoff;
        inactiveCutoffMap[normKey] = cutoff;
      }
    });

    const defaulters = [];
    const allowedDistSet = (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All'))
      ? new Set(currentUser.allowed_districts.map(canonicalizeDistrict).map(d => d.toLowerCase()))
      : null;

    Object.entries(staffDirectory).forEach(([rawDist, names]) => {
      const cDist = canonicalizeDistrict(rawDist);
      if (allowedDistSet && !allowedDistSet.has(cDist.toLowerCase())) return;

      (names || []).forEach(name => {
        const cleanName = String(name || '').trim();
        if (!cleanName) return;
        const cleanFo = cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const distKey = cDist.toLowerCase().replace(/[^a-z0-9]/g, '');
        const foKey = `${distKey}_${cleanFo}`;
        const normKey = normalizeStaffKey(cDist, cleanName);

        // Exclude staff on leave/absent today
        if (onLeaveSet.has(foKey)) return;

        // Exclude deactivated staff whose cutoff date is on or before attendanceDate
        if (inactiveCutoffMap[foKey] !== undefined) {
          const cutoff = inactiveCutoffMap[foKey];
          if (!cutoff || attendanceDate >= cutoff) return;
        }
        if (inactiveCutoffMap[normKey] !== undefined) {
          const cutoff = inactiveCutoffMap[normKey];
          if (!cutoff || attendanceDate >= cutoff) return;
        }
        if (inactiveStaffNamesSet.has(normKey)) return;

        let consecutiveMissed = 0;
        const missedDates = [];
        for (const cd of checkDates) {
          const dayOfWeek = new Date(cd).getDay();
          if (dayOfWeek === 0) continue; // Skip Sunday field break

          const hasReport = submissionSet.has(`${distKey}_${cleanFo}_${cd}`);
          if (!hasReport) {
            consecutiveMissed++;
            missedDates.push(cd);
          } else {
            break; // Stop at first submitted day
          }
        }

        if (consecutiveMissed >= 2) {
          defaulters.push({
            district: cDist,
            fo_name: cleanName,
            designation: "Field Officer",
            consecutiveDays: consecutiveMissed,
            missedDates,
            severity: consecutiveMissed >= 3 ? 'CRITICAL' : 'WARNING'
          });
        }
      });
    });

    return defaulters.sort((a, b) => b.consecutiveDays - a.consecutiveDays || a.district.localeCompare(b.district));
  }, [staffDirectory, rawRecords, attendanceDate, currentUser, attendance, staffList, inactiveStaffNamesSet]);

  // District-wise attendance scorecard rollup
  const districtAttendanceRollup = useMemo(() => {
    if (!attendance) return [];
    const submittedList = attendance.submitted_fos || [...(attendance.submitted_full || []), ...(attendance.submitted_partial || [])];
    const missingList = attendance.missing_fos || [];

    const map = {};
    Object.entries(staffDirectory || {}).forEach(([dist, names]) => {
      const cDist = canonicalizeDistrict(dist);
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        if (!currentUser.allowed_districts.includes(cDist)) return;
      }
      map[cDist] = { district: cDist, total: (names || []).length, submitted: 0, missing: 0 };
    });

    submittedList.forEach(fo => {
      const d = canonicalizeDistrict(fo.district);
      if (!map[d]) map[d] = { district: d, total: 0, submitted: 0, missing: 0 };
      map[d].submitted++;
      if (map[d].total < map[d].submitted) map[d].total = map[d].submitted;
    });

    missingList.forEach(fo => {
      const d = canonicalizeDistrict(fo.district);
      if (!map[d]) map[d] = { district: d, total: 0, submitted: 0, missing: 0, on_leave: 0 };
      map[d].missing++;
      if (map[d].total < (map[d].submitted + map[d].missing)) map[d].total = map[d].submitted + map[d].missing;
    });

    const onLeaveList = attendance.on_leave_fos || [];
    onLeaveList.forEach(fo => {
      const d = canonicalizeDistrict(fo.district);
      if (!map[d]) map[d] = { district: d, total: 0, submitted: 0, missing: 0, on_leave: 0 };
      map[d].on_leave = (map[d].on_leave || 0) + 1;
      if (map[d].total < (map[d].submitted + map[d].missing + (map[d].on_leave || 0))) {
        map[d].total = map[d].submitted + map[d].missing + (map[d].on_leave || 0);
      }
    });

    return Object.values(map).map(item => ({
      ...item,
      pct: item.total > 0 ? Math.round((item.submitted / item.total) * 100) : 0
    })).sort((a, b) => b.pct - a.pct || a.district.localeCompare(b.district));
  }, [attendance, staffDirectory, currentUser]);

  const copyDefaultersWarning = () => {
    if (!chronicDefaulters || chronicDefaulters.length === 0) return;
    let msg = `*🚨 DFY MIS Alert — Chronic Inactive Field Officers*\n`;
    msg += `As of Date: ${attendanceDate}\n`;
    msg += `Officers with 2+ consecutive days without daily reports:\n\n`;

    const byDistrict = {};
    chronicDefaulters.forEach(d => {
      if (!byDistrict[d.district]) byDistrict[d.district] = [];
      byDistrict[d.district].push(d);
    });

    for (const dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(fo => {
        msg += `  - ${fo.fo_name} (${fo.consecutiveDays} days inactive: ${fo.missedDates.slice(0, 3).join(', ')})\n`;
      });
      msg += `\n`;
    }
    msg += `⚠️ Immediate follow-up required by District Coordinators.`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast("✓ Defaulters alert copied for WhatsApp!", "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyDistrictSpecificSummary = (distName) => {
    if (!attendance) return;
    const submittedList = (attendance.submitted_fos || [...(attendance.submitted_full || []), ...(attendance.submitted_partial || [])])
      .filter(fo => canonicalizeDistrict(fo.district) === distName);
    const missingList = (attendance.missing_fos || [])
      .filter(fo => canonicalizeDistrict(fo.district) === distName);
    const onLeaveList = (attendance.on_leave_fos || [])
      .filter(fo => canonicalizeDistrict(fo.district) === distName);

    const total = submittedList.length + missingList.length + onLeaveList.length;
    const activeTotal = submittedList.length + missingList.length;
    const pct = activeTotal > 0 ? Math.round((submittedList.length / activeTotal) * 100) : 0;

    let msg = `*📊 DFY MIS — ${distName} Attendance Update*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Status: ${submittedList.length} of ${activeTotal} Active FOs Submitted (${pct}%)${onLeaveList.length > 0 ? ` • ${onLeaveList.length} On Leave` : ''}\n\n`;

    if (submittedList.length > 0) {
      msg += `*✅ Submitted (${submittedList.length}):*\n`;
      submittedList.forEach(fo => {
        const timeClass = getSubmissionTimeClassification(fo.submitted_time, fo.timestamp_raw, fo.is_next_day);
        const timeDisplay = fo.is_next_day
          ? `[⏰ ${fo.submitted_label || ('Next day morning ' + fo.submitted_time)}]`
          : `[⏰ ${fo.submitted_time || 'Submitted'} • ${timeClass.shortLabel}]`;
        msg += `  - ${fo.fo_name} (${fo.total_ids || 0} IDs) ${timeDisplay}\n`;
      });
      msg += `\n`;
    }

    if (missingList.length > 0) {
      msg += `*⚠️ Pending / Not Submitted (${missingList.length}):*\n`;
      missingList.forEach(fo => {
        msg += `  - ${fo.fo_name}\n`;
      });
      msg += `\n`;
    }

    if (onLeaveList.length > 0) {
      msg += `*🏖️ On Leave / Absent (${onLeaveList.length}):*\n`;
      onLeaveList.forEach(fo => {
        const statusLabel = fo.status === 'absent' ? '⚠️ Absent' : fo.status === 'weekly_off' ? '📅 Weekly Off' : '🏖️ Leave';
        msg += `  - ${fo.fo_name} (${statusLabel} - ${fo.reason_type || 'Casual'}${fo.remark ? `: ${fo.remark}` : ''})\n`;
      });
      msg += `\n`;
    }
    msg += `Kripya pending officers se report submit karwayen!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast(`✓ ${distName} WhatsApp report copied!`, "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyOnLeaveSummary = () => {
    const list = attendance?.on_leave_fos || [];
    if (!list || list.length === 0) return;
    const byDistrict = {};
    list.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo);
    });

    let msg = `*DFY MIS - Staff On Leave / Absent*\n`;
    msg += `Date: ${attendance.date || attendanceDate}\n`;
    msg += `Total On Leave/Absent: ${list.length} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(fo => {
        const statusLabel = fo.status === 'absent' ? '⚠️ Absent' : fo.status === 'weekly_off' ? '📅 Weekly Off' : '🏖️ Leave';
        msg += `  - ${fo.fo_name} (${statusLabel} - ${fo.reason_type || 'Casual'}${fo.remark ? `: ${fo.remark}` : ''})\n`;
      });
      msg += `\n`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      showToast("✓ Leave list copied for WhatsApp!", "success");
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  return {
    deriveAttendanceFromRecords,
    fetchAttendance,
    handleExecuteMarkLeave,
    handleExecuteUnmarkLeave,
    handleExecuteAttendanceRemark,
    fetchPacingSettings,
    handleUpdatePacingHolidays,
    copyMissingReminder,
    copySubmittedSummary,
    getSubmissionTimeClassification,
    inactiveStaffNamesSet,
    chronicDefaulters,
    districtAttendanceRollup,
    copyDefaultersWarning,
    copyDistrictSpecificSummary,
    copyOnLeaveSummary
  };
}
