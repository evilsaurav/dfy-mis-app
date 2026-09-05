# 🩺 Doctors For You (DFY) - TB Field MIS & Analytics System

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Python](https://img.shields.io/badge/Python_3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)

An enterprise-grade, offline-first **Management Information System (MIS)** and **Clinical Analytics Platform** built for **Doctors For You (DFY)** to monitor, evaluate, and accelerate Tuberculosis (TB) elimination operations across 22+ districts in Bihar, India.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
  - [1. Field Officer Mobile PWA](#1-field-officer-mobile-pwa)
  - [2. Executive Analytics & Reports Studio](#2-executive-analytics--reports-studio)
  - [3. Clinical Cascade & Patient Dropout Radar](#3-clinical-cascade--patient-dropout-radar)
  - [4. Cross-Officer Duplicate ID Radar](#4-cross-officer-duplicate-id-radar)
  - [5. Enterprise RBAC & Sub-Admin Isolation](#5-enterprise-rbac--sub-admin-isolation)
  - [6. Broadcast & Urgent Announcement System](#6-broadcast--urgent-announcement-system)
  - [7. Audit Trail Radar & Security Recovery](#7-audit-trail-radar--security-recovery)
- [Districts Covered](#-districts-covered)
- [Tech Stack](#-tech-stack)
- [Project Directory Structure](#-project-directory-structure)
- [API Endpoints Reference](#-api-endpoints-reference)
- [Installation & Local Setup](#-installation--local-setup)
- [Environment Variables](#-environment-variables)
- [Deployment Guide](#-deployment-guide)
- [License & Credits](#-license--credits)

---

## 🏗️ Overview & Architecture

The DFY TB MIS platform bridges ground-level field workers and central leadership in real time:

```mermaid
flowchart TD
    subgraph Ground_Level [Ground Operations]
        FO[Field Officers / Health Advocates] -->|PWA / Offline Queue| App[React Mobile PWA]
        App -->|Submit Daily Records & Patient IDs| Sync[Offline Sync Engine / API]
    end

    subgraph Backend_Cloud [FastAPI Cloud Core]
        Sync --> API[FastAPI Server]
        API --> DB[(Google Cloud Firestore)]
        API --> Audit[(Audit Logs & Radar)]
        API --> ExcelEngine[Pandas & OpenPyXL Reporting Engine]
    end

    subgraph Leadership_Portal [Leadership & MIS Operations]
        API --> SA[👑 Super Admin Dashboard]
        API --> SubA[🛡️ Sub-Admin District Portals]
        SA --> Broadcast[📢 Central Broadcast Studio]
        Broadcast -->|Targeted Alerts| App
        Broadcast -->|Targeted Alerts| SubA
    end
```

---

## 🚀 Key Features

### 1. 📱 Field Officer Mobile PWA
- **4-Digit PIN Security**: Zero-friction secure authentication per field officer with session auto-restore on refresh.
- **Offline-First Resilience**: Automatic queueing of submitted records via IndexedDB when network connectivity is weak or absent; auto-syncs to cloud when back online.
- **20+ Clinical & Programmatic Indicators**: Grouped into collapsible accordion workflows:
  - *Patient Registration* (Notifications, Presumptive TB, Contact Tracing)
  - *Diagnostics & Testing* (Sample Collection, Tested, Culture/DST for Buxar)
  - *Patient Support & Treatment* (HIV/DM Screened, DBT Accounts Linked, FDC Medicine Kits, Outcome Assigned)
  - *Advanced Care* (Differentiated TB Care, TPT Treatment Start, TPT Presumptive)
  - *Verification* (Aadhaar Face Authentication, Consent with ID, Doctor / Facility Visits)
- **1-Click WhatsApp Formatter**: Generates formatted, emoji-enriched daily progress text ready to paste directly into official WhatsApp monitoring groups.
- **Field Officer Profile Dashboard**: Individual target pacing, total KM travelled, days active, and past submission history lookup.

---

### 2. 📊 Executive Analytics & Reports Studio
- **State & District KPI Monitoring**: Live computation of Total Notifications, Target Achievement %, Total KM Travelled, DBT Linking %, and HIV/DM Screening %.
- **Live Activity Ticker**: Real-time ticker streaming recent field officer report submissions across the state.
- **Real-Time Attendance Radar**: Automatic comparison of staff directory against today's submissions to flag missing reports.
- **District Benchmark Comparator**: Statistical percentile and rank computation against state averages with visual performance bars.
- **5-in-1 Executive Reports Studio**:
  1. *State Master Consolidation (.xlsx)*: Comprehensive statewide roll-up.
  2. *District Drilldown Workbook (.xlsx)*: Detailed multi-tab workbooks with automated SUM/AVERAGE formulas.
  3. *Clinical Dropout Action Sheet (.xlsx)*: Prioritized patient dropout records for field intervention.
  4. *Single Officer Dossier (.xlsx)*: Complete monthly historical dossier for individual staff appraisals.
  5. *1-Click State ZIP Package*: Bundles all 22+ district workbooks into a single downloadable ZIP archive.
  6. *Executive WhatsApp Broadcast Brief*: Formatted summary with district rankings and key metrics.

---

### 3. 🚨 Clinical Cascade & Patient Dropout Radar
- **End-to-End Cascade Tracking**: Follows each registered patient ID through the diagnostic-to-treatment cascade (Notification -> HIV/DM Screening -> DBT Linking -> Treatment -> Outcome).
- **Automated Dropout Detection**: Highlights missing linkages per patient ID with severity levels (`CRITICAL`, `WARNING`, `INFO`).
- **Targeted Action Plans**: Field staff and supervisors receive specific patient IDs requiring immediate follow-up.

---

### 4. 🛡️ Cross-Officer Duplicate ID Radar
- **Statewide Nikshay ID Audit**: Detects duplicate patient IDs entered across different officers, dates, or districts.
- **Conflict Resolution**: Admins can inspect duplicate occurrences, view diff logs, and edit/correct typos directly.

---

### 5. 🔐 Enterprise RBAC & Sub-Admin Isolation
- **Role Hierarchy**:
  - `SUPER_ADMIN`: Statewide visibility and authority across all districts, user provisioning, global settings, target management, staff PIN directory, and statewide broadcast control.
  - `SUB_ADMIN`: District-isolated dashboard, reports, attendance, target setter, staff suite, and cascade alerts **strictly restricted to assigned districts** (`allowed_districts`).
- **Granular Permissions**:
  - `can_edit_targets`: Ability to modify monthly notification targets.
  - `can_manage_staff`: Ability to add/edit staff members and reset PINs.
  - `can_edit_patient_ids`: Authority to edit patient IDs in audit records.
  - `can_export_reports`: Permission to download Excel dossiers and state workbooks.

---

### 6. 📢 Broadcast & Urgent Announcement System
- **Central Broadcast Studio**: Compose and publish directives targeted to `ALL`, `FIELD_STAFF`, or `SUB_ADMINS`.
- **Urgent Modal Popup on Login**: `HIGH` priority broadcasts display an unmissable modal dialog on user login/open.
- **Persistent Notice Board**: Notices remain highlighted in top bulletin banners on both the Field App and Admin Dashboard until dismissed or deleted.
- **Instant Statewide Revocation**: Deleting a broadcast instantly removes it from all staff phones and admin screens.
- **Sub-Admin Scoping**: Sub-admins can only broadcast to and manage alerts for their permitted districts.

---

### 7. 📜 Audit Trail Radar & Security Recovery
- **Immutable Action Logging**: Every target change, patient ID edit, PIN reset, user modification, and broadcast is time-stamped with actor name, role, district, and diff details.
- **Zero-Budget Emergency Recovery**: Built-in master security key (`DFY-RESCUE-9921`) and PIN (`7788`) self-recovery mechanism for administrator credential resets.

---

## 📍 Districts Covered

The system supports active staff and reporting across **22+ Districts of Bihar**:

| Region | Districts Covered |
|---|---|
| **North Bihar** | Darbhanga, Madhubani, Muzaffarpur, Purba Champaran, Sheohar, Sitamarhi, Vaishali |
| **South Bihar** | Aurangabad-BI, Bhojpur, Buxar, Gaya, Jamui, Jehanabad, Kaimur, Nawada, Rohtas |
| **East & Central** | Begusarai, Khagaria, Lakhisarai, Munger, Samastipur, Sheikhpura |

---

## 💻 Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Visualizations**: [Recharts 3.10](https://recharts.org/)
- **PWA Support**: Web Manifest, Offline Caching & IndexedDB sync

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Server**: [Uvicorn](https://www.uvicorn.org/) (ASGI)
- **Data Processing**: [Pandas](https://pandas.pydata.org/)
- **Excel Engineering**: [OpenPyXL](https://openpyxl.readthedocs.io/)
- **Validation**: [Pydantic v2](https://docs.pydantic.dev/)

### Database & Cloud
- **Primary Store**: [Google Cloud Firestore](https://firebase.google.com/docs/firestore)
- **Hosting / Deployments**: [Render](https://render.com/) (API Web Service), Netlify / Vercel (Frontend)

---

## 📂 Project Directory Structure

```
Mis field report/
├── main.py                     # FastAPI Backend: APIs, RBAC, Firebase, Excel exports & Audits
├── requirements.txt            # Python dependencies
├── staff_master.csv            # Master staff directory & district assignments
├── firebase_key.json           # Firebase Admin Service Account credentials (git-ignored)
├── generate_templates.py       # Helper scripts for Excel template generation
├── templates/                  # Excel KPI report templates & assets
│
└── dfy-frontend/               # React 19 + Vite Frontend Application
    ├── index.html              # App entry HTML with PWA meta tags
    ├── package.json            # Node dependencies and build scripts
    ├── vite.config.js          # Vite build configuration & server proxy
    ├── public/
    │   ├── manifest.json       # Progressive Web App (PWA) manifest
    │   └── favicon.svg         # DFY brand icon
    └── src/
        ├── App.jsx             # Field Officer Mobile PWA: Data entry, offline queue, alerts
        ├── AdminDashboard.jsx  # Central Admin & Sub-Admin Analytics Dashboard
        ├── main.jsx            # React root mount point & Router
        └── index.css           # Tailwind CSS imports & animations
```

---

## 🔌 API Endpoints Reference

### 1. Field Reporting & Staff Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/verify-pin` | Verify 4-digit staff PIN against master directory |
| `POST` | `/submit-report` | Submit daily clinical indicator report & patient IDs |
| `POST` | `/check-today-status` | Check if officer has submitted a report today |
| `POST` | `/my-profile-stats` | Fetch officer-specific monthly summary & history |

### 2. Admin Analytics & RBAC
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/login` | Admin & Sub-Admin credentials login with RBAC permissions |
| `POST` | `/admin/dashboard-data` | Filtered analytics data, KPIs, leaderboard & target pacing |
| `GET` | `/admin/attendance/live` | Live field staff attendance radar (submitted vs missing) |
| `GET` | `/admin/users/list` | Super Admin: List all Admin and Sub-Admin accounts |
| `POST` | `/admin/users/create` | Super Admin: Provision new Sub-Admin user with permitted districts |
| `POST` | `/admin/users/update` | Super Admin: Update user permissions and assigned districts |
| `POST` | `/admin/emergency-reset` | Emergency master key / PIN password reset |

### 3. Target Management & Staff Suite
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/get-targets` | Fetch monthly targets (filtered by permitted districts) |
| `POST` | `/set-targets` | Update monthly targets with audit trail logging |
| `GET` | `/admin/staff/list` | Fetch active staff list with PINs and designations |
| `POST` | `/admin/staff/update-pin` | Reset staff member PIN |
| `GET` | `/admin/staff/export-pins` | Export master PIN directory to Excel (`.xlsx`) |

### 4. Cascade Alerts & Duplicate Radar
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/reports/cascade-alerts` | Fetch clinical cascade dropouts and patient dropout alerts |
| `GET` | `/admin/export-cascade-alerts` | Export clinical cascade dropout action sheet (`.xlsx`) |
| `GET` | `/api/duplicate-audit` | Scan and report duplicate patient IDs across officers |
| `POST` | `/api/edit-record-id` | Correct / replace patient ID with audit trail record |

### 5. Broadcasts & Announcements
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/broadcasts/create` | Create targeted broadcast notice with RBAC validation |
| `GET` | `/api/broadcasts/active` | Get active broadcasts filtered by district & role |
| `GET` | `/api/broadcasts/all` | List all broadcasts in Central Broadcast Studio |
| `POST` | `/api/broadcasts/delete` | Deactivate/delete broadcast notice across all portals |

### 6. Excel Report Studio Exports
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/export-state-summary` | Download Statewide Executive Consolidation (`.xlsx`) |
| `GET` | `/download-district-kpi` | Download District-specific drilldown workbook (`.xlsx`) |
| `GET` | `/download-all-kpi-workbooks` | Download 1-Click State ZIP Package containing all districts |
| `GET` | `/admin/export-fo-dossier` | Download Single Officer Performance Dossier (`.xlsx`) |

---

## 🛠️ Installation & Local Setup

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- Google Cloud Firebase project with Firestore enabled

### 1. Clone the Repository
```bash
git clone https://github.com/evilsaurav/dfy-mis-app.git
cd dfy-mis-app
```

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run FastAPI backend server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Backend will be live at `http://localhost:8000` with Swagger docs at `http://localhost:8000/docs`.

### 3. Frontend Setup
```bash
cd dfy-frontend

# Install dependencies
npm install

# Run Vite development server
npm run dev
```
Frontend will be live at `http://localhost:5173`.

---

## ⚙️ Environment Variables

### Frontend (`dfy-frontend/.env`)
```env
VITE_API_URL=http://localhost:8000
```
*(For production, set `VITE_API_URL` to your live backend domain, e.g., `https://dfy-mis-app.onrender.com`)*

### Backend
Place your Firebase Service Account JSON credentials file as `firebase_key.json` in the root directory, or configure Firebase Admin SDK environment variables.

---

## 🚢 Deployment Guide

### Backend (Render.com)
1. Create a **Web Service** on Render pointing to your GitHub repository.
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add your Firebase secret key under Environment variables.

### Frontend (Netlify / Vercel)
1. Link your GitHub repository.
2. Base Directory: `dfy-frontend`
3. Build Command: `npm run build`
4. Publish Directory: `dist`
5. Environment Variable: `VITE_API_URL=https://<your-backend-render-app>.onrender.com`

---

## 📜 License & Credits

Developed with ❤️ for **Doctors For You (DFY)** Bihar TB Elimination Program.
Designed and architected by **Insomniac**.

For queries, bug reports, or feature enhancements, please open an issue in the [GitHub repository](https://github.com/evilsaurav/dfy-mis-app).
