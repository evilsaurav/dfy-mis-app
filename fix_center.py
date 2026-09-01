import re

with open('dfy-frontend/src/AdminDashboard.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

pattern = r"\{selectedFO !== 'All' && \(\s*<div className=\"bg-gradient-to-r from-indigo-600.*?\)\}"

replacement = r"""{selectedFO !== 'All' && (
                <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-3xl shadow-xl p-8 sm:p-10 text-white flex flex-col items-center justify-center relative overflow-hidden mb-8 animate-fade-in-down mx-auto max-w-4xl border border-indigo-400/30">
                   <div className="absolute top-0 right-0 w-80 h-80 bg-white opacity-10 rounded-full -mt-20 -mr-20 pointer-events-none blur-3xl"></div>
                   <div className="absolute bottom-0 left-0 w-64 h-64 bg-black opacity-10 rounded-full -mb-20 -ml-20 pointer-events-none blur-3xl"></div>
                   
                   <div className="h-24 w-24 sm:h-28 sm:w-28 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-4xl sm:text-5xl font-black shadow-2xl border-4 border-white/40 shrink-0 uppercase mb-4 z-10 text-white drop-shadow-md">
                     {selectedFO.charAt(0)}
                   </div>
                   
                   <div className="text-center z-10 w-full">
                     <h2 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight drop-shadow-md">{selectedFO}</h2>
                     <p className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-8 bg-black/20 inline-block px-4 py-1.5 rounded-full border border-white/10 shadow-sm">{selectedDistrict} District</p>
                     
                     <div className="flex flex-wrap justify-center gap-3 sm:gap-6 text-sm font-semibold max-w-2xl mx-auto w-full">
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
              )}"""

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('dfy-frontend/src/AdminDashboard.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
