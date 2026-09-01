with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

old_bar = """              {/* Sticky Bottom Action Bar */}
              <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-50">
                <div className="max-w-4xl mx-auto">
                  <button 
                    onClick={submitReport} 
                    disabled={isSubmitting}
                    className={`w-full bg-indigo-600 text-white font-bold text-sm py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all tracking-widest uppercase flex justify-center items-center gap-3 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        Submitting...
                      </>
                    ) : 'Submit Final Report'}
                  </button>
                </div>
              </div>"""

new_bar = """              {/* Sticky Bottom Action Bar */}
              <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-100 p-3 sm:p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-50">
                <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3">
                  <button 
                    onClick={copyToWhatsApp}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs sm:text-sm py-3.5 sm:py-4 px-3.5 sm:px-5 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 active:scale-95 shadow-sm"
                    title="Copy WhatsApp Summary"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>WhatsApp</span>
                  </button>
                  <button 
                    onClick={submitReport} 
                    disabled={isSubmitting}
                    className={`flex-1 bg-indigo-600 text-white font-bold text-xs sm:text-sm py-3.5 sm:py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all tracking-wider uppercase flex justify-center items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span>Submitting...</span>
                      </>
                    ) : 'Submit Final Report'}
                  </button>
                </div>
              </div>"""

if old_bar in text:
    text = text.replace(old_bar, new_bar)
    print("Bottom bar updated")
else:
    print("old_bar not found")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

