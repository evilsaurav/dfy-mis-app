with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

old_str = """            {isLoggedIn && (
              <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors">
                <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            )}"""
            
new_str = """            {isLoggedIn && (
              <>
                <button onClick={() => setCurrentView(currentView === 'form' ? 'profile' : 'form')} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-200 transition-colors">
                  {currentView === 'form' ? 'Profile' : 'Form'}
                </button>
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-800 text-sm font-bold transition-colors ml-1">
                  <svg width="18" height="18" className="sm:w-[20px] sm:h-[20px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
              </>
            )}"""

if old_str in text:
    text = text.replace(old_str, new_str)
else:
    print("NOT FOUND AGAIN")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

