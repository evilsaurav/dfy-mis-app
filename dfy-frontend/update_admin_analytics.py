# -*- coding: utf-8 -*-
with open("dfy-frontend/src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Add activeMetric state and Leaderboard / Daily Trend computations
state_marker = "  const [targetsData, setTargetsData] = useState([]);"
new_state = """  const [targetsData, setTargetsData] = useState([]);
  const [activeMetric, setActiveMetric] = useState('notifications');"""

if state_marker in text:
    text = text.replace(state_marker, new_state)
    print("activeMetric state added")

# 2. Update KPI download buttons to pass current month
old_kpi_single = 'window.open(API_BASE_URL + "/download-kpi-workbook?district=" + selectedDistrict, "_blank");'
new_kpi_single = 'window.open(API_BASE_URL + "/download-kpi-workbook?district=" + selectedDistrict + "&month=" + month, "_blank");'
if old_kpi_single in text:
    text = text.replace(old_kpi_single, new_kpi_single)
    print("KPI single download updated with month")

old_kpi_all = 'window.open(`${API_BASE_URL}/download-all-kpi-workbooks`, "_blank");'
new_kpi_all = 'window.open(`${API_BASE_URL}/download-all-kpi-workbooks?month=${month}`, "_blank");'
if old_kpi_all in text:
    text = text.replace(old_kpi_all, new_kpi_all)
    print("KPI all download updated with month")

# 3. Add Leaderboard and Daily Trend useMemo computations
radar_marker = "  // Radar Chart Data (Work Balance)"
leaderboard_computations = """  // Daily Timeline Trend Data
  const dailyTrendData = useMemo(() => {
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
    const map = {};
    days.forEach(d => { map[d] = 0; });
    filteredRecords.forEach(r => {
      if (r.date_of_reporting) {
        const parts = r.date_of_reporting.split('-');
        const d = parts[2];
        if (d && map[d] !== undefined) {
          map[d] += (r[activeMetric] || 0);
        }
      }
    });
    return days.map(d => ({ day: `${Number(d)}`, value: map[d] }));
  }, [filteredRecords, activeMetric]);

  // District Performance Leaderboard
  const leaderboardData = useMemo(() => {
    const distList = Object.keys(staffDirectory).length > 0 ? Object.keys(staffDirectory).sort() : ["Aurangabad", "Bhojpur", "Buxar", "Jamui", "Jehanabad", "Kaimur", "Lakhisarai", "Munger", "Nawada", "Sheikhpura"];
    const result = distList.map(dist => {
      const distRecords = rawRecords.filter(r => r.working_place === dist);
      const notif = distRecords.reduce((sum, r) => sum + (r.notifications || 0), 0);
      const target = targetsData.filter(t => t.district === dist).reduce((sum, t) => sum + (Number(t.target) || 0), 0);
      const pct = target > 0 ? Math.round((notif / target) * 100) : 0;
      return {
        district: dist,
        notifications: notif,
        target: target,
        percentage: pct,
        reports: distRecords.length
      };
    });
    return result.sort((a, b) => b.percentage - a.percentage || b.notifications - a.notifications);
  }, [rawRecords, targetsData, staffDirectory]);

  // Radar Chart Data (Work Balance)"""

if radar_marker in text:
    text = text.replace(radar_marker, leaderboard_computations)
    print("Leaderboard and daily trend computations added")

# 4. Add Interactive Trend Chart & Leaderboard visual sections
charts_marker = '            {/* Charts Section */}'
interactive_analytics_ui = """            {/* State Performance Leaderboard & Interactive Trend Graph */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Leaderboard */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-slate-800 font-black text-base flex items-center gap-2">
                      <span>🏆</span> District Leaderboard
                    </h3>
                    <p className="text-slate-400 text-xs font-semibold">Ranked by Target Achievement</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-100">
                    Month: {month}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 max-h-80 pr-1 custom-scrollbar">
                  {leaderboardData.map((item, index) => {
                    let rankBadge = `${index + 1}`;
                    let rankBg = "bg-slate-100 text-slate-600";
                    if (index === 0) { rankBadge = "🥇 1"; rankBg = "bg-amber-100 text-amber-800 border-amber-200 shadow-sm font-black"; }
                    else if (index === 1) { rankBadge = "🥈 2"; rankBg = "bg-slate-200 text-slate-800 border-slate-300 font-black"; }
                    else if (index === 2) { rankBadge = "🥉 3"; rankBg = "bg-amber-50 text-amber-900 border-amber-200 font-black"; }

                    let barColor = "bg-red-500";
                    if (item.percentage >= 100) barColor = "bg-emerald-500";
                    else if (item.percentage >= 50) barColor = "bg-amber-400";

                    return (
                      <div key={item.district} className="p-3 bg-slate-50/70 rounded-xl border border-slate-100 hover:border-purple-200 transition-all">
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded-lg border ${rankBg}`}>{rankBadge}</span>
                            <span className="text-xs font-black text-slate-800">{item.district}</span>
                          </div>
                          <span className={`text-xs font-black ${item.percentage >= 100 ? 'text-emerald-600' : item.percentage >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                            {item.percentage}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-1">
                          <span>{item.notifications} Notif / {item.target} Target</span>
                          <span>{item.reports} Reports</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(100, item.percentage)}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Daily Timeline Trend Chart */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
                  <div>
                    <h3 className="text-slate-800 font-black text-base">Daily Activity Timeline</h3>
                    <p className="text-slate-400 text-xs font-semibold">Day-by-day trajectory across 31 days</p>
                  </div>
                  
                  {/* Metric Switcher Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key: 'notifications', label: 'Notif', color: 'indigo' },
                      { key: 'tests', label: 'Tests', color: 'blue' },
                      { key: 'presumptive', label: 'Presumptive', color: 'amber' },
                      { key: 'dbt', label: 'DBT', color: 'emerald' },
                      { key: 'tpt_treatment_start', label: 'TPT', color: 'teal' },
                      { key: 'doctor_visits', label: 'Visits', color: 'purple' }
                    ].map(m => (
                      <button
                        key={m.key}
                        onClick={() => setActiveMetric(m.key)}
                        className={`text-[11px] font-black px-2.5 py-1 rounded-lg transition-all active:scale-95 ${activeMetric === m.key ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} allowDecimals={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1e293b', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                        itemStyle={{ color: '#818cf8' }}
                        formatter={(val) => [`${val} entries`, activeMetric.replace(/_/g, ' ').toUpperCase()]}
                        labelFormatter={(label) => `Day ${label} of Month`}
                      />
                      <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
"""

if charts_marker in text:
    text = text.replace(charts_marker, interactive_analytics_ui + "\n" + charts_marker)
    print("Leaderboard and interactive timeline chart UI added")

with open("dfy-frontend/src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
