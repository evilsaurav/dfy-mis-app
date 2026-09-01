# -*- coding: utf-8 -*-
with open("dfy-frontend/src/AdminDashboard.jsx", "r", encoding="utf-8") as f:
    text = f.read()

text = text.replace('\r\n', '\n')

# 1. Update foRecords matching to be case/whitespace-insensitive and handle any district context
old_filter_line = "const foRecords = rawRecords.filter(r => r.fo_name === inspectingFO.fo_name && (r.working_place === inspectingFO.district || !inspectingFO.district));"

new_filter_line = """const foRecords = rawRecords.filter(r => {
          if (!r.fo_name || !inspectingFO || !inspectingFO.fo_name) return false;
          const matchName = r.fo_name.trim().toLowerCase() === inspectingFO.fo_name.trim().toLowerCase();
          if (!matchName) return false;
          if (!inspectingFO.district || inspectingFO.district === 'All') return true;
          return r.working_place && r.working_place.trim().toLowerCase() === inspectingFO.district.trim().toLowerCase();
        });"""

if old_filter_line in text:
    text = text.replace(old_filter_line, new_filter_line)
    print("foRecords filter updated to case-insensitive robust matcher")
else:
    print("old_filter_line not found")

# 2. Allow clicking on officer names from ANYWHERE (Progress Cards, Table, Leaderboard)
old_progress_h4 = """<h4 
                            onClick={() => selectedDistrict !== 'All' && setInspectingFO({ fo_name: row.name, district: selectedDistrict })}
                            className={`text-sm font-black text-slate-800 truncate max-w-[180px] ${selectedDistrict !== 'All' ? 'hover:text-indigo-600 hover:underline cursor-pointer' : ''}`}
                            title={selectedDistrict !== 'All' ? "Click to inspect all submitted IDs" : ""}
                          >
                            {row.name}
                          </h4>"""

new_progress_h4 = """<h4 
                            onClick={() => {
                              if (selectedDistrict !== 'All') {
                                setInspectingFO({ fo_name: row.name, district: selectedDistrict });
                              } else {
                                // If district card, filter to district; if officer, inspect
                                setSelectedDistrict(row.name);
                              }
                            }}
                            className="text-sm font-black text-slate-800 truncate max-w-[180px] hover:text-indigo-600 hover:underline cursor-pointer"
                            title="Click to inspect all submitted IDs or filter district"
                          >
                            {row.name}
                          </h4>"""

if old_progress_h4 in text:
    text = text.replace(old_progress_h4, new_progress_h4)
    print("progress card h4 updated")

with open("dfy-frontend/src/AdminDashboard.jsx", "w", encoding="utf-8") as f:
    f.write(text)
