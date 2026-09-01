const fs = require('fs');
let content = fs.readFileSync('dfy-frontend/src/AdminDashboard.jsx', 'utf8');

const profileCard = `{selectedFO !== 'All' && (
                <div className="bg-gradient-to-r from-indigo-600 to-blue-500 rounded-2xl shadow-lg p-6 sm:p-8 text-white flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden mb-6 animate-fade-in-down">
                   <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mt-10 -mr-10"></div>
                   <div className="h-24 w-24 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-4xl font-black shadow-inner border-4 border-white/30 shrink-0 uppercase">
                     {selectedFO.charAt(0)}
                   </div>
                   <div className="text-center sm:text-left z-10 w-full">
                     <h2 className="text-3xl font-black mb-1">{selectedFO}</h2>
                     <p className="text-indigo-100 font-bold uppercase tracking-widest text-xs mb-4 bg-black/20 inline-block px-3 py-1 rounded-full">{selectedDistrict} District</p>
                     <div className="flex flex-wrap justify-center sm:justify-start gap-4 text-sm font-semibold">
                       <span className="bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10"><span className="text-white/60 text-xs uppercase tracking-wider">Days Active</span> <span className="text-lg">{filteredRecords.length}</span></span>
                       <span className="bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10"><span className="text-white/60 text-xs uppercase tracking-wider">Total Travel</span> <span className="text-lg">{totals.total_km} KM</span></span>
                       <span className="bg-white/10 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-white/10"><span className="text-white/60 text-xs uppercase tracking-wider">Total Activities</span> <span className="text-lg">{Object.values(totals).reduce((a,b)=>a+b, 0) - totals.total_km}</span></span>
                     </div>
                   </div>
                </div>
              )}

              {/* The BIG 5 KPIs */}`;

content = content.replace('{/* The BIG 5 KPIs */}', profileCard);

fs.writeFileSync('dfy-frontend/src/AdminDashboard.jsx', content);
