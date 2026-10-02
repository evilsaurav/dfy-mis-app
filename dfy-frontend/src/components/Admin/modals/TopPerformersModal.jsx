import React from 'react';

export const TOP_PERFORMER_MESSAGES = [
  "🌟 Bihar TB Warriors: Aapka asadharan samarpan aur kadi mehnat Bihar ko TB-mukt banane ki disha me ek nayi kranti la rahi hai!",
  "🔥 Salute to Real Heroes: Har ek notification, home visit aur diagnostic test se kisi pariwar ki zindagi sawar rahi hai. Shandar pradarshan!",
  "🏆 Pride of Doctors For You: Aapki nishtha aur zameeni karyashaili poore Bihar ke sabhi swasthya karmio ke liye prernasrot hai!",
  "🚀 Champions of Frontline Care: Zameen par utarkar har marij tak pahuchna hi sacche seva-bhav ki pehchan hai. Bahut-bahut badhaai!",
  "👏 Exemplary Healthcare Leadership: Aapke atoot sankalp aur parishram ne naye kirtiman sthapit kiye hain. We are immensely proud of you!",
  "💎 Pillars of TB Eradication: Har din naye utsah aur zimmedari ke sath har ek marij tak dava aur dekhbhal pahunchana hi aapki asali taqat hai!",
  "🎯 Mission TB-Free Bihar: Zila star se lekar block tak aapka pradarshan misaal ban chuka hai. Isi josh aur lagan ke sath aage badhte rahein!",
  "🌈 Excellence in Public Health: Aapka yogdan na keval pradarshan me sarvochha hai, balki hazaron pariwaron me nayi umeed jaga raha hai!"
];

