import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. State removals
text = text.replace(', \n    morning_km: "", evening_km: "",\n    is_override_used: false', '')
text = text.replace('morning_km: "", evening_km: "",', '')
text = text.replace('const [morningPhotoFile, setMorningPhotoFile] = useState(null);\n', '')
text = text.replace('const [eveningPhotoFile, setEveningPhotoFile] = useState(null);\n', '')
text = text.replace('const [isAdvancedMode, setIsAdvancedMode] = useState(false);\n', '')
text = text.replace("const [appState, setAppState] = useState('not_started');\n", '')
text = text.replace('const currentHour = new Date().getHours();\n', '')
text = text.replace("const canEditMorning = appState === 'not_started' || isAdvancedMode;\n", '')
text = text.replace("const canEditEvening = appState === 'in_progress' || appState === 'pending_previous' || isAdvancedMode;\n", '')

# 2. Upload photo function removal
idx_start = text.find('  const uploadPhoto = async (file) => {')
if idx_start != -1:
    idx_end = text.find('  };\n', idx_start) + 5
    text = text[:idx_start] + text[idx_end:]

# 3. WhatsApp text
text = re.sub(r'    text \+= \'\*\?\? Travel Details:\*\\n\';.*?text \+= \'- Total: \' \+ tKm \+ \' KM\\n\\n\';\n', '', text, flags=re.DOTALL)

# 4. Login Function 
text = text.replace('        setAppState(data.status);\n', '')

# 5. Submit Report function
idx_start = text.find('  const submitReport = async () => {')
idx_end = text.find('  const group1 = [')
if idx_start != -1 and idx_end != -1:
    old_submit = text[idx_start:idx_end]
    new_submit = """  const submitReport = async () => {
    if(!formData.working_place || !formData.fo_name || !formData.pin) {
      showToast("Pehle Zila, Naam aur PIN bharo!", "error");
      return;
    }
    
    setIsSubmitting(true);
    try {
      showToast("Saving your report...", "success");
      const payload = { ...formData, date: formData.date_of_reporting };
      
      const API_BASE_URL = import.meta.env.VITE_API_URL || "https://dfy-mis-app.onrender.com";
      const response = await fetch(`${API_BASE_URL}/submit-daily-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if(response.ok) {
        showToast("? Final Report Submitted Successfully!", "success");
        setTimeout(() => window.location.reload(), 2500);
      } else {
        const result = await response.json();
        showToast(result.detail || "Error in saving data.", "error");
      }
    } catch(err) {
      showToast("Network error while submitting report.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

"""
    text = text.replace(old_submit, new_submit)

start_match = re.search(r'\s*\)\s*:\s*appState\s*===\s*\'completed\'\s*\?\s*\(', text)
if not start_match:
    start_match = re.search(r'\s*\)\s*:\s*\(\s*/\*\s*Main Dashboard\s*\*/', text)

end_match = re.search(r'\s*</main>', text)

if start_match and end_match:
    g1_start = text.find('                  <Accordion title="1. Patient Registration" defaultOpen={true}>')
    g1_end = text.find('                  </Accordion>', g1_start) + 30
    g1 = text[g1_start:g1_end] if g1_start != -1 else ""

    g2_start = text.find('                  <Accordion title="2. Testing">')
    g2_end = text.find('                  </Accordion>', g2_start) + 30
    g2 = text[g2_start:g2_end] if g2_start != -1 else ""
    
    g3_start = text.find('                  <Accordion title="3. Follow Up">')
    g3_end = text.find('                  </Accordion>', g3_start) + 30
    g3 = text[g3_start:g3_end] if g3_start != -1 else ""
    
    g4_start = text.find('                  <Accordion title="4. Support/Delivery">')
    g4_end = text.find('                  </Accordion>', g4_start) + 30
    g4 = text[g4_start:g4_end] if g4_start != -1 else ""

    g5_start = text.find('                  <Accordion title="5. Differentiated & TPT">')
    g5_end = text.find('                  </Accordion>', g5_start) + 30
    g5 = text[g5_start:g5_end] if g5_start != -1 else ""

    rem_start = text.rfind('<div className="bg-white rounded-2xl', 0, text.find('Overall Remark (Optional)'))
    rem_end = text.find('</div>', text.find('</textarea>')) + 6
    rem = text[rem_start:rem_end] if rem_start != -1 else ""
    
    doc_code = """                <div className="bg-white rounded-2xl shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] border border-emerald-100 overflow-hidden">
                  <div className="bg-emerald-50/50 px-5 py-4 border-b border-emerald-50 flex items-center gap-2">
                    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <label className="block text-sm font-bold text-emerald-800 tracking-wide uppercase">Doctor / Store Visits</label>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="flex gap-2">
                      <input type="text" value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Doctor/Store Name" className="flex-1 w-full bg-slate-50/50 border border-slate-200 text-slate-800 text-sm rounded-lg px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-300" />
                      <button onClick={addDoctor} className="bg-emerald-500 text-white px-4 py-2.5 rounded-lg font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all text-sm tracking-wide">ADD</button>
                    </div>
                    {formData.visited_names.length > 0 && (
                      <ul className="mt-4 space-y-2">
                        {formData.visited_names.map((name, i) => (
                          <li key={i} className="flex justify-between items-center bg-white border border-slate-100 px-3.5 py-2.5 rounded-lg text-sm text-slate-600 font-semibold shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
                            <span className="flex items-center gap-3">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                              {name}
                            </span>
                            <button onClick={() => {
                              setFormData({ ...formData, visited_names: formData.visited_names.filter((_, idx) => idx !== i) });
                            }} className="text-slate-300 hover:text-red-500 font-bold text-lg transition-colors">&times;</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>"""

    new_dash = (
        '\n          ) : (\n'
        '            /* Main Dashboard */\n'
        '            <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">\n'
        '              <div className="grid grid-cols-1 gap-4">\n'
        + g1 + '\n'
        + g2 + '\n'
        + g3 + '\n'
        + g4 + '\n'
        + g5 + '\n'
        + rem + '\n'
        '              </div>\n\n'
        '              {/* Travel & Doctors Section */}\n'
        '              <div className="grid grid-cols-1 gap-4 mt-8">\n'
        + doc_code + '\n'
        '              </div>\n\n'
        '              {/* Spacer for Sticky Footer */}\n'
        '              <div className="h-40 w-full pointer-events-none"></div>\n\n'
        '              {/* Sticky Bottom Action Bar */}\n'
        '              <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-100 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] z-50">\n'
        '                <div className="max-w-4xl mx-auto">\n'
        '                  <button \n'
        '                    onClick={submitReport} \n'
        '                    disabled={isSubmitting}\n'
        '                    className={`w-full bg-indigo-600 text-white font-bold text-sm py-4 px-4 sm:px-6 rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 hover:shadow-indigo-600/40 active:scale-95 transition-all tracking-widest uppercase flex justify-center items-center gap-3 ${isSubmitting ? \'opacity-70 cursor-not-allowed\' : \'\'}`}\n'
        '                  >\n'
        '                    {isSubmitting ? (\n'
        '                      <>\n'
        '                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>\n'
        '                        Submitting...\n'
        '                      </>\n'
        '                    ) : \'Submit Final Report\'}\n'
        '                  </button>\n'
        '                </div>\n'
        '              </div>\n'
        '            </div>\n'
    )
    text = text[:start_match.start()] + new_dash + text[end_match.start():]

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

