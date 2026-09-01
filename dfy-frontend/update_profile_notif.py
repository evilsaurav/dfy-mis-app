# -*- coding: utf-8 -*-
with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# Update MyProfileDashboard percentage and labels to use Notifications
old_profile_calc = """  const targetVal = Number(stats.target) || 0;
  const achievedVal = Number(stats.total_achieved) || 0;
  const percent = targetVal > 0 ? Math.min(100, Math.round((achievedVal / targetVal) * 100)) : 100;
  const breakdown = stats.breakdown || {};"""

new_profile_calc = """  const targetVal = Number(stats.target) || 0;
  const breakdown = stats.breakdown || {};
  const notifAchieved = Number(breakdown.notification) || 0;
  const percent = targetVal > 0 ? Math.min(100, Math.round((notifAchieved / targetVal) * 100)) : 0;"""

if old_profile_calc in text:
    text = text.replace(old_profile_calc, new_profile_calc)
    print("MyProfileDashboard calculation updated to use notifications")
else:
    print("old_profile_calc not found")

old_profile_boxes = """           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Monthly Target</p>
             <p className="text-xl font-black text-slate-700">{targetVal}</p>
           </div>
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Total Achieved</p>
             <p className="text-xl font-black text-indigo-600">{achievedVal}</p>
           </div>"""

new_profile_boxes = """           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Notification Target</p>
             <p className="text-xl font-black text-slate-700">{targetVal}</p>
           </div>
           <div>
             <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">Notification Achieved</p>
             <p className="text-xl font-black text-indigo-600">{notifAchieved}</p>
           </div>"""

if old_profile_boxes in text:
    text = text.replace(old_profile_boxes, new_profile_boxes)
    print("MyProfileDashboard boxes updated")
else:
    print("old_profile_boxes not found")

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(text)
