import { useState, useMemo, useCallback } from 'react';
import { canonicalizeDistrict, canonicalizeFo, isOfficerNameMatch, parseTargetVal, DEFAULT_BIHAR_DISTRICTS } from '../utils/districtHelpers';

export function useAdminAnalytics({
  rawRecords = [],
  selectedDistrict = 'All',
  selectedFO = 'All',
  month,
  targetsData = [],
  staffDirectory = {},
  staffList = [],
  currentUser,
  districts = [],
  adminTargetViewMode = 'official',
  sortConfig = { key: 'notifications', direction: 'desc' },
  setSortConfig,
  masterTableCohortFilter = 'all',
  pacingHolidaysCount = 0,
  pacingFilterStatus = 'ALL',
  pacingSearchQuery = '',
  pacingSortConfig = { key: 'pacingPct', direction: 'desc' },
  officialTargetsByDistrict = {},
  officialDistrictTarget = 0,
  activeMetric = 'notifications',
  performanceMetricFilter = 'notif_only',
  showToast
}) {
  const [copiedBulletin, setCopiedBulletin] = useState(false);
  const [copiedCoachingOfficer, setCopiedCoachingOfficer] = useState(null);

  // Field Officers List for Filter
  const fos = useMemo(() => {
    let filtered = rawRecords;
    if (selectedDistrict !== 'All') {
      filtered = filtered.filter(r => canonicalizeDistrict(r.working_place) === selectedDistrict);
    }
    const names = Array.from(new Set(filtered.map(r => canonicalizeFo(r.fo_name, r.working_place, staffDirectory)))).filter(Boolean).sort();
    return ['All', ...names];
  }, [rawRecords, selectedDistrict, staffDirectory]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return rawRecords.filter(r => {
      const cDist = canonicalizeDistrict(r.working_place);
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        const allowed = currentUser.allowed_districts.map(canonicalizeDistrict);
        if (!allowed.includes(cDist)) return false;
      }
      if (selectedDistrict !== 'All' && cDist !== selectedDistrict) return false;
      if (selectedFO !== 'All' && canonicalizeFo(r.fo_name, cDist, staffDirectory) !== selectedFO) return false;
      return true;
    });
  }, [rawRecords, selectedDistrict, selectedFO, currentUser, staffDirectory]);

  // Aggregations
  const aggregate = (records) => {
    const init = {
      total_km: 0, notifications: 0, tests: 0, presumptive: 0, doctor_visits: 0,
      hiv_dm: 0, dbt: 0, sample_collection: 0, outcome_assigned: 0,
      home_visits: 0, contact_tracing: 0, follow_ups: 0, face_to_face: 0,
      documents: 0, fdc_provided: 0, kit_consumption: 0, overrides: 0, differentiated_tb: 0, tpt_treatment_start: 0, tpt_presumptive: 0, adhar_face_auth: 0, consent_with_id: 0
    };
    return records.reduce((acc, curr) => {
      for (let key in init) {
        if (key === 'overrides') acc[key] += curr.is_override ? 1 : 0;
        else acc[key] += (curr[key] || 0);
      }
      return acc;
    }, init);
  };

  const totals = useMemo(() => aggregate(filteredRecords), [filteredRecords]);

  const liveWhatsAppBulletin = useMemo(() => {
    const isSubAdmin = currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All');
    const permittedDistricts = isSubAdmin
      ? (currentUser.allowed_districts || []).map(canonicalizeDistrict)
      : (districts || []).filter(d => d !== 'All').map(canonicalizeDistrict);

    const permittedTargets = targetsData.filter(t => {
      const cDist = canonicalizeDistrict(t.district);
      return permittedDistricts.includes(cDist);
    });

    const distStats = {};
    permittedDistricts.forEach(d => {
      distStats[d] = { dist: d, notif: 0, tests: 0, dbt: 0, km: 0, tgt: 0, pct: 0 };
    });

    // Accumulate frontline staff targets first
    permittedTargets.forEach(t => {
      const cDist = canonicalizeDistrict(t.district);
      if (distStats[cDist]) {
        distStats[cDist].tgt += (Number(t.target) || 0);
      }
    });

    // Override with official target if set for this district
    permittedDistricts.forEach(d => {
      if (officialTargetsByDistrict && officialTargetsByDistrict[d] && officialTargetsByDistrict[d] > 0) {
        distStats[d].tgt = Number(officialTargetsByDistrict[d]);
      }
    });

    const totalStateTarget = Object.values(distStats).reduce((sum, d) => sum + d.tgt, 0);

    (rawRecords || []).forEach(r => {
      const cDist = canonicalizeDistrict(r.working_place || r.district || '');
      if (distStats[cDist]) {
        distStats[cDist].notif += (r.notifications || (r.notification_ids ? r.notification_ids.length : 0) || 0);
        distStats[cDist].tests += (r.tests || (r.sample_tested_ids ? r.sample_tested_ids.length : 0) || 0);
        distStats[cDist].dbt += (r.dbt || (r.dbt_ids ? r.dbt_ids.length : 0) || 0);
        distStats[cDist].km += (Number(r.total_km) || 0);
      }
    });

    const totalStateNotif = Object.values(distStats).reduce((sum, d) => sum + d.notif, 0);
    const totalStateTests = Object.values(distStats).reduce((sum, d) => sum + d.tests, 0);
    const totalStateDbt = Object.values(distStats).reduce((sum, d) => sum + d.dbt, 0);
    const totalStateKm = Object.values(distStats).reduce((sum, d) => sum + d.km, 0);
    const overallPct = totalStateTarget > 0 ? Math.round((totalStateNotif / totalStateTarget) * 100) : 0;

    const sortedDistricts = Object.values(distStats).map(d => {
      const pct = d.tgt > 0 ? Math.round((d.notif / d.tgt) * 100) : 0;
      return { ...d, pct };
    }).sort((a, b) => b.pct - a.pct || b.notif - a.notif);

    let msg = `🏥 *DOCTORS FOR YOU (DFY) - BIHAR TB MIS BULLETIN*\n`;
    msg += `📅 *Month:* ${month} | *Generated:* ${new Date().toLocaleDateString()}\n\n`;
    msg += `📊 *${isSubAdmin ? 'ASSIGNED DISTRICTS SUMMARY' : 'STATE SUMMARY'}:*\n`;
    msg += `• Total Notifications: *${totalStateNotif}* / ${totalStateTarget} (*${overallPct}%*)\n`;
    msg += `• Total Samples Tested: *${totalStateTests}*\n`;
    msg += `• Total DBT Seeded: *${totalStateDbt}*\n`;
    msg += `• Total Field KM: *${totalStateKm} KM*\n\n`;
    msg += `🏆 *DISTRICT LEADERBOARD:*\n`;

    sortedDistricts.forEach((d, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '•';
      msg += `${medal} *${d.dist}:* ${d.notif}/${d.tgt} (${d.pct}%)\n`;
    });

    msg += `\n_DFY Bihar State Health Monitoring Cell_`;
    return msg;
  }, [month, rawRecords, targetsData, districts, currentUser, officialTargetsByDistrict]);

  const copyWhatsAppBulletin = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(liveWhatsAppBulletin);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = liveWhatsAppBulletin;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCopiedBulletin(true);
      showToast('✓ WhatsApp Bulletin copied to clipboard!', 'success');
      setTimeout(() => setCopiedBulletin(false), 2500);
    } catch (err) {
      console.error('Failed to copy WhatsApp bulletin:', err);
      showToast('Failed to copy bulletin to clipboard', 'error');
    }
  };

  // Option A: Daily Timeline Trend Data (Dynamic calendar days, peak day, daily average)
  const dailyTrendStats = useMemo(() => {
    let totalDays = 31;
    let year = new Date().getFullYear();
    let monthIdx = new Date().getMonth();
    try {
      const [yStr, mStr] = (month || new Date().toISOString().slice(0, 7)).split('-');
      year = parseInt(yStr, 10);
      monthIdx = parseInt(mStr, 10) - 1;
      totalDays = new Date(year, monthIdx + 1, 0).getDate();
    } catch (e) {
      totalDays = 31;
    }

    const days = Array.from({ length: totalDays }, (_, i) => String(i + 1).padStart(2, '0'));
    const map = {};
    days.forEach(d => { map[d] = 0; });

    filteredRecords.forEach(r => {
      const recordDate = String(r.date || r.date_of_reporting || '').trim();
      if (recordDate) {
        const dateOnly = recordDate.split('T')[0];
        const parts = dateOnly.split('-');
        if (parts.length >= 3) {
          const d = parts[2].padStart(2, '0');
          if (map[d] !== undefined) {
            map[d] += (Number(r[activeMetric]) || 0);
          }
        }
      }
    });

    let peakDay = { day: '-', value: 0 };
    let totalVal = 0;
    const chartData = days.map(d => {
      const val = map[d] || 0;
      totalVal += val;
      if (val > peakDay.value) {
        peakDay = { day: d, value: val };
      }
      return {
        day: `${Number(d)}`,
        value: val
      };
    });

    const today = new Date();
    const isCurrentMonth = (year === today.getFullYear() && monthIdx === today.getMonth());
    const elapsedDays = isCurrentMonth ? Math.min(today.getDate(), totalDays) : totalDays;
    const avgDaily = elapsedDays > 0 ? (totalVal / elapsedDays).toFixed(1) : '0';

    return {
      chartData,
      totalVal,
      peakDay,
      avgDaily,
      totalDays
    };
  }, [filteredRecords, activeMetric, month]);

  // Backward compatibility alias for any component expecting dailyTrendData
  const dailyTrendData = dailyTrendStats.chartData;

  // Unified Target vs Achievement & Performance Data
  const performanceData = useMemo(() => {
    // Mode 1: Statewide / Multi-District View
    if (selectedDistrict === 'All') {
      let distList = DEFAULT_BIHAR_DISTRICTS;
      // Strict Sub-Admin Enforcing: Sub-Admin only sees their allowed districts!
      if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
        const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
        distList = distList.filter(d => userAllowed.includes(d));
      }

      const list = distList.map(dist => {
        const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === dist);
        const notif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
        const staffTargetSum = targetsData.filter(t => canonicalizeDistrict(t.district) === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
        const cDist = canonicalizeDistrict(dist);
        const offTgt = officialTargetsByDistrict[cDist] !== undefined ? Number(officialTargetsByDistrict[cDist]) : 0;
        const target = (adminTargetViewMode === 'frontline' || offTgt <= 0) ? staffTargetSum : offTgt;
        const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
        return {
          name: dist,
          district: dist,
          notifications: notif,
          target: target,
          percentage: pct,
          reports: distRecords.length,
          type: 'district',
          officialTarget: offTgt,
          frontlineTarget: staffTargetSum
        };
      });

      if (performanceMetricFilter === 'pct_achieve') {
        return list.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
      }
      return list.sort((a, b) => b.notifications - a.notifications || b.percentage - a.percentage);
    }

    // Mode 2: Specific District View -> Field Officers in selectedDistrict
    const targetDist = canonicalizeDistrict(selectedDistrict);
    const distRecs = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === targetDist);
    const dirFos = staffDirectory[targetDist] || [];
    const allFos = Array.from(new Set([...dirFos, ...distRecs.map(r => canonicalizeFo(r.fo_name, targetDist, staffDirectory))])).filter(Boolean);

    const list = allFos.map(fo => {
      const foRecs = distRecs.filter(r => canonicalizeFo(r.fo_name, targetDist, staffDirectory) === fo);
      const notif = foRecs.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const targetObj = (targetsData || []).find(t => 
        canonicalizeDistrict(t.district) === targetDist && 
        (isOfficerNameMatch(canonicalizeFo(t.fo_name, targetDist, staffDirectory), fo, targetDist) ||
         isOfficerNameMatch(t.fo_name, fo, targetDist))
      );
      const target = parseTargetVal(targetObj, foRecs.length > 0 ? 50 : 0);
      const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
      return {
        name: fo,
        fo_name: fo,
        district: targetDist,
        notifications: notif,
        target: target,
        percentage: pct,
        reports: foRecs.length,
        type: 'officer'
      };
    });

    if (performanceMetricFilter === 'pct_achieve') {
      return list.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
    }
    return list.sort((a, b) => b.notifications - a.notifications || b.percentage - a.percentage);
  }, [rawRecords, targetsData, staffDirectory, selectedDistrict, currentUser, performanceMetricFilter, adminTargetViewMode, officialTargetsByDistrict]);

  const performanceChartHeight = useMemo(() => {
    const len = performanceData.length;
    return Math.min(850, Math.max(340, len * 30 + 50));
  }, [performanceData]);

  const districtComparisonData = performanceData;

  // District Performance Leaderboard
  const leaderboardData = useMemo(() => {
    let distList = DEFAULT_BIHAR_DISTRICTS;
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
      distList = distList.filter(d => userAllowed.includes(d));
    }
    const result = distList.map(dist => {
      const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === dist);
      const notif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const staffTargetSum = targetsData.filter(t => canonicalizeDistrict(t.district) === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
      const cDist = canonicalizeDistrict(dist);
      const offTgt = officialTargetsByDistrict[cDist] !== undefined ? Number(officialTargetsByDistrict[cDist]) : 0;
      const target = (adminTargetViewMode === 'frontline' || offTgt <= 0) ? staffTargetSum : offTgt;
      const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
      return {
        district: dist,
        notifications: notif,
        target: target,
        percentage: pct,
        reports: distRecords.length,
        officialTarget: offTgt,
        frontlineTarget: staffTargetSum
      };
    });
    return result.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
  }, [rawRecords, targetsData, staffDirectory, currentUser, adminTargetViewMode, officialTargetsByDistrict]);

  // Set of all patient IDs notified in the current month across active records
  const currentMonthNotifIdSet = useMemo(() => {
    const s = new Set();
    (rawRecords || []).forEach(r => {
      (r.notification_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) s.add(clean);
      });
    });
    return s;
  }, [rawRecords]);

  // Table Data with Grouping & Sorting
  const tableData = useMemo(() => {
    const map = {};
    filteredRecords.forEach(r => {
      const key = selectedDistrict === 'All' 
        ? canonicalizeDistrict(r.working_place) 
        : canonicalizeFo(r.fo_name, r.working_place, staffDirectory);
      if (!map[key]) {
        map[key] = { 
          name: key, 
          ...aggregate([]),
          target: 0,
          hiv_dm_cur: 0,
          hiv_dm_prev: 0,
          tests_cur: 0,
          tests_prev: 0,
          dbt_cur: 0,
          dbt_prev: 0,
          home_visits_cur: 0,
          home_visits_prev: 0,
          contact_tracing_cur: 0,
          contact_tracing_prev: 0,
          follow_ups_cur: 0,
          follow_ups_prev: 0,
          documents_cur: 0,
          documents_prev: 0,
          differentiated_tb_cur: 0,
          differentiated_tb_prev: 0,
        };
      }
      for (let k in map[key]) {
        if (k !== 'name' && k !== 'overrides' && !k.endsWith('_cur') && !k.endsWith('_prev') && k !== 'target') {
          map[key][k] += (r[k] || 0);
        }
      }
      if (r.is_override) map[key].overrides += 1;

      // Cohort breakdown for this record's IDs
      (r.hiv_dm_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].hiv_dm_cur += 1;
          else map[key].hiv_dm_prev += 1;
        }
      });
      (r.sample_tested_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].tests_cur += 1;
          else map[key].tests_prev += 1;
        }
      });
      (r.dbt_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].dbt_cur += 1;
          else map[key].dbt_prev += 1;
        }
      });
      (r.home_visit_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].home_visits_cur += 1;
          else map[key].home_visits_prev += 1;
        }
      });
      (r.contact_tracing_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].contact_tracing_cur += 1;
          else map[key].contact_tracing_prev += 1;
        }
      });
      (r.follow_up_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].follow_ups_cur += 1;
          else map[key].follow_ups_prev += 1;
        }
      });
      (r.documents_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].documents_cur += 1;
          else map[key].documents_prev += 1;
        }
      });
      (r.differentiated_tb_ids || []).forEach(id => {
        const clean = String(id).trim();
        if (clean) {
          if (currentMonthNotifIdSet.has(clean)) map[key].differentiated_tb_cur += 1;
          else map[key].differentiated_tb_prev += 1;
        }
      });
    });

    // Populate target for each row (district or officer)
    Object.keys(map).forEach(key => {
      if (selectedDistrict === 'All') {
        const distTargets = (targetsData || []).filter(t => canonicalizeDistrict(t.district) === key);
        let tSum = distTargets.reduce((sum, t) => sum + (Number(t.target) || 0), 0);
        if (tSum === 0) {
          const staffCount = (staffList || []).filter(s => canonicalizeDistrict(s.district) === key && s.is_active !== false && s.status !== 'inactive').length;
          tSum = (staffCount > 0 ? staffCount : 1) * 50;
        }
        const offTgt = officialTargetsByDistrict[key] !== undefined ? Number(officialTargetsByDistrict[key]) : 0;
        map[key].target = (adminTargetViewMode === 'frontline' || offTgt <= 0) ? tSum : offTgt;
        map[key].officialTarget = offTgt;
        map[key].frontlineTarget = tSum;
      } else {
        const cDist = canonicalizeDistrict(selectedDistrict);
        const tObj = (targetsData || []).find(t => {
          if (canonicalizeDistrict(t.district) !== cDist) return false;
          const tCanonical = canonicalizeFo(t.fo_name, cDist, staffDirectory);
          return isOfficerNameMatch(tCanonical, key, cDist) || isOfficerNameMatch(t.fo_name, key, cDist);
        });
        map[key].target = parseTargetVal(tObj, 50);
      }
    });

    let data = Object.values(map);
    data.sort((a, b) => {
      const getVal = (row, sortKey) => {
        if (masterTableCohortFilter === 'current_cohort') {
          if (sortKey === 'hiv_dm') return row.hiv_dm_cur;
          if (sortKey === 'tests') return row.tests_cur;
          if (sortKey === 'dbt') return row.dbt_cur;
          if (sortKey === 'home_visits') return row.home_visits_cur;
          if (sortKey === 'contact_tracing') return row.contact_tracing_cur;
          if (sortKey === 'follow_ups') return row.follow_ups_cur;
          if (sortKey === 'documents') return row.documents_cur;
          if (sortKey === 'differentiated_tb') return row.differentiated_tb_cur;
        } else if (masterTableCohortFilter === 'backlog') {
          if (sortKey === 'hiv_dm') return row.hiv_dm_prev;
          if (sortKey === 'tests') return row.tests_prev;
          if (sortKey === 'dbt') return row.dbt_prev;
          if (sortKey === 'home_visits') return row.home_visits_prev;
          if (sortKey === 'contact_tracing') return row.contact_tracing_prev;
          if (sortKey === 'follow_ups') return row.follow_ups_prev;
          if (sortKey === 'documents') return row.documents_prev;
          if (sortKey === 'differentiated_tb') return row.differentiated_tb_prev;
        }
        return row[sortKey] ?? 0;
      };

      const valA = getVal(a, sortConfig.key);
      const valB = getVal(b, sortConfig.key);

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [filteredRecords, selectedDistrict, sortConfig, staffDirectory, targetsData, staffList, currentMonthNotifIdSet, masterTableCohortFilter, adminTargetViewMode, officialTargetsByDistrict]);

  // Aggregate totals across all rows in tableData (for both All Districts and District Drill-down)
  const tableTotals = useMemo(() => {
    const init = {
      target: 0,
      notifications: 0,
      tests: 0, tests_cur: 0, tests_prev: 0,
      presumptive: 0,
      doctor_visits: 0,
      hiv_dm: 0, hiv_dm_cur: 0, hiv_dm_prev: 0,
      dbt: 0, dbt_cur: 0, dbt_prev: 0,
      sample_collection: 0,
      outcome_assigned: 0,
      home_visits: 0, home_visits_cur: 0, home_visits_prev: 0,
      contact_tracing: 0, contact_tracing_cur: 0, contact_tracing_prev: 0,
      follow_ups: 0, follow_ups_cur: 0, follow_ups_prev: 0,
      face_to_face: 0,
      documents: 0, documents_cur: 0, documents_prev: 0,
      fdc_provided: 0,
      kit_consumption: 0,
      differentiated_tb: 0, differentiated_tb_cur: 0, differentiated_tb_prev: 0,
      tpt_treatment_start: 0,
      tpt_presumptive: 0,
      adhar_face_auth: 0,
      consent_with_id: 0,
      overrides: 0,
    };
    return (tableData || []).reduce((acc, row) => {
      for (const k in init) {
        acc[k] += (Number(row[k]) || 0);
      }
      return acc;
    }, init);
  }, [tableData]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };


  // Dynamic Working Days & Calendar Model (Zero-Backend Overhead)
  const workingDaysInfo = useMemo(() => {
    try {
      const [yearStr, mStr] = (month || new Date().toISOString().slice(0, 7)).split('-');
      const year = parseInt(yearStr, 10);
      const monthIdx = parseInt(mStr, 10) - 1;

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonthIdx = today.getMonth();
      const currentDay = today.getDate();

      const totalDays = new Date(year, monthIdx + 1, 0).getDate();

      let sundays = 0;
      let elapsedSundays = 0;

      const isCurrentMonth = (year === currentYear && monthIdx === currentMonthIdx);
      const isPastMonth = (year < currentYear || (year === currentYear && monthIdx < currentMonthIdx));
      const isFutureMonth = (year > currentYear || (year === currentYear && monthIdx > currentMonthIdx));

      const effectiveElapsedDays = isCurrentMonth 
        ? Math.min(currentDay, totalDays)
        : isPastMonth 
          ? totalDays 
          : 0;

      for (let day = 1; day <= totalDays; day++) {
        const d = new Date(year, monthIdx, day);
        if (d.getDay() === 0) {
          sundays++;
          if (day <= effectiveElapsedDays) {
            elapsedSundays++;
          }
        }
      }

      const holidays = Math.max(0, Number(pacingHolidaysCount) || 0);
      const totalWorkingDays = Math.max(1, totalDays - sundays - holidays);
      const elapsedWorkingDays = isFutureMonth 
        ? 0 
        : Math.max(0, Math.min(totalWorkingDays, effectiveElapsedDays - elapsedSundays - (isPastMonth ? holidays : Math.min(holidays, Math.floor((effectiveElapsedDays / totalDays) * holidays)))));
      const remainingWorkingDays = Math.max(0, totalWorkingDays - elapsedWorkingDays);

      return {
        month,
        totalDays,
        sundays,
        holidays,
        totalWorkingDays,
        elapsedWorkingDays,
        remainingWorkingDays,
        isCurrentMonth,
        isPastMonth,
        isFutureMonth
      };
    } catch (e) {
      return {
        month,
        totalDays: 30,
        sundays: 4,
        holidays: 1,
        totalWorkingDays: 25,
        elapsedWorkingDays: 10,
        remainingWorkingDays: 15,
        isCurrentMonth: true,
        isPastMonth: false,
        isFutureMonth: false
      };
    }
  }, [month, pacingHolidaysCount]);

  // Comprehensive Staff Pacing, Forecasting & Velocity Engine (Zero-Backend Overhead)
  const staffPacingData = useMemo(() => {
    const seenMap = new Set();
    const candidateList = [];

    // Strict Staff Alignment: Single Source of Truth from Official Staff Directory
    if (staffDirectory && Object.keys(staffDirectory).length > 0) {
      Object.keys(staffDirectory).forEach(dist => {
        const cDist = canonicalizeDistrict(dist);
        (staffDirectory[dist] || []).forEach(name => {
          const cleanName = (name || '').trim();
          if (cleanName) {
            candidateList.push({ name: cleanName, district: cDist, designation: 'Field Officer' });
          }
        });
      });
    }

    // Include registered staff from staffList (Admin Staff Management suite)
    if (staffList && staffList.length > 0) {
      staffList.forEach(s => {
        if (s.is_active === false || s.status === 'inactive') return;
        const cleanName = (s.name || '').trim();
        const cDist = canonicalizeDistrict(s.district || '');
        if (cleanName && cDist) {
          candidateList.push({ name: cleanName, district: cDist, designation: s.designation || 'Field Officer' });
        }
      });
    }

    // De-duplicate candidates by normalized canonical key
    const uniqueCandidates = [];
    candidateList.forEach(c => {
      const key = `${canonicalizeDistrict(c.district)}___${c.name.trim().toLowerCase()}`;
      if (!seenMap.has(key)) {
        seenMap.add(key);
        uniqueCandidates.push(c);
      }
    });

    const isSubAdmin = currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All');
    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = workingDaysInfo;
    const list = [];

    uniqueCandidates.forEach(c => {
      const cDist = canonicalizeDistrict(c.district);
      // Sub-Admin RBAC filter
      if (isSubAdmin) {
        const allowedCanonical = (currentUser.allowed_districts || []).map(canonicalizeDistrict);
        if (!allowedCanonical.includes(cDist) && !allowedCanonical.includes(c.district)) {
          return;
        }
      }

      const officerLower = c.name.trim().toLowerCase();

      // Find target with normalized matching
      const tObj = (targetsData || []).find(t => {
        if (!t.fo_name || !t.district) return false;
        return canonicalizeDistrict(t.district) === cDist && isOfficerNameMatch(t.fo_name, c.name, cDist);
      });
      const target = parseTargetVal(tObj, 50);

      // Find monthly records with normalized trimmed matching
      const officerRecords = rawRecords.filter(r => {
        if (!r.working_place || !r.fo_name) return false;
        if (canonicalizeDistrict(r.working_place) !== cDist) return false;
        return isOfficerNameMatch(r.fo_name, c.name, cDist);
      });
      const achieved = officerRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const activeDaysCount = new Set(officerRecords.map(r => r.date_of_reporting || r.date).filter(Boolean)).size;

      // Clinical indicators
      const tests = officerRecords.reduce((sum, r) => sum + (r.tests || 0), 0);
      const dbt = officerRecords.reduce((sum, r) => sum + (r.dbt || 0), 0);
      const hiv_dm = officerRecords.reduce((sum, r) => sum + (r.hiv_dm || 0), 0);
      const tpt = officerRecords.reduce((sum, r) => sum + (r.tpt_treatment_start || 0), 0);
      const doctor_visits = officerRecords.reduce((sum, r) => sum + (r.doctor_visits || 0), 0);
      const total_km = officerRecords.reduce((sum, r) => sum + (r.total_km || 0), 0);
      const home_visits = officerRecords.reduce((sum, r) => sum + (r.home_visits || 0), 0);

      // Pacing Calculations
      const expectedPace = Math.min(target, Math.round((target / Math.max(1, totalWorkingDays)) * elapsedWorkingDays));
      const pacingPct = expectedPace > 0 
        ? Math.round((achieved / expectedPace) * 100) 
        : (achieved > 0 ? 100 : 0);

      const targetAchievedPct = target > 0 ? Math.round((achieved / target) * 100) : 0;

      const dailyVelocityNum = elapsedWorkingDays > 0 ? (achieved / elapsedWorkingDays) : 0;
      const dailyVelocity = dailyVelocityNum.toFixed(1);

      const targetDailyRateNum = (target / Math.max(1, totalWorkingDays));
      const targetDailyRate = targetDailyRateNum.toFixed(1);

      const requiredRecoveryRateNum = remainingWorkingDays > 0 
        ? Math.max(0, target - achieved) / remainingWorkingDays 
        : 0;
      const requiredRecoveryRate = requiredRecoveryRateNum.toFixed(1);

      const projectedFinish = Math.round(achieved + (dailyVelocityNum * remainingWorkingDays));
      const projectedPct = target > 0 ? Math.round((projectedFinish / target) * 100) : 0;
      const surplus = projectedFinish - target;

      // Status classification
      let status = 'ON_TRACK';
      if (achieved >= target || pacingPct >= 100) {
        status = 'ON_TRACK';
      } else if (pacingPct >= 75) {
        status = 'WATCHLIST';
      } else {
        status = 'CRITICAL';
      }

      const consistencyPct = elapsedWorkingDays > 0 
        ? Math.min(100, Math.round((activeDaysCount / elapsedWorkingDays) * 100)) 
        : 0;

      list.push({
        id: `${c.district}___${c.name}`,
        name: c.name,
        district: c.district,
        designation: c.designation || 'Field Officer',
        target,
        achieved,
        expectedPace,
        pacingPct,
        targetAchievedPct,
        dailyVelocity: Number(dailyVelocity),
        targetDailyRate: Number(targetDailyRate),
        requiredRecoveryRate: Number(requiredRecoveryRate),
        projectedFinish,
        projectedPct,
        surplus,
        status,
        activeDaysCount,
        consistencyPct,
        tests,
        dbt,
        hiv_dm,
        tpt,
        doctor_visits,
        home_visits,
        total_km
      });
    });

    return list;
  }, [staffList, staffDirectory, rawRecords, targetsData, workingDaysInfo, currentUser]);

  const pacingStats = useMemo(() => {
    const totalStaff = staffPacingData.length;
    const onTrack = staffPacingData.filter(s => s.status === 'ON_TRACK').length;
    const watchlist = staffPacingData.filter(s => s.status === 'WATCHLIST').length;
    const critical = staffPacingData.filter(s => s.status === 'CRITICAL').length;
    const totalTarget = staffPacingData.reduce((sum, s) => sum + s.target, 0);
    const totalAchieved = staffPacingData.reduce((sum, s) => sum + s.achieved, 0);
    const totalProjected = staffPacingData.reduce((sum, s) => sum + s.projectedFinish, 0);
    const statePacingPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
    const stateProjectedPct = totalTarget > 0 ? Math.round((totalProjected / totalTarget) * 100) : 0;

    return {
      totalStaff,
      onTrack,
      watchlist,
      critical,
      totalTarget,
      totalAchieved,
      totalProjected,
      statePacingPct,
      stateProjectedPct
    };
  }, [staffPacingData]);

  const filteredStaffPacing = useMemo(() => {
    let list = staffPacingData;

    if (selectedDistrict !== 'All') {
      list = list.filter(s => s.district === selectedDistrict);
    }

    if (pacingFilterStatus !== 'ALL') {
      list = list.filter(s => s.status === pacingFilterStatus);
    }

    if (pacingSearchQuery.trim()) {
      const q = pacingSearchQuery.trim().toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q) || s.district.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      let valA = a[pacingSortConfig.key];
      let valB = b[pacingSortConfig.key];
      if (typeof valA === 'string') {
        return pacingSortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return pacingSortConfig.direction === 'asc' ? (valA - valB) : (valB - valA);
    });
  }, [staffPacingData, selectedDistrict, pacingFilterStatus, pacingSearchQuery, pacingSortConfig]);

  const districtPacingData = useMemo(() => {
    let distList = DEFAULT_BIHAR_DISTRICTS;
    if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const userAllowed = currentUser.allowed_districts.map(canonicalizeDistrict);
      distList = distList.filter(d => userAllowed.includes(d));
    }
    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = workingDaysInfo;

    return distList.map(dist => {
      const cDist = canonicalizeDistrict(dist);
      const distStaff = staffPacingData.filter(s => canonicalizeDistrict(s.district) === cDist);
      const staffCount = distStaff.length;

      // 1. Frontline Staff Target Sum (Ground Reality)
      const frontlineTarget = targetsData.filter(t => canonicalizeDistrict(t.district) === cDist).reduce((sum, t) => sum + (Number(t.target) || 0), 0) || distStaff.reduce((sum, s) => sum + s.target, 0) || 0;

      // 2. Official District Target Quota
      const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[cDist] !== undefined) ? Number(officialTargetsByDistrict[cDist]) : 0;

      // 3. Dynamic Effective Target based on active perspective (Official vs Frontline)
      const target = (adminTargetViewMode === 'frontline' || offTgt <= 0)
        ? (frontlineTarget > 0 ? frontlineTarget : (offTgt > 0 ? offTgt : 100))
        : offTgt;

      const bufferCount = Math.max(0, frontlineTarget - offTgt);
      const bufferPct = offTgt > 0 ? Math.round((bufferCount / offTgt) * 100) : 0;

      const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === cDist);
      const achieved = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);

      const expectedPace = Math.min(target, Math.round((target / Math.max(1, totalWorkingDays)) * elapsedWorkingDays));
      const pacingPct = expectedPace > 0 ? Math.round((achieved / expectedPace) * 100) : (achieved > 0 ? 100 : 0);
      const targetAchievedPct = target > 0 ? Math.round((achieved / target) * 100) : 0;

      const dailyVelocityNum = elapsedWorkingDays > 0 ? (achieved / elapsedWorkingDays) : 0;
      const requiredRecoveryRateNum = remainingWorkingDays > 0 ? (Math.max(0, target - achieved) / remainingWorkingDays) : 0;
      const projectedFinish = Math.round(achieved + (dailyVelocityNum * remainingWorkingDays));
      const surplus = projectedFinish - target;

      let status = 'ON_TRACK';
      if (achieved >= target || pacingPct >= 100) status = 'ON_TRACK';
      else if (pacingPct >= 75) status = 'WATCHLIST';
      else status = 'CRITICAL';

      return {
        district: dist,
        staffCount,
        target,
        officialTarget: offTgt,
        frontlineTarget,
        bufferCount,
        bufferPct,
        expectedPace,
        achieved,
        pacingPct,
        targetAchievedPct,
        dailyVelocity: dailyVelocityNum.toFixed(1),
        requiredRecoveryRate: requiredRecoveryRateNum.toFixed(1),
        projectedFinish,
        surplus,
        status,
        reportsCount: distRecords.length
      };
    }).sort((a, b) => b.pacingPct - a.pacingPct || b.achieved - a.achieved);
  }, [staffPacingData, currentUser, workingDaysInfo, targetsData, rawRecords, adminTargetViewMode, officialTargetsByDistrict]);

  // WhatsApp Coaching Message Generator
  const generateCoachingMessage = (officer) => {
    const { totalWorkingDays, elapsedWorkingDays, remainingWorkingDays } = workingDaysInfo;
    let msg = `🏥 *DOCTORS FOR YOU (DFY) - OFFICER TARGET PACING COACH*\n`;
    msg += `👤 *Officer:* ${officer.name} (${officer.district})\n`;
    msg += `📅 *Month:* ${month} | *Working Days:* ${elapsedWorkingDays}/${totalWorkingDays} days elapsed\n\n`;
    msg += `🎯 *Target Performance:*\n`;
    msg += `• Monthly Target: *${officer.target}*\n`;
    msg += `• Achieved So Far: *${officer.achieved}* (${officer.targetAchievedPct}% achieved)\n`;
    msg += `• Expected Pace to Date: *${officer.expectedPace}*\n`;
    msg += `• Current Pacing: *${officer.pacingPct}%* (${officer.status === 'ON_TRACK' ? '🟢 Ahead of Pace' : officer.status === 'WATCHLIST' ? '🟡 Slight Lag - Push Needed' : '🔴 Critical Lag - Immediate Support Required'})\n\n`;
    msg += `⚡ *Daily Run-Rate & Forecast:*\n`;
    msg += `• Current Velocity: *${officer.dailyVelocity}* notif/day\n`;
    msg += `• Month-End Forecast: *${officer.projectedFinish}* (${officer.surplus >= 0 ? `+${officer.surplus} surplus ✓` : `${officer.surplus} deficit ⚠️`})\n`;
    if (remainingWorkingDays > 0 && officer.achieved < officer.target) {
      msg += `• Required Daily Pace: *${officer.requiredRecoveryRate}* notif/day for remaining *${remainingWorkingDays}* working days\n\n`;
    }
    msg += `💪 *Aap kar sakte hain! Kripya field work aur daily notifications me tezi layein.*\n`;
    msg += `_DFY Bihar State Health Monitoring Cell_`;
    return msg;
  };

  const copyCoachingMessage = (officer) => {
    const text = generateCoachingMessage(officer);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCoachingOfficer(officer.id);
      setTimeout(() => setCopiedCoachingOfficer(null), 2500);
    }
  };

  const copyDistrictWhatsAppReport = (targetDist = selectedDistrict) => {
    if (!targetDist || targetDist === 'All') {
      showToast("Please select a specific district to generate the report.", "error");
      return;
    }
    const cDist = canonicalizeDistrict(targetDist);
    const distRecords = rawRecords.filter(r => canonicalizeDistrict(r.working_place) === cDist);
    const distStaff = staffPacingData.filter(s => canonicalizeDistrict(s.district) === cDist);
    
    // District Targets and Totals
    const distTarget = distStaff.reduce((sum, s) => sum + (s.target || 0), 0) || 
      (targetsData.filter(t => canonicalizeDistrict(t.district) === cDist).reduce((sum, t) => sum + (Number(t.target) || 0), 0) || 100);
    const distNotif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
    const distPct = distTarget > 0 ? Math.round((distNotif / distTarget) * 100) : 0;
    const distTests = distRecords.reduce((sum, r) => sum + (r.tests || 0), 0);
    const distFdc = distRecords.reduce((sum, r) => sum + (Array.isArray(r.fdc_provided_ids) ? r.fdc_provided_ids.length : (r.fdc_provided || 0)), 0);
    const distDbt = distRecords.reduce((sum, r) => sum + (r.dbt || 0), 0);
    const distContact = distRecords.reduce((sum, r) => sum + (r.contact_tracing || 0), 0);
    const distKm = distRecords.reduce((sum, r) => sum + (r.total_km || 0), 0);

    let msg = `🏥 *DOCTORS FOR YOU (DFY) - BIHAR TB MIS*\n`;
    msg += `📍 *DISTRICT COMPREHENSIVE PERFORMANCE REPORT*\n`;
    msg += `────────────────────────────\n`;
    msg += `📌 *District:* ${cDist.toUpperCase()}\n`;
    msg += `📅 *Month:* ${month} | *Generated:* ${new Date().toLocaleDateString('en-IN')}\n\n`;

    msg += `🎯 *DISTRICT OVERALL TARGET & PROGRESS:*\n`;
    msg += `• District Target: *${distTarget}* | Achieved: *${distNotif}* (*${distPct}% Progress*)\n`;
    msg += `• Notifications: *${distNotif}*\n`;
    msg += `• Lab Samples Tested: *${distTests}*\n`;
    msg += `• FDC Medicine Issues: *${distFdc}*\n`;
    msg += `• DBT Bank Linked: *${distDbt}*\n`;
    msg += `• Contact Tracing: *${distContact}*\n`;
    msg += `• Total Field Travel: *${distKm} KM*\n\n`;

    msg += `👥 *STAFF PERFORMANCE & TARGET ACHIEVEMENT:*\n`;
    if (distStaff.length === 0) {
      msg += `_No staff assigned or registered for this district._\n`;
    } else {
      distStaff.forEach((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
        const statusIcon = s.status === 'ON_TRACK' ? '🟢 ON TRACK' : s.status === 'WATCHLIST' ? '🟡 WATCHLIST' : '🔴 CRITICAL';
        const staffFdc = distRecords
          .filter(r => canonicalizeFo(r.fo_name, r.working_place, staffDirectory) === s.name)
          .reduce((sum, r) => sum + (Array.isArray(r.fdc_provided_ids) ? r.fdc_provided_ids.length : (r.fdc_provided || 0)), 0);

        msg += `${medal} *${s.name}* (${s.designation || 'Field Officer'})\n`;
        msg += `   • Target: *${s.target}* | Achieved: *${s.achieved}* (*${s.targetAchievedPct}% Achievement*) ${statusIcon}\n`;
        msg += `   • Tests: ${s.tests || 0} | FDC: ${staffFdc} | DBT: ${s.dbt || 0} | Travel: ${s.total_km || 0} KM\n`;
        msg += `   • Field Attendance: ${s.activeDaysCount || 0} Days\n\n`;
      });
    }

    msg += `────────────────────────────\n`;
    msg += `_Report generated by DFY Bihar TB MIS Monitoring Cell_`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      showToast(`✓ ${cDist} WhatsApp Comprehensive Report copied!`, 'success');
    }
    const shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(shareUrl, '_blank');
  };

  // Dual-Target Hierarchy Derivations (Statewide & District Scope)
  const frontlineStretchTarget = useMemo(() => {
    if (selectedDistrict !== 'All') {
      return (targetsData || []).filter(t => canonicalizeDistrict(t.district) === canonicalizeDistrict(selectedDistrict)).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
    } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      const allowedCanon = currentUser.allowed_districts.map(canonicalizeDistrict);
      return (targetsData || []).filter(t => allowedCanon.includes(canonicalizeDistrict(t.district))).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
    } else {
      return (targetsData || []).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
    }
  }, [targetsData, selectedDistrict, currentUser]);

  const effectiveDistrictTarget = useMemo(() => {
    if (selectedDistrict !== 'All') {
      const cDist = canonicalizeDistrict(selectedDistrict);
      const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[cDist]) || 0;
      return offTgt > 0 ? offTgt : frontlineStretchTarget;
    } else if (currentUser?.role === 'SUB_ADMIN' && currentUser?.allowed_districts && !currentUser.allowed_districts.includes('All')) {
      let eff = 0;
      const permitted = (currentUser.allowed_districts || []).map(canonicalizeDistrict);
      permitted.forEach(d => {
        const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[d]) || 0;
        if (offTgt > 0) {
          eff += offTgt;
        } else {
          const staffSum = (targetsData || []).filter(t => canonicalizeDistrict(t.district) === d).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
          eff += staffSum;
        }
      });
      return eff;
    } else {
      let eff = 0;
      const allDists = (districts && districts.length > 0 ? districts : DEFAULT_BIHAR_DISTRICTS).filter(d => d !== 'All').map(canonicalizeDistrict);
      allDists.forEach(d => {
        const offTgt = (officialTargetsByDistrict && officialTargetsByDistrict[d]) || 0;
        if (offTgt > 0) {
          eff += offTgt;
        } else {
          const staffSum = (targetsData || []).filter(t => canonicalizeDistrict(t.district) === d).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
          eff += staffSum;
        }
      });
      return eff <= 0 ? frontlineStretchTarget : eff;
    }
  }, [selectedDistrict, officialTargetsByDistrict, frontlineStretchTarget, currentUser, districts, targetsData]);

  const scopedTarget = useMemo(() => {
    return (adminTargetViewMode === 'frontline') ? frontlineStretchTarget : effectiveDistrictTarget;
  }, [adminTargetViewMode, frontlineStretchTarget, effectiveDistrictTarget]);

  return {
    fos,
    filteredRecords,
    aggregate,
    totals,
    aggregations: totals,
    liveWhatsAppBulletin,
    copyWhatsAppBulletin,
    copiedBulletin,
    dailyTrendStats,
    performanceData,
    tableData,
    tableTotals,
    requestSort,
    workingDaysInfo,
    staffPacingData,
    filteredStaffPacing,
    pacingStats,
    districtPacingData,
    copyCoachingMessage,
    copiedCoachingOfficer,
    officialTargetsByDistrict,
    effectiveDistrictTarget,
    frontlineStretchTarget,
    scopedTarget,
    copyDistrictWhatsAppReport
  };
}
