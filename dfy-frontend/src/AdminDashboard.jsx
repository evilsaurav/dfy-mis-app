import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, LineChart, Line } from 'recharts';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rawRecords, setRawRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [selectedDistrict, setSelectedDistrict] = useState('All');
  const [selectedFO, setSelectedFO] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'total_km', direction: 'desc' });
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetsData, setTargetsData] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [copiedAttendance, setCopiedAttendance] = useState(false);

  const fetchAttendance = async () => {
    setIsAttendanceLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/today-attendance`);
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

  const copyMissingReminder = () => {
    if (!attendance || !attendance.missing_fos) return;
    const byDistrict = {};
    attendance.missing_fos.forEach(fo => {
      if (!byDistrict[fo.district]) byDistrict[fo.district] = [];
      byDistrict[fo.district].push(fo.fo_name);
    });

    let msg = `*DFY MIS Reminder - Today's Pending Daily Reports*\n`;
    msg += `Date: ${attendance.date}\n`;
    msg += `Missing: ${attendance.missing_count} of ${attendance.total_staff} FOs\n\n`;

    for (let dist in byDistrict) {
      msg += `*${dist}:*\n`;
      byDistrict[dist].forEach(name => {
        msg += `  - ${name}\n`;
      });
      msg += `\n`;
    }
    msg += `Kripya sabhi sadasya turant apni field report submit karein!`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      setCopiedAttendance(true);
      setTimeout(() => setCopiedAttendance(false), 3000);
    }
  };

  const copyStateSummary = () => {
    const today = new Date().toISOString().split('T')[0];
    let msg = `*DFY MIS - State Daily Performance Bulletin*\n`;
    msg += `Date: ${today} | Month: ${month}\n\n`;
    msg += `*State Key Metrics:*\n`;
    msg += `Presumptive TB: ${totals.presumptive}\n`;
    msg += `Notifications: ${totals.notifications}\n`;
    msg += `Samples Tested: ${totals.tests}\n`;
    msg += `DBT Processed: ${totals.dbt}\n`;
    msg += `TPT (Start/Presumptive): ${totals.tpt_treatment_start} / ${totals.tpt_presumptive}\n`;
    msg += `Doctor/Store Visits: ${totals.doctor_visits}\n`;
    msg += `Total Reports: ${rawRecords.length}\n\n`;
    msg += `DFY Tuberculosis Health Mission`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      alert("State Summary copied to clipboard! Ready to paste in WhatsApp.");
    }
  };

  const downloadAllWorkbooks = () => {
    const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
    window.open(`${API_BASE_URL}/download-all-kpi-workbooks`, "_blank");
  };

  const loadTargets = async (dist) => {
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          const res = await fetch(API_BASE_URL + "/get-targets" + (dist !== 'All' ? `?district=${dist}` : ''));
          const data = await res.json();
          if(data.success) {
              setTargetsData(data.targets);
          }
      } catch(err) {
          console.error(err);
      }
  };

  const handleTargetChange = (fo_name, value) => {
      setTargetsData(prev => {
          const exists = prev.find(t => t.fo_name === fo_name);
          if (exists) {
              return prev.map(t => t.fo_name === fo_name ? { ...t, target: value } : t);
          } else {
              return [...prev, { fo_name, district: selectedDistrict, target: value }];
          }
      });
  };

  const saveAllTargets = async () => {
      try {
          const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
          for (let t of targetsData) {
              await fetch(API_BASE_URL + "/update-target", {
                  method: "POST", headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ fo_name: t.fo_name, district: t.district || selectedDistrict, target: Number(t.target) })
              });
          }
          alert("Targets saved successfully!");
          setShowTargetModal(false);
      } catch(err) {
          console.error(err);
          alert("Error saving targets");
      }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === 'dfyadmin2026') {
      setIsAuthenticated(true);
      fetchData();
    } else {
      setError('Invalid Password');
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const res = await fetch(`${API_BASE_URL}/admin/dashboard-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month_prefix: month })
      });
      if (!res.ok) throw new Error("Failed to fetch data");
      const data = await res.json();
      setRawRecords(data.records);
      setSelectedDistrict('All');
      setSelectedFO('All');
    } catch (err) {
      setError('Failed to load dashboard data. Ensure backend is running.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) { fetchData(); fetchAttendance(); }
  }, [month, isAuthenticated]);

  // Derived Filter Lists
  const districts = useMemo(() => ['All', ...new Set(rawRecords.map(r => r.working_place))], [rawRecords]);
  const fos = useMemo(() => {
    let filtered = rawRecords;
    if (selectedDistrict !== 'All') filtered = filtered.filter(r => r.working_place === selectedDistrict);
    return ['All', ...new Set(filtered.map(r => r.fo_name))];
  }, [rawRecords, selectedDistrict]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return rawRecords.filter(r => {
      if (selectedDistrict !== 'All' && r.working_place !== selectedDistrict) return false;
      if (selectedFO !== 'All' && r.fo_name !== selectedFO) return false;
      return true;
    });
  }, [rawRecords, selectedDistrict, selectedFO]);

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

  // District Comparison Data (for Bar Chart)
  const districtComparisonData = useMemo(() => {
    const map = {};
    rawRecords.forEach(r => {
      if (!map[r.working_place]) map[r.working_place] = aggregate([]);
      for (let key in map[r.working_place]) {
        if (key === 'overrides') map[r.working_place][key] += r.is_override ? 1 : 0;
        else map[r.working_place][key] += (r[key] || 0);
      }
    });
    return Object.keys(map).map(k => ({ working_place: k, ...map[k] }));
  }, [rawRecords]);

  // Radar Chart Data (Work Balance)
  const radarData = useMemo(() => {
    return [
      { subject: 'Notifications', A: totals.notifications, fullMark: 150 },
      { subject: 'Testing', A: totals.tests, fullMark: 150 },
      { subject: 'Home Visits', A: totals.home_visits, fullMark: 150 },
      { subject: 'Doc Visits', A: totals.doctor_visits, fullMark: 150 },
      { subject: 'Logistics', A: totals.fdc_provided + totals.kit_consumption, fullMark: 150 },
      { subject: 'Presumptive', A: totals.presumptive, fullMark: 150 },
        { subject: 'Special Tracking', A: totals.differentiated_tb + totals.tpt_treatment_start + totals.tpt_presumptive + totals.adhar_face_auth + totals.consent_with_id, fullMark: 150 }
    ];
  }, [totals]);

  // Table Data with Grouping & Sorting
  const tableData = useMemo(() => {
    const map = {};
    filteredRecords.forEach(r => {
      const key = selectedDistrict === 'All' ? r.working_place : r.fo_name;
      if (!map[key]) map[key] = { name: key, ...aggregate([]) };
      for (let k in map[key]) {
        if (k !== 'name' && k !== 'overrides') map[key][k] += (r[k] || 0);
      }
      if(r.is_override) map[key].overrides += 1;
    });
    let data = Object.values(map);
    data.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [filteredRecords, selectedDistrict, sortConfig]);

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const TH = ({ label, sortKey }) => (
    <th className="p-3 font-bold border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort(sortKey)}>
      <div className="flex items-center gap-1">
        {label}
        {sortConfig.key === sortKey && <span className="text-indigo-500 text-[10px]">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>}
      </div>
    </th>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-slate-100">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-slate-800">Admin Portal</h1>
            <p className="text-sm text-slate-500 font-medium">Enter master password to continue</p>
          </div>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4 text-slate-800 font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
          {error && <p className="text-red-500 text-xs font-bold mb-4 text-center">{error}</p>}
          <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-4 sm:p-6 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header & Controls */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Analytics Dashboard</h1>
            <p className="text-slate-500 text-sm font-medium">Monitoring {rawRecords.length} daily reports</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
            <select value={selectedDistrict} onChange={(e) => {setSelectedDistrict(e.target.value); setSelectedFO('All');}} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500">
              {districts.map(d => <option key={d} value={d}>{d === 'All' ? 'All Districts' : d}</option>)}
            </select>
            <select value={selectedFO} onChange={(e) => setSelectedFO(e.target.value)} disabled={selectedDistrict === 'All'} className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">
              {fos.map(f => <option key={f} value={f}>{f === 'All' ? 'All Officers' : f}</option>)}
            </select>
              <button onClick={() => {
                  const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
                  window.open(API_BASE_URL + "/download-excel", "_blank");
                }} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Raw Excel
                </button>
                <button onClick={() => {
                  if (selectedDistrict === 'All') {
                    alert('Please select a specific District from the dropdown to download its KPI Workbook.');
                    return;
                  }
                  const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
                  window.open(API_BASE_URL + "/download-kpi-workbook?district=" + selectedDistrict, "_blank");
                }} className="bg-blue-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5" title="Download single district workbook">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                  District KPI
                </button>
                <button onClick={downloadAllWorkbooks} className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5" title="Download ZIP with all 10 district workbooks">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  All 10 Districts (ZIP)
                </button>
                <button onClick={copyStateSummary} className="bg-emerald-600 text-white px-3.5 py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5" title="Copy state summary for WhatsApp">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  State WhatsApp
                </button>
                <button onClick={() => {
                  if (selectedDistrict === 'All') {
                    alert('Please select a specific District first.');
                    return;
                  }
                  loadTargets(selectedDistrict);
                  setShowTargetModal(true);
                }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
                  Set Targets
                </button>
              <button onClick={() => window.location.href = '/'} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">Exit</button>
          </div>
        </div>

        {/* Live Attendance Banner */}
        {attendance && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2">
                  Today's Field Officer Attendance 
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{attendance.date}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Total Active FOs: <strong className="text-slate-700">{attendance.total_staff}</strong> | Submitted: <strong className="text-emerald-600">{attendance.submitted_full_count + attendance.submitted_partial_count}</strong> | Pending: <strong className="text-red-500">{attendance.missing_count}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-2 text-xs font-bold">
                <span className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {attendance.submitted_full_count} Full (2/2)
                </span>
                <span className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-xl border border-amber-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> {attendance.submitted_partial_count} Partial (1/2)
                </span>
                <span className="bg-red-50 text-red-700 px-3 py-1.5 rounded-xl border border-red-100 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span> {attendance.missing_count} Missing
                </span>
              </div>
              <button 
                onClick={() => setShowAttendanceModal(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shrink-0 active:scale-95 shadow-sm"
              >
                View Details
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-20 font-bold text-slate-500">Loading Data...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-20 font-bold text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-100">No data found for selected filters</div>
        ) : (
          <>
            {selectedFO !== 'All' && (
                <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-3xl shadow-xl p-8 sm:p-10 text-white flex flex-col items-center justify-center relative overflow-hidden mb-8 animate-fade-in-down w-full border border-indigo-400/30">
                   <div className="absolute top-0 right-0 w-80 h-80 bg-white opacity-10 rounded-full -mt-20 -mr-20 pointer-events-none blur-3xl"></div>
                   <div className="absolute bottom-0 left-0 w-64 h-64 bg-black opacity-10 rounded-full -mb-20 -ml-20 pointer-events-none blur-3xl"></div>
                   
                   <div className="h-24 w-24 sm:h-28 sm:w-28 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-4xl sm:text-5xl font-black shadow-2xl border-4 border-white/40 shrink-0 uppercase mb-4 z-10 text-white drop-shadow-md">
                     {selectedFO.charAt(0)}
                   </div>
                   
                   <div className="text-center z-10 w-full">
                     <h2 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight drop-shadow-md">{selectedFO}</h2>
                     <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-8 bg-black/20 inline-block px-4 py-1.5 rounded-full border border-white/10 shadow-sm">{selectedDistrict} District</p>
                     
                     <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-sm font-semibold max-w-3xl mx-auto w-full mt-4">
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Days Active</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{filteredRecords.length}</span>
                       </span>
                       
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Total Travel</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{totals.total_km} <span className="text-sm sm:text-base font-bold opacity-70">KM</span></span>
                       </span>
                       
                       <span className="bg-white/10 backdrop-blur-md px-2 py-3 sm:px-6 sm:py-4 rounded-2xl flex flex-col items-center gap-1.5 border border-white/20 shadow-lg flex-1 min-w-[100px] hover:bg-white/20 transition-all cursor-default">
                         <span className="text-indigo-100 text-[9px] sm:text-[11px] uppercase tracking-widest font-black opacity-80">Total Work</span> 
                         <span className="text-2xl sm:text-3xl font-black drop-shadow-sm">{Object.values(totals).reduce((a,b)=>a+b, 0) - totals.total_km}</span>
                       </span>
                     </div>
                   </div>
                </div>
              )}

              {/* The BIG 5 KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total KM Travelled</h3>
                <p className="text-2xl font-black text-slate-800">{totals.total_km}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Notifications</h3>
                <p className="text-2xl font-black text-slate-800">{totals.notifications}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Samples Tested</h3>
                <p className="text-2xl font-black text-slate-800">{totals.tests}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-amber-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Presumptive</h3>
                <p className="text-2xl font-black text-slate-800">{totals.presumptive}</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-purple-500">
                <h3 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Doctor Visits</h3>
                <p className="text-2xl font-black text-slate-800">{totals.doctor_visits}</p>
              </div>
            </div>

            {/* Secondary Metrics Grid */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="text-slate-800 text-sm font-black mb-4">Secondary Indicators</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-10 gap-4">
                {[
                  { k: 'hiv_dm', l: 'HIV & DM' }, { k: 'dbt', l: 'DBT' }, { k: 'sample_collection', l: 'Sample Col' },
                  { k: 'outcome_assigned', l: 'Outcomes' }, { k: 'home_visits', l: 'Home Visits' }, { k: 'contact_tracing', l: 'Contact Tr' },
                  { k: 'follow_ups', l: 'Follow Ups' }, { k: 'face_to_face', l: 'F2F' }, { k: 'documents', l: 'Docs' },
                  { k: 'fdc_provided', l: 'FDC Prov' }, { k: 'kit_consumption', l: 'Kits' }, { k: 'overrides', l: 'Overrides' }
                ].map(metric => (
                  <div key={metric.k} className="text-center p-3 bg-slate-50 rounded-xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 leading-tight">{metric.l}</p>
                    <p className="text-lg font-black text-slate-700">{totals[metric.k]}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Bar Chart */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
                <h3 className="text-slate-800 font-black mb-4">{selectedDistrict === 'All' ? 'District Performance Comparison' : 'Filtered Data Timeline (Not fully plotted due to aggregation)'}</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={districtComparisonData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="working_place" tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} axisLine={false} tickLine={false} />
                      <YAxis tick={{fill: '#64748b', fontSize: 11, fontWeight: 600}} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)', fontWeight: 'bold'}} />
                      <Legend wrapperStyle={{fontWeight: 600, fontSize: '11px', color: '#64748b'}} />
                      <Bar dataKey="notifications" name="Notifications" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="tests" name="Samples Tested" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="total_km" name="Total KM" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Radar Chart */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-slate-800 font-black mb-0 text-center">Work Balance Radar</h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{fill: '#64748b', fontSize: 10, fontWeight: 700}} />
                      <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} />
                      <Radar name="Metrics" dataKey="A" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                      <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.1)'}} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Master Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-slate-800 font-black">Detailed Master Table</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">
                  Click headers to sort
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                      <TH label={selectedDistrict === 'All' ? 'District' : 'Officer Name'} sortKey="name" />
                      <TH label="KM" sortKey="total_km" />
                      <TH label="Notif" sortKey="notifications" />
                      <TH label="Tests" sortKey="tests" />
                      <TH label="Presumptive" sortKey="presumptive" />
                      <TH label="Doc Visit" sortKey="doctor_visits" />
                      <TH label="HIV/DM" sortKey="hiv_dm" />
                      <TH label="DBT" sortKey="dbt" />
                      <TH label="Sample Col" sortKey="sample_collection" />
                      <TH label="Outcomes" sortKey="outcome_assigned" />
                      <TH label="Home Vis" sortKey="home_visits" />
                      <TH label="Contact Tr" sortKey="contact_tracing" />
                      <TH label="Follow Up" sortKey="follow_ups" />
                      <TH label="F2F" sortKey="face_to_face" />
                      <TH label="Docs" sortKey="documents" />
                      <TH label="FDC" sortKey="fdc_provided" />
                      <TH label="Kits" sortKey="kit_consumption" />
                      <TH label="Diff TB" sortKey="differentiated_tb" />
                      <TH label="TPT Start" sortKey="tpt_treatment_start" />
                      <TH label="TPT Presumptive" sortKey="tpt_presumptive" />
                      <TH label="Adhar Auth" sortKey="adhar_face_auth" />
                      <TH label="Consent" sortKey="consent_with_id" />
                      <TH label="Override" sortKey="overrides" />
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors border-b border-slate-100 last:border-none text-xs font-semibold text-slate-700">
                        <td className="p-3 sticky left-0 bg-white shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-indigo-700 font-bold">{row.name}</td>
                        <td className="p-3">{row.total_km}</td>
                        <td className="p-3 text-emerald-600">{row.notifications}</td>
                        <td className="p-3 text-blue-600">{row.tests}</td>
                        <td className="p-3 text-amber-500">{row.presumptive}</td>
                        <td className="p-3 text-purple-600">{row.doctor_visits}</td>
                        <td className="p-3">{row.hiv_dm}</td>
                        <td className="p-3">{row.dbt}</td>
                        <td className="p-3">{row.sample_collection}</td>
                        <td className="p-3">{row.outcome_assigned}</td>
                        <td className="p-3">{row.home_visits}</td>
                        <td className="p-3">{row.contact_tracing}</td>
                        <td className="p-3">{row.follow_ups}</td>
                        <td className="p-3">{row.face_to_face}</td>
                        <td className="p-3">{row.documents}</td>
                        <td className="p-3">{row.fdc_provided}</td>
                        <td className="p-3">{row.kit_consumption}</td>
                          <td className="p-3 font-bold text-pink-600">{row.differentiated_tb}</td>
                          <td className="p-3 font-bold text-teal-600">{row.tpt_treatment_start}</td>
                          <td className="p-3 font-bold text-cyan-600">{row.tpt_presumptive}</td>
                          <td className="p-3 font-bold text-orange-600">{row.adhar_face_auth}</td>
                          <td className="p-3 font-bold text-indigo-400">{row.consent_with_id}</td>
                        <td className="p-3 text-red-500">{row.overrides > 0 ? row.overrides : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Branding Footer */}
      <footer className="w-full text-center py-8 mt-auto opacity-70">
        <p className="text-sm font-bold text-slate-500 tracking-widest uppercase">
          Designed by <span className="text-indigo-600 font-black">Insomniac</span>
        </p>
      </footer>

      {/* Missing Attendance Modal */}
      {showAttendanceModal && attendance && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col animate-fade-in">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-lg font-black text-slate-800">Pending Field Officers ({attendance.missing_count})</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Date: {attendance.date}</p>
              </div>
              <button onClick={() => setShowAttendanceModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1 leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar my-2">
              {attendance.missing_fos && attendance.missing_fos.length > 0 ? (
                attendance.missing_fos.map((fo, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-red-200 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{fo.fo_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{fo.district} &bull; {fo.designation}</p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                      Not Submitted
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-emerald-600 font-bold">
                  Sabhi Field Officers ne aaj ki report submit kar di hai!
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 mt-auto">
              <button 
                onClick={copyMissingReminder}
                disabled={attendance.missing_count === 0}
                className={`flex items-center gap-2 font-bold text-xs py-3 px-5 rounded-xl transition-all ${attendance.missing_count > 0 ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                {copiedAttendance ? 'WhatsApp Reminder Copied!' : 'Copy WhatsApp Reminder Message'}
              </button>
              <button onClick={() => setShowAttendanceModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {showTargetModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-black text-slate-800">Set Monthly Targets - {selectedDistrict}</h2>
              <button onClick={() => setShowTargetModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-xl">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {fos.filter(f => f !== 'All').map(fo => {
                 const tData = targetsData.find(t => t.fo_name === fo);
                 const currentTarget = tData ? tData.target : 0;
                 return (
                   <div key={fo} className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                     <span className="font-bold text-slate-700">{fo}</span>
                     <input type="number" value={currentTarget} onChange={(e) => handleTargetChange(fo, e.target.value)} className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center font-bold text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                   </div>
                 );
              })}
              {fos.filter(f => f !== 'All').length === 0 && (
                 <p className="text-center text-slate-500 font-medium py-4">No officers found for this district yet. They must submit at least one report.</p>
              )}
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowTargetModal(false)} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={saveAllTargets} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-indigo-700 active:scale-95 transition-all">Save Targets</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

