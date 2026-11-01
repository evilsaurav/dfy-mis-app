# Staff HR Master Dossier, Digital ID Card & Frontline Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the official HR master dataset (387 employees) into `staff_directory`, provide Field Officers with a rich Digital ID Card with 1-tap download and self-editable contact/blood group, and grant Admins full dossier inspection and editing capabilities.

**Architecture:** Expand PostgreSQL `staff_directory` with nullable HR columns, run a 3-tier cascade auto-match seeding script from the Excel master file, implement secure FastAPI endpoints (`/fo/profile-dossier`, `/fo/update-profile-contact`, `/admin/staff/{id}/update-dossier`), and render an official DFY Lanyard ID Badge component in React with download/print capabilities and Admin dossier editing.

**Tech Stack:** Python 3.10+, FastAPI, PostgreSQL (Supabase), OpenPyXL, React 19, Vite 8, Tailwind CSS v4, HTML Canvas.

**Spec:** `docs/superpowers/specs/2026-11-01-staff-dossier-hr-master-and-digital-id-card-design.md`

## Global Constraints

- **Live Production Application:** Zero downtime, zero breaking changes to existing `pin`, `slug`, `district`, or attendance functions. All new schema columns must be `NULLABLE`.
- **Zero TDZ & Hook Order Violations:** No React hook or callback may reference state or props before lexical declaration.
- **Validation Strictness:** Phone must be validated to 10 digits; blood groups strictly constrained to `['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']`.
- **RBAC & District Isolation:** Sub-Admins may only edit staff assigned to their permitted districts.
- **User Approval Gate (Rule 5):** No git push to remote origin without explicit user testing and approval.

---

### Task 1: Database Schema Expansion (`staff_directory`)

**Files:**
- Modify: `backend/routers/staff.py` (or schema helper)
- Test: `tests/test_staff_dossier_and_id_card.py`

**Interfaces:**
- Produces: `staff_directory` columns: `emp_no`, `email`, `phone`, `blood_group`, `dob`, `date_joined`, `gender`, `marital_status`, `job_title`, `reporting_to`, `reporting_manager_emp_no`, `location`, `emergency_contact`.

- [ ] **Step 1: Write test verifying schema alterations**
  Write a test in `tests/test_staff_dossier_and_id_card.py` checking that the expanded columns exist on `staff_directory`.
- [ ] **Step 2: Execute DDL migration statements**
  Execute `ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS ...` for the 13 new columns and create indexes on `emp_no` and `phone`.
- [ ] **Step 3: Run test and verify exit code 0**
  Verify table structure and ensure existing baseline queries (`SELECT id, name, pin, district, is_active FROM staff_directory`) return successfully.
- [ ] **Step 4: Commit Task 1 changes**
  Commit locally: `feat(db): expand staff_directory schema with HR master dossier columns`.

---

### Task 2: Data Seeding & Cascade Matching Engine (`scripts/seed_staff_master_data.py`)

**Files:**
- Create: `scripts/seed_staff_master_data.py`
- Test: `tests/test_staff_dossier_and_id_card.py`

**Interfaces:**
- Consumes: Excel file at `C:\Users\Saurav\Downloads\All Employees Master Data - Doctors for you.xlsx` (or path argument).
- Produces: Normalized updates in `staff_directory` table with matched Employee ID, Blood Group, Phone, Email, Joining Date, Job Title, and Supervisor.

- [ ] **Step 1: Implement matching logic in `scripts/seed_staff_master_data.py`**
  Implement:
  - Clean name normalization (lowercase, stripped whitespace, removing honorifics).
  - Phone normalization (extracting last 10 digits).
  - Tier 1 (Exact Clean Name), Tier 2 (Phone match), Tier 3 (District + First Name match).
  - CLI argument `--dry-run` (default) vs `--execute`.
- [ ] **Step 2: Run dry-run and verify match statistics**
  Execute `python scripts/seed_staff_master_data.py --dry-run` and inspect matched vs unmatched records (> 80% match).
- [ ] **Step 3: Run execute mode to populate live database**
  Execute `python scripts/seed_staff_master_data.py --execute` and verify rows are updated in PostgreSQL.
- [ ] **Step 4: Add test verifying seeded data integrity**
  Add test asserting that key staff (e.g. Shailesh Kumar, Gunjan Kumar, Pankaj Kumar) have their `emp_no` and `blood_group` populated.
- [ ] **Step 5: Commit Task 2 changes**
  Commit locally: `feat(staff): implement 3-tier cascade matching and seed HR master data`.

---

### Task 3: Backend API Endpoints & RBAC Permissions

**Files:**
- Modify: `backend/routers/staff.py`
- Modify: `main.py` (if router registration needed)
- Test: `tests/test_staff_dossier_and_id_card.py`

**Interfaces:**
- Produces:
  - `GET /fo/profile-dossier?district=...&fo_name=...&pin=...`: Returns full staff record.
  - `PUT /fo/update-profile-contact`: Payload `{ district, fo_name, pin, phone, blood_group, emergency_contact }`.
  - `PUT /admin/staff/{staff_id}/update-dossier`: Payload with full HR fields, checked against JWT & RBAC.

- [ ] **Step 1: Write failing tests for endpoints**
  Test auth failure, validation errors (invalid phone, invalid blood group), FO self-update success, and Admin dossier update with audit logging.
