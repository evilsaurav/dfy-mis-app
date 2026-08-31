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
    if (isAuthenticated) fetchData();
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
      documents: 0, fdc_provided: 0, kit_consumption: 0, overrides: 0
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
      { subject: 'Presumptive', A: totals.presumptive, fullMark: 150 }
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
            <button onClick={() => window.location.href = '/'} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">Exit</button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20 font-bold text-slate-500">Loading Data...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-20 font-bold text-slate-500 bg-white rounded-2xl shadow-sm border border-slate-100">No data found for selected filters</div>
        ) : (
          <>
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
    </div>
  );
}
