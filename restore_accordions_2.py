import os

with open("old_app.jsx", "r", encoding="utf-16le") as f:
    old_text = f.read()

# Extract Accordions correctly
g1_start = old_text.find('<Accordion title="1. Patient Registration"')
g1_end = old_text.find('</Accordion>', g1_start) + 12
g1 = old_text[g1_start:g1_end]

g2_start = old_text.find('<Accordion title="2. Diagnostics & Testing"')
g2_end = old_text.find('</Accordion>', g2_start) + 12
g2 = old_text[g2_start:g2_end]

g3_start = old_text.find('<Accordion title="3. Field Work & Visits"')
g3_end = old_text.find('</Accordion>', g3_start) + 12
g3 = old_text[g3_start:g3_end]

g4_start = old_text.find('<Accordion title="4. Logistics & Outcomes"')
g4_end = old_text.find('</Accordion>', g4_start) + 12
g4 = old_text[g4_start:g4_end]

g5_start = old_text.find('<Accordion title="5. Special Tracking"')
g5_end = old_text.find('</Accordion>', g5_start) + 12
g5 = old_text[g5_start:g5_end]

g6_start = old_text.find('<Accordion title="6. Additional Remarks"')
g6_end = old_text.find('</Accordion>', g6_start) + 12
g6 = old_text[g6_start:g6_end]

accordions = f"""
                {g1}
                {g2}
                {g3}
                {g4}
                {g5}
                {g6}
"""

with open("dfy-frontend/src/App.jsx", "r", encoding="utf-8") as f:
    new_text = f.read()

# Insert before Doctor visits
doc_start = new_text.find('{/* Travel & Doctors Section */}')
if doc_start != -1:
    new_text = new_text[:doc_start] + accordions + '\n              ' + new_text[doc_start:]

with open("dfy-frontend/src/App.jsx", "w", encoding="utf-8") as f:
    f.write(new_text)

