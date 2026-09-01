with open("src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update Calendar in MyProfileDashboard to ONLY have Green and Gray (remove Amber)
old_calendar_legend = """          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> 2 Done</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"></span> 1 Done</span>
          </div>"""

new_calendar_legend = """          <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Report Submitted</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> No Report</span>
          </div>"""

if old_calendar_legend in text:
    text = text.replace(old_calendar_legend, new_calendar_legend)
    print("calendar legend updated to green/gray")
else:
    print("old_calendar_legend not found")

old_calendar_tile_logic = """            let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
            if (count >= 2) {
              bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
            } else if (count === 1) {
              bgColor = "bg-amber-400 text-white font-black shadow-sm shadow-amber-400/30 border-amber-500";
            }"""

new_calendar_tile_logic = """            let bgColor = "bg-slate-50 text-slate-400 border-slate-100";
            if (count > 0) {
              bgColor = "bg-emerald-500 text-white font-black shadow-sm shadow-emerald-500/30 border-emerald-600";
            }"""

if old_calendar_tile_logic in text:
    text = text.replace(old_calendar_tile_logic, new_calendar_tile_logic)
    print("calendar tile logic updated (amber removed)")
else:
    print("old_calendar_tile_logic not found")

# 2. Add Persistent Auto-Login on Page Refresh / Reload
old_session_restore = "  const [isSubmitting, setIsSubmitting] = useState(false);"
new_session_restore = """  const [isSubmitting, setIsSubmitting] = useState(false);

  // Persistent Session Auto-Restore on Page Refresh (No Re-login required)
  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const savedSession = localStorage.getItem('dfy_user_session');
      if (savedSession) {
        const session = JSON.parse(savedSession);
        if (session && session.date === today && session.working_place && session.fo_name && session.pin) {
          // Check for local draft backup
          const draftKey = `dfy_draft_${session.working_place}_${session.fo_name}`;
          let initialData = {
            working_place: session.working_place,
            fo_name: session.fo_name,
            pin: session.pin,
            date_of_reporting: today
          };
          const rawDraft = localStorage.getItem(draftKey);
          if (rawDraft) {
            try {
              const parsedDraft = JSON.parse(rawDraft);
              initialData = sanitizeIncomingFormData(parsedDraft, initialData);
            } catch (e) {}
          }
          setFormData(prev => sanitizeIncomingFormData(initialData, { ...prev, ...initialData }));
          setPinStatus("success");
          setIsLoggedIn(true);
        }
      }
    } catch (e) {
      console.warn("Session restore error", e);
    }
  }, []);"""

if "Persistent Session Auto-Restore on Page Refresh" not in text:
    if old_session_restore in text:
        text = text.replace(old_session_restore, new_session_restore)
        print("persistent auto-login added")
    else:
        print("old_session_restore marker not found")

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)

