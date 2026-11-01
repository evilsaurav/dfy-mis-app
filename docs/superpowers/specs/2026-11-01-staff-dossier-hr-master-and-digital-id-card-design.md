# Staff HR Master Dossier, Digital ID Card & Frontline Identity Specification

> **Version:** 1.0.0  
> **Date:** 2026-11-01  
> **Status:** Draft - Ready for Review  
> **Target Subsystems:** Database (`staff_directory`), Admin Portal (`AdminDashboard.jsx`), Field Officer App (`MyProfileDashboard.jsx`), Backend APIs (`backend/routers/staff.py`)

---

## 1. Executive Summary & Problem Context

Currently, the Doctors For You (DFY) TB Field MIS represents field staff with minimal baseline attributes:
* `name` (e.g. "Shailesh Kumar")
* `district` (e.g. "Buxar")
* `designation` (e.g. "FC" or "TC")
* `pin` (4-digit offline authentication credential)

However, Doctors For You manages an extensive, official HR record for all project personnel in **`All Employees Master Data - Doctors for you.xlsx`** (387 personnel operating under the **DFY - PPSA Bihar Project**). 

### Key Deficiencies in Current State:
1. **Lack of Frontline Official Identity:** Field Officers (FOs) visiting remote villages, Gram Panchayats, private clinics, and government PHCs/DTCs lack a formal in-app digital identity card certifying their affiliation with DFY and the National TB Elimination Program (NTEP/PPSA).
2. **Medical Emergency Vulnerability:** Field Officers travel 50–80 km daily on motorcycles across rural Bihar. In case of road accidents or sudden illness, crucial health details like **Blood Group** and **Direct Supervisor Contact** are not accessible in their mobile app.
3. **Supervisor & Administrative Disconnect:** Personnel rosters do not reflect organizational hierarchy (`Reporting To`, `Manager Employee Number`, official `Job Title`, `Date Joined`).
4. **Static Excel Dependency:** HR and district coordinators continually refer back to disconnected offline spreadsheets for employee IDs, phone numbers, and joining dates.

---

## 2. Source Data Audit & Baseline Alignment

An analysis of `C:\Users\Saurav\Downloads\All Employees Master Data - Doctors for you.xlsx` reveals:
* **Total Employees:** 387 records, 100% assigned to `Department: DFY - PPSA Bihar Project`.
* **Current App Active Staff:** 177 staff entries in `staff_directory`.
* **Direct Match Rate:** **145 out of 177 staff (81.9%)** match existing database records via exact or token-based name matching. The remaining ~32 staff match via 10-digit mobile number normalization.

### Core Attributes Extracted from Excel:
| Field Name in Excel | Proposed PostgreSQL Column | Description / Example |
| :--- | :--- | :--- |
| `Employee Number` | `emp_no` (TEXT/VARCHAR) | Official DFY Employee Code (`EP00021`, `EP00041`) |
| `Full Name` | `name` (TEXT) | Employee Legal Full Name |
| `Work Email` | `email` (TEXT) | Registered Email Address |
| `Mobile Phone` | `phone` (TEXT) | 10-digit contact number (`91-8540820025` -> `8540820025`) |
| `Date Of Birth` | `dob` (DATE) | Date of birth (`1999-08-25`) |
| `Date Joined` | `date_joined` (DATE) | Official organization joining date (`2018-03-10`) |
| `Blood Group` | `blood_group` (VARCHAR) | Emergency blood group (`O+`, `AB+`, `B+`) |
| `Gender` | `gender` (VARCHAR) | Gender (`Male`, `Female`) |
| `Marital Status` | `marital_status` (VARCHAR) | Status (`Single`, `Married`) |
| `Job Title` | `job_title` (TEXT) | Full official designation (`Community Health Resource`, `Field Coordinator`) |
| `Reporting To` | `reporting_to` (TEXT) | Direct Supervisor Name (`Pankaj Kumar`) |
| `Reporting Manager Emp No` | `reporting_manager_emp_no` (VARCHAR) | Supervisor Employee ID (`EP00041`) |
| `Location` | `location` (TEXT) | District / HQ base (`Buxar`, `Sasaram`, `Patna`) |
| `Employment Status` | `employment_status` (VARCHAR) | `Active`, `Resigned`, etc. |

