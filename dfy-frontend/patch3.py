import os
import re

with open("src/App.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# Replace the giant appState rendering block
# The old one had:
# ) : appState === 'completed' ? (
#   <div className="max-w-md mx-auto ...
# ) : (
#   <div className="animate-fade-in">
#     {appState === 'pending_previous' && ...
pattern = r"\s*\)\s*:\s*appState === 'completed' \? \(\s*<div className=\"max-w-md mx-auto mt-16.*?</div>\s*\)\s*:\s*\(\s*/\* Main Dashboard \*/\s*<div className=\"animate-fade-in\">"
new_render = r''' ) : (
          /* Main Dashboard */
          <div className="animate-fade-in w-[95%] sm:w-full max-w-md mx-auto overflow-x-hidden">'''
code = re.sub(pattern, new_render, code, flags=re.DOTALL)

# Remove pending previous alert
code = re.sub(r'\{appState === \'pending_previous\' && \(.*?\)\}', '', code, flags=re.DOTALL)

# Remove grid conditional
code = code.replace(
    '<div className={`grid grid-cols-1 ${(appState === \'in_progress\' || appState === \'pending_previous\') ? \'md:grid-cols-2\' : \'\'} gap-4 mt-8`}>',
    '<div className="grid grid-cols-1 gap-4 mt-8">'
)

# Replace conditional Accordions
code = re.sub(r'\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<>\s*(<Accordion title="1.*?)\s*</>\s*\)\}', r'\1', code, flags=re.DOTALL)

code = code.replace(
    '''              {/* Doctor Visits */}
              {(appState === 'in_progress' || appState === 'pending_previous') && (
''', '''              {/* Doctor Visits */}
''')

# Now remove the morning and evening blocks carefully by searching for their labels
km_pattern = r'\{\(appState === \'not_started\' \|\| appState === \'pending_previous\'\) && \(\s*<div className="bg-white rounded-2xl shadow-\[0_2px_10px_-3px_rgba\(99,102,241,0\.1\)\] border border-indigo-100 overflow-hidden">.*?</div>\s*\)\}'
code = re.sub(km_pattern, '', code, flags=re.DOTALL)

eve_km_pattern = r'\{\(appState === \'in_progress\' \|\| appState === \'pending_previous\'\) && \(\s*<div className="bg-white rounded-2xl shadow-\[0_2px_10px_-3px_rgba\(16,185,129,0\.1\)\] border border-emerald-100 overflow-hidden">.*?</div>\s*\)\}'
code = re.sub(eve_km_pattern, '', code, flags=re.DOTALL)

# Fix Mobile UI login container
code = code.replace(
    '<div className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in">',
    '<div className="w-[90%] sm:w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 sm:p-10 border border-slate-100 relative overflow-hidden animate-scale-in mx-auto">'
)
code = code.replace(
    '<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden">',
    '<div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-2 sm:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden w-full">'
)

with open("src/App.jsx", "w", encoding="utf-8") as f:
    f.write(code)

