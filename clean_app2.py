import re

with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Replace the entire rendering block that checks isLoggedIn and appState
# We will find the part after `if (!isLoggedIn)` up to the footer.

pattern = r'''\s*\}\s*\)\s*:\s*appState === 'completed' \? \(\s*<div className="max-w-md mx-auto mt-16 text-center bg-white p-8 rounded-2xl shadow-sm border border-slate-100 animate-fade-in-down">.*?</div>\s*\)\s*:\s*\(\s*/\* Main Dashboard \*/\s*<div className="animate-fade-in">'''

content = re.sub(pattern, r''' ) : (
          /* Main Dashboard */
          <div className="animate-fade-in w-full max-w-md mx-auto overflow-x-hidden">''', content, flags=re.DOTALL)

# Remove the red banner for pending_previous
content = re.sub(r'\{appState === \'pending_previous\' && \(.*?\)\}', '', content, flags=re.DOTALL)
# Remove the grid columns ternary
content = re.sub(r'<div className=\{`grid grid-cols-1 \$\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) \? \'md:grid-cols-2\' : \'\'\} gap-4 mt-8`\}>', r'<div className="grid grid-cols-1 gap-4 mt-8">', content, flags=re.DOTALL)

# Remove the morning KM / evening KM blocks
# The block starts with `{(appState === 'not_started' || appState === 'pending_previous') && (`
content = re.sub(r'\{\(appState === \'not_started\' \|\| appState === \'pending_previous\'\) && \(\s*<div className="bg-white rounded-2xl.*?</div>\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<div className="bg-white rounded-2xl.*?</div>\s*\)\}', '', content, flags=re.DOTALL)
content = re.sub(r'\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<>\s*(<Accordion title="1.*?)\s*</>\s*\)\}', r'\1', content, flags=re.DOTALL)


# Remove Start Day / Submit buttons logic
buttons_pattern = r'\{appState === \'not_started\' \? \(.*?\) : appState === \'in_progress\' \|\| appState === \'pending_previous\' \? \(.*?</button>\s*</div>\s*\)\s*:\s*null\}'
new_buttons = r'''<div className="mt-8 mb-6">
  <button 
    onClick={submitReport} 
    disabled={isSubmitting} 
    className={`w-full bg-slate-900 text-white font-black py-4 rounded-xl text-lg shadow-[0_4px_14px_0_rgba(15,23,42,0.39)] hover:shadow-[0_6px_20px_rgba(15,23,42,0.23)] hover:bg-slate-800 transition-all ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'active:scale-[0.98]'}`}>
    {isSubmitting ? 'Saving...' : 'Submit Report'}
  </button>
</div>'''
content = re.sub(buttons_pattern, new_buttons, content, flags=re.DOTALL)


# Fix Mobile UI issue: Make the login container responsive
# Find `<div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in">`
# and ensure it's wrapped properly.
content = content.replace(
    '<div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in">',
    '<div className="w-[90%] sm:w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in mx-auto">'
)
content = content.replace(
    '<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">',
    '<div className="min-h-screen bg-slate-50 flex items-center justify-center p-2 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">'
)

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Pass 2 complete.")