---

## 3. Architecture & Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│  All Employees Master Data (.xlsx)                           │
│  (387 Personnel • DFY PPSA Bihar Project)                    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼ 1-Time Safe Migration Script
┌──────────────────────────────────────────────────────────────┐
│  PostgreSQL Table: staff_directory                           │
│  - emp_no, email, phone, blood_group, dob, date_joined       │
│  - job_title, reporting_to, reporting_manager_emp_no         │
│  - gender, marital_status, location                          │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌──────────────────────────────┐
│ Admin Dashboard             │ │ Field Officer App (PWA)      │
│ - Staff Directory List      │ │ - MyProfileDashboard.jsx     │
│ - View Full Dossier Modal   │ │ - Official Digital ID Badge  │
│ - Super/Sub-Admin Edit Form │ │ - Download Lanyard ID (.PNG) │
│ - Invalidate Staff Cache    │ │ - Self-Edit Contact/Blood Grp│
└─────────────────────────────┘ └──────────────────────────────┘
```

---

## 4. Subsystem Details & Technical Specifications

### 4.1 Database Layer: Schema Expansion (`staff_directory`)
We expand `staff_directory` in PostgreSQL with nullable columns. This guarantees that existing queries (`id, district, name, pin, is_active`) continue running with zero breaking changes:

```sql
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS emp_no VARCHAR(32);
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS phone VARCHAR(24);
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS blood_group VARCHAR(16);
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS date_joined DATE;
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS gender VARCHAR(16);
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS marital_status VARCHAR(24);
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS reporting_to TEXT;
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS reporting_manager_emp_no VARCHAR(32);
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE staff_directory ADD COLUMN IF NOT EXISTS emergency_contact TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_directory_emp_no ON staff_directory(emp_no);
CREATE INDEX IF NOT EXISTS idx_staff_directory_phone ON staff_directory(phone);
```

### 4.2 Data Ingestion & Seeding Engine (`scripts/seed_staff_master_data.py`)
A dedicated Python migration script reads the Excel master file and executes a 3-tier cascade match:
1. **Tier 1 (Exact Clean Name Match):** Strips spaces, normalizes case, ignores periods/honorifics (`Mr.`, `Md.`).
2. **Tier 2 (Phone Number Match):** Normalizes phone number to 10 digits (`re.sub(r'\D', '', phone)[-10:]`).
3. **Tier 3 (District + Token Match):** Matches on district canonicalization + first/last name overlap.

**Safety Guarantee:**
- Script runs in **Dry-Run Mode** first, outputting exact matches and unmatched records.
- Updates existing `staff_directory` rows by `id` using parameterized SQL.
- If an active employee exists in Excel but not in `staff_directory`, the script offers to create them with a default secure PIN (`1234`) or mark for admin review.

### 4.3 Backend APIs (`backend/routers/staff.py`)

#### 1. `GET /fo/profile-dossier`
- **Caller:** Field Officer PWA (`MyProfileDashboard.jsx`).
- **Auth:** Working Place, FO Name, and PIN verification.
- **Returns:** Full employee dossier (Employee No, Blood Group, Joining Date, Phone, Email, Supervisor, Emergency Contact).

#### 2. `PUT /fo/update-profile-contact`
- **Caller:** Field Officer PWA.
- **Allowed Fields:** `phone`, `blood_group`, `emergency_contact`.
- **Validation:** 
  - Phone must be exactly 10 digits.
  - Blood group must match standard ABO/Rh: `['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']`.
- **Cache Eviction:** Evicts `staff_profile_{district}_{fo_name}` and updates memory cache.

#### 3. `PUT /admin/staff/{staff_id}/update-dossier`
- **Caller:** Central Admin / Sub-Admin.
- **RBAC:** Requires valid JWT. Sub-Admins restricted to their assigned districts.
- **Allowed Fields:** All dossier fields (`emp_no`, `job_title`, `reporting_to`, `date_joined`, `blood_group`, `phone`, `email`, `location`, `is_active`, `pin`).
- **Audit:** Records `STAFF_DOSSIER_UPDATED` entry in `admin_audit_logs`.

---

## 5. Frontend User Experience Design

### 5.1 Field Officer Mobile Experience (`MyProfileDashboard.jsx`)

#### A. Digital Identity Badge (In-App View)
At the top of the Profile tab, an **Official DFY Identity Card** is rendered with:
* **Header:** Official Doctors For You emblem + "Bihar TB Elimination Program (PPSA)".
* **Photo Placeholder:** A standard 35×45mm vertical portrait frame with a subtle camera icon and dashed border ("Affix Passport Photo on Print").
* **Staff Credentials:**
  - Name: Large bold headline (e.g. `Shailesh Kumar`)
  - Employee Code Badge: Monospace capsule `EP00021`
  - Designation & District: `Community Health Resource • Buxar District`
  - Blood Group Emergency Pill: 🩸 `Blood Group: O+` (High-contrast red/amber pill)
  - Supervisor: 👤 `Reporting to: Pankaj Kumar`
  - Service Milestone: 🗓️ `Joined: 10 March 2018 (6y 8m of Service)`
  - Direct Phone: 📞 `+91 8540820025`

#### B. Quick Actions on Profile Card:
1. **✏️ Edit Contact / Blood Group:** Opens a clean slide-up sheet allowing the FO to update their personal phone number or blood group without needing admin intervention.
2. **📥 Download Official ID Card:** Generates a high-resolution, print-ready digital identity badge (front & back lanyard format) using native canvas/print layout.

### 5.2 Admin Dashboard Experience (`AdminDashboard.jsx`)
In the existing **Staff Directory & PIN Management** modal:
* Next to each staff member's row, a **"📋 Dossier"** button opens the full employee profile modal.
* Displays all 14 HR attributes cleanly organized into tabs:
  - **Identity:** Employee No, Blood Group, DOB, Gender, Marital Status
  - **Work & Hierarchy:** Job Title, Department, Date Joined, Reporting Manager
  - **Contact & Location:** Mobile, Work Email, District/Location
* An **"✏️ Edit Dossier"** button allows Super Admins and authorized Sub-Admins to edit any attribute and instantly sync it to the live database.

---

## 6. Implementation Phasing Strategy

```
Phase 1: DB Migration & Ingestion Script
├── PostgreSQL Schema update (ALTER TABLE staff_directory)
└── Run seed_staff_master_data.py with dry-run audit