export default function TopPerformersModal({
  show,
  onClose,
  adminTargetViewMode,
  topPerformersPeriod,
  setTopPerformersPeriod,
  fetchTopPerformers,
  month,
  topPerformersData,
  loadingTopPerformers,
  topPerformerRandomMsg,
  setTopPerformerRandomMsg,
  topPerformersCanvasRef,
  handleShareTopPerformersWhatsApp,
  handleDownloadTopPerformersPoster
}) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-950 text-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-indigo-900/60 animate-fade-in my-auto">
        {/* Modal Header */}
        <div className="p-4 sm:p-6 border-b border-white/10 flex justify-between items-center bg-slate-900/80">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏆</span>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white flex flex-wrap items-center gap-2">
                Bihar Top Performers Studio
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Statewide Broadcast
                </span>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                  adminTargetViewMode === 'frontline'
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                }`}>
                  {adminTargetViewMode === 'frontline' ? '🛵 Frontline Operational' : '🏛️ Official Quota'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Gamified leaderboards across all 38 districts &amp; frontline field officers for WhatsApp sharing
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl font-bold p-1 leading-none transition-colors cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Controls bar: Timeframe Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">Timeframe:</span>
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setTopPerformersPeriod('weekly');
                    fetchTopPerformers('weekly');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    topPerformersPeriod === 'weekly'
                      ? 'bg-indigo-600 text-white shadow-xs font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Weekly (7 Days)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTopPerformersPeriod('fortnightly');
                    fetchTopPerformers('fortnightly');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    topPerformersPeriod === 'fortnightly'
                      ? 'bg-indigo-600 text-white shadow-xs font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  15 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTopPerformersPeriod('monthly');
                    fetchTopPerformers('monthly');
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                    topPerformersPeriod === 'monthly'
                      ? 'bg-indigo-600 text-white shadow-xs font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Monthly ({month})
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>📅 Range: <strong className="text-white font-mono">{topPerformersData?.start_date || `${month}-01`}</strong> to <strong className="text-white font-mono">{topPerformersData?.end_date || 'Today'}</strong></span>
            </div>
          </div>

          {/* High-Resolution Live Poster Card Preview */}
          <div className="relative rounded-3xl p-6 border border-indigo-500/30 bg-gradient-to-br from-slate-900 via-indigo-950 to-teal-950 text-white shadow-2xl overflow-hidden">
            {/* Glow spheres */}
            <div className="absolute top-0 right-10 w-72 h-72 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-10 w-72 h-72 bg-teal-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Poster Header */}
            <div className="text-center relative z-10 space-y-1 mb-6">
              <div className="text-xs uppercase tracking-widest font-black text-teal-400">
                DOCTORS FOR YOU • BIHAR TB ELIMINATION MISSION
              </div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                🏆 STATEWIDE TOP PERFORMERS
              </h3>
              <div className="inline-block mt-2 px-4 py-1 rounded-full bg-white/10 border border-yellow-400/30 text-yellow-300 font-bold text-xs">
                {topPerformersPeriod === 'weekly' 
                  ? 'WEEKLY SPRINT (LAST 7 DAYS)' 
                  : topPerformersPeriod === 'fortnightly' 
                  ? '15-DAY PERFORMANCE DRIVE' 
                  : `MONTHLY LEADERBOARD (${month})`}
              </div>
            </div>

            {/* Poster Columns: 5 Clinical Quadrants + Mission Impact */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
              {/* Q1: Top 5 Districts */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏛️</span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">Top 5 Districts</h4>
                      <p className="text-[10px] text-slate-400">
                        {adminTargetViewMode === 'frontline' ? 'Frontline Stretch Benchmark' : 'Official State Quota Benchmark'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Target %</span>
                </div>

                <div className="space-y-2">
                  {loadingTopPerformers ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                  ) : (topPerformersData?.top_districts || []).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                  ) : (
                    (topPerformersData?.top_districts || []).slice(0, 5).map((d, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          i === 0 
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-100' 
                            : i === 1 
                            ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                            : i === 2 
                            ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                            : 'bg-white/5 border-white/5 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 text-center text-base font-black">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <div>
                            <span className="font-bold text-sm text-white block">{d.district}</span>
                            <span className="text-[10px] text-sky-300 font-mono font-semibold">
                              {d.notifications} / {d.target || 0} notifs ({adminTargetViewMode === 'frontline' ? 'Frontline' : 'Official'})
                            </span>
                          </div>
                        </div>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${d.percentage >= 100 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}`}>
                          {d.percentage}%
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q2: Top 5 FO & Hub Agents */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-purple-400">Top 5 FO &amp; Hub Agents</h4>
                      <p className="text-[10px] text-slate-400">Clinical TB Notifications</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Volume</span>
                </div>

                <div className="space-y-2">
                  {loadingTopPerformers ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                  ) : (topPerformersData?.top_fo || topPerformersData?.top_staff || []).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                  ) : (
                    (topPerformersData?.top_fo || topPerformersData?.top_staff || []).slice(0, 5).map((s, i) => {
                      const isHub = s.designation === 'Hub Agent' || String(s.designation || '').toUpperCase().includes('HUB');
                      return (
                        <div 
                          key={i} 
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                            i === 0 
                              ? 'bg-purple-500/20 border-purple-500/40 text-purple-100' 
                              : i === 1 
                              ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                              : i === 2 
                              ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                              : 'bg-white/5 border-white/5 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-6 text-center text-base font-black shrink-0">
                              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                            </span>
                            <div className="truncate">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-sm text-white truncate">{s.fo_name}</span>
                                {isHub && (
                                  <span className="text-[8px] font-black px-1 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                    HUB
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-purple-300 font-medium">📍 {s.district}</span>
                            </div>
                          </div>
                          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono shrink-0">
                            {s.notifications ?? s.metric_value ?? 0} notifs
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Q3: Top 5 Treatment Coordinators */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏠</span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">Top 5 Treatment Coordinators</h4>
                      <p className="text-[10px] text-slate-400">Home Visits &amp; Patient Tracking</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Visits</span>
                </div>

                <div className="space-y-2">
                  {loadingTopPerformers ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                  ) : (topPerformersData?.top_tc || []).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                  ) : (
                    (topPerformersData?.top_tc || []).slice(0, 5).map((s, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          i === 0 
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-100' 
                            : i === 1 
                            ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                            : i === 2 
                            ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                            : 'bg-white/5 border-white/5 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 text-center text-base font-black shrink-0">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-sm text-white block truncate">{s.fo_name}</span>
                            <span className="text-[10px] text-amber-300 font-medium">📍 {s.district}</span>
                          </div>
                        </div>
                        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono shrink-0">
                          {s.home_visits ?? s.metric_value ?? 0} visits
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q4: Top 5 Lab Technicians */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔬</span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">Top 5 Lab Technicians</h4>
                      <p className="text-[10px] text-slate-400">Diagnostic Tests Performed</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Tests</span>
                </div>

                <div className="space-y-2">
                  {loadingTopPerformers ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                  ) : (topPerformersData?.top_lt || []).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                  ) : (
                    (topPerformersData?.top_lt || []).slice(0, 5).map((s, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          i === 0 
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100' 
                            : i === 1 
                            ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                            : i === 2 
                            ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                            : 'bg-white/5 border-white/5 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 text-center text-base font-black shrink-0">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-sm text-white block truncate">{s.fo_name}</span>
                            <span className="text-[10px] text-emerald-300 font-medium">📍 {s.district}</span>
                          </div>
                        </div>
                        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono shrink-0">
                          {s.tests ?? s.metric_value ?? 0} tests
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q5: Top 5 SCT Agents */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧪</span>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-rose-400">Top 5 SCT Agents</h4>
                      <p className="text-[10px] text-slate-400">Sputum Samples Collected</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Collections</span>
                </div>

                <div className="space-y-2">
                  {loadingTopPerformers ? (
                    <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading rankings...</div>
                  ) : (topPerformersData?.top_sct || []).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">No records available</div>
                  ) : (
                    (topPerformersData?.top_sct || []).slice(0, 5).map((s, i) => (
                      <div 
                        key={i} 
                        className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                          i === 0 
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-100' 
                            : i === 1 
                            ? 'bg-slate-300/10 border-slate-300/20 text-slate-100' 
                            : i === 2 
                            ? 'bg-amber-700/15 border-amber-700/30 text-amber-200' 
                            : 'bg-white/5 border-white/5 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 text-center text-base font-black shrink-0">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                          </span>
                          <div className="truncate">
                            <span className="font-bold text-sm text-white block truncate">{s.fo_name}</span>
                            <span className="text-[10px] text-rose-300 font-medium">📍 {s.district}</span>
                          </div>
                        </div>
                        <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono shrink-0">
                          {s.samples_collected ?? s.metric_value ?? 0} collections
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Q6: Statewide Mission Highlights */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✨</span>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-sky-400">Bihar Mission Impact</h4>
                        <p className="text-[10px] text-slate-400">Clinical Overview &amp; Reach</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400">Live Totals</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Districts</div>
                      <div className="text-base font-black text-sky-300 font-mono">{(topPerformersData?.top_districts || []).length}</div>
                      <div className="text-[9px] text-slate-500">Tracked</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Notifs</div>
                      <div className="text-base font-black text-purple-300 font-mono">
                        {(topPerformersData?.top_districts || []).reduce((acc, d) => acc + (d.notifications || 0), 0)}
                      </div>
                      <div className="text-[9px] text-slate-500">Target Volume</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">TC Visits</div>
                      <div className="text-base font-black text-amber-300 font-mono">
                        {(topPerformersData?.top_tc || []).reduce((acc, s) => acc + (s.home_visits || s.metric_value || 0), 0)}
                      </div>
                      <div className="text-[9px] text-slate-500">Home Visits</div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Tests &amp; Samples</div>
                      <div className="text-base font-black text-emerald-300 font-mono">
                        {((topPerformersData?.top_lt || []).reduce((acc, s) => acc + (s.tests || s.metric_value || 0), 0)) + 
                         ((topPerformersData?.top_sct || []).reduce((acc, s) => acc + (s.samples_collected || s.metric_value || 0), 0))}
                      </div>
                      <div className="text-[9px] text-slate-500">Laboratory</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-teal-500/10 border border-amber-500/25 text-center space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-amber-400">
                    <span>✨</span>
                    <span>Statewide Commendation Tribute</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newMsg = TOP_PERFORMER_MESSAGES[Math.floor(Math.random() * TOP_PERFORMER_MESSAGES.length)];
                        setTopPerformerRandomMsg(newMsg);
                      }}
                      className="ml-1 text-[9px] text-slate-400 hover:text-amber-300 underline cursor-pointer"
                      title="Shuffle random congratulatory quote"
                    >
                      🎲 Shuffle
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-200 font-medium italic">
                    &ldquo;{topPerformerRandomMsg || TOP_PERFORMER_MESSAGES[0]}&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* Poster Preview Footer */}
            <div className="mt-4 pt-3 border-t border-white/10 text-center text-[10px] text-slate-400 relative z-10">
              State TB Mission Bihar • Doctors For You MIS
            </div>
          </div>

          {/* Hidden 1200x1960 Canvas for HD PNG Export */}
          <canvas ref={topPerformersCanvasRef} className="hidden" />
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">
            HD 1200x1960 PNG card generated on-the-fly via client HTML5 canvas with random commendation. Zero server memory load.
          </span>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleShareTopPerformersWhatsApp}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>📲</span>
              <span>Share on WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadTopPerformersPoster}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 to-teal-600 hover:from-indigo-500 hover:to-teal-500 text-white shadow-lg shadow-indigo-600/30 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>⬇️</span>
              <span>Download Poster (PNG)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