- [ ] **Step 2: Implement `GET /fo/profile-dossier` endpoint**
  Verify PIN against `staff_directory` and return all dossier fields.
- [ ] **Step 3: Implement `PUT /fo/update-profile-contact` endpoint**
  Validate phone format, validate blood group against allowed set, update database, and invalidate profile cache.
- [ ] **Step 4: Implement `PUT /admin/staff/{staff_id}/update-dossier` endpoint**
  Check Sub-Admin district permission, update full dossier in `staff_directory`, log action to `admin_audit_logs`, and invalidate cache.
- [ ] **Step 5: Run tests and verify 100% pass**
  Run `pytest tests/test_staff_dossier_and_id_card.py -v`.
- [ ] **Step 6: Commit Task 3 changes**
  Commit locally: `feat(api): add FO profile dossier, contact self-update, and admin dossier update endpoints`.

---

### Task 4: Field Officer In-App Digital ID Card & Self-Edit Sheet

**Files:**
- Create: `dfy-frontend/src/components/Fo/FoDigitalIdCard.jsx`
- Modify: `dfy-frontend/src/App.jsx` (inside `MyProfileDashboard`)
- Test: Frontend build & lint

**Interfaces:**
- Consumes: Staff dossier from `/fo/profile-dossier`.
- Produces:
  - High-res digital ID card view with DFY logo, dummy passport photo box (35x45mm), employee code, blood group pill, supervisor, tenure.
  - Modal to self-edit phone & blood group.
  - Download / Print action to export a clean identity card.

- [ ] **Step 1: Create `FoDigitalIdCard.jsx` component**
  Design an authentic DFY Lanyard ID Badge:
  - Header with official circular Doctors For You emblem + "Bihar TB Elimination Program - PPSA Project".
  - 35x45mm portrait placeholder box with dashed border: "Affix Passport Photo here on print".
  - Employee ID badge (`EP00021`), Full Name, Official Job Title, District.
  - High-contrast emergency pill: 🩸 `Blood Group: O+`.
  - Supervisor line: 👤 `Reporting to: Pankaj Kumar`.
  - Service tenure badge: 🗓️ `Joined: DD Month YYYY`.
  - Direct Phone & Work Email.
- [ ] **Step 2: Add self-edit modal for FO**
  Slide-up modal allowing the FO to update their Mobile Phone and Blood Group directly.
- [ ] **Step 3: Add Download / Print ID Card capability**
  Provide a 1-click "📥 Download Official ID Card (.PNG / Print)" button rendering the card into a print-ready or downloadable image.
- [ ] **Step 4: Integrate into `MyProfileDashboard` in `App.jsx`**
  Mount `FoDigitalIdCard` prominently at the top of the FO Profile tab.
- [ ] **Step 5: Verify build & lint**
  Run `npm run build` and `npm run lint` in `dfy-frontend/`.
- [ ] **Step 6: Commit Task 4 changes**
  Commit locally: `feat(fo-app): add official digital ID card, self-edit modal, and download badge to profile`.

---

### Task 5: Admin Staff Dossier Modal in Admin Dashboard

**Files:**
- Create: `dfy-frontend/src/components/Admin/modals/StaffDossierModal.jsx`
- Modify: `dfy-frontend/src/components/Admin/AdminModals.jsx`
- Modify: `dfy-frontend/src/components/Admin/modals/StaffDirectoryModal.jsx` (or wherever staff rows are listed)
- Test: Frontend build & lint

**Interfaces:**
- Consumes: Staff item from staff list.
- Produces: Detailed dossier inspection and Super Admin / Sub-Admin edit form.

- [ ] **Step 1: Create `StaffDossierModal.jsx`**
  Create a tabbed or sectioned dossier view displaying all 14 HR attributes with an "✏️ Edit Details" toggle form.
- [ ] **Step 2: Connect Admin edit handler to `PUT /admin/staff/{id}/update-dossier`**
  Add submit handler that saves updates, shows success toast, and refreshes the staff directory list.
- [ ] **Step 3: Add "📋 Dossier" button on staff rows in Staff Directory**
  Wire clicking on a staff row to open `StaffDossierModal`.
- [ ] **Step 4: Verify build & lint**
  Run `npm run build` and `npm run lint` in `dfy-frontend/`.
- [ ] **Step 5: Commit Task 5 changes**
  Commit locally: `feat(admin): add staff dossier inspection and edit modal in admin dashboard`.

---

### Task 6: Full Verification Battery & Local Test Ready

**Files:**
- Verify: Full repository integrity
- Update: `CHANGELOG.md` & `dfy-frontend/src/changelogData.js`

- [ ] **Step 1: Run Python compilation check**
  `python -m py_compile main.py backend/routers/staff.py scripts/seed_staff_master_data.py`.
- [ ] **Step 2: Run automated test suite**
  `pytest tests/test_staff_dossier_and_id_card.py -v`.
- [ ] **Step 3: Run frontend build and linter**
  `npm --prefix dfy-frontend run build` and `npm --prefix dfy-frontend run lint`.
- [ ] **Step 4: Prepare local server for user verification**
  Ensure local backend and frontend serve the new Digital ID Card and Dossier features.
- [ ] **Step 5: Summary and presentation for user testing**
  Explain changes clearly in Hinglish and wait for user's explicit testing feedback before any remote push.