Phase 2: Backend API Endpoints & RBAC
├── GET /fo/profile-dossier & PUT /fo/update-profile-contact
├── PUT /admin/staff/{id}/update-dossier with audit logging
└── Automated Pytest battery verification

Phase 3: Frontline UI & Digital ID Card
├── FoDigitalIdCard.jsx component inside MyProfileDashboard
├── Downloadable Lanyard ID Card generator (Canvas/CSS Print)
└── FO Self-edit modal for Blood Group & Mobile

Phase 4: Admin Dossier Management
├── StaffDossierModal.jsx inside AdminDashboard.jsx
└── Local build and comprehensive regression battery
```

---

## 7. Verification & Safety Protocol

1. **Non-Destructive Guarantee:** All new database fields are nullable; existing authentication (`pin`, `slug`, `district`) remains 100% operational.
2. **Zero Mobile Lag:** Dossier data is cached on device using IndexedDB and React state, with zero overhead on report submission paths.
3. **Emergency Blood Group Protection:** Restricted to valid clinical blood groups (`A+`, `B+`, `AB+`, `O+`, `A-`, `B-`, `AB-`, `O-`).
4. **Full Test Battery:** Must pass backend pytest (`py_compile`, auth, RBAC), frontend `npm run build`, and `npm run lint` before local testing.
