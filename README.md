# 🩺 Doctors For You (DFY) - TB Field MIS & Analytics System

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Firebase Firestore](https://img.shields.io/badge/Firebase_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Python](https://img.shields.io/badge/Python_3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![PWA Offline](https://img.shields.io/badge/PWA-100%25_Offline_First-success?style=for-the-badge&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

An enterprise-grade, offline-first **Management Information System (MIS)** and **Clinical Analytics Platform** built for **Doctors For You (DFY)** to monitor, evaluate, and accelerate Tuberculosis (TB) elimination operations across 22+ districts in Bihar, India.

---

## 📚 Enterprise Technical Documentation

For in-depth architectural blueprints, UI/UX design systems, and data processing specifications, refer to our dedicated documentation guides:
- 🏗️ **[System Architecture Specification (ARCHITECTURE.md)](ARCHITECTURE.md)**: Cloud-native distributed topology, 100% offline PIN authentication vault, Render 512MB RAM concurrency hardening, atomic district rollups (95% read cut), in-memory TTL caching, and deployment runbooks.
- 🎨 **[UI/UX Design System Specification (DESIGN.md)](DESIGN.md)**: Visual identity, color tokens, continuous live activity marquee ticker, dual officer peer comparator, traffic-light status badging, offline queue indicators, and delete day safety modal.
- 🔄 **[Data Processing & Feature Pipeline (DATA_PROCESSING.md)](DATA_PROCESSING.md)**: End-to-end data lifecycle, offline IndexedDB sync, working-days dynamic engine, velocity formulas, patient deduplication algorithms, 30-day auto-pruned audit engine, and complete 22-indicator catalog.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
  - [1. 100% Offline-First Field Officer Mobile PWA](#1-100-offline-first-field-officer-mobile-pwa)
  - [2. Executive Analytics & Reports Studio](#2-executive-analytics--reports-studio)
  - [3. Clinical Cascade & Patient Dropout Radar](#3-clinical-cascade--patient-dropout-radar)
  - [4. Cross-Officer Duplicate ID Radar](#4-cross-officer-duplicate-id-radar)
  - [5. Enterprise RBAC & Single-Day Report Deletion](#5-enterprise-rbac--single-day-report-deletion)
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
    subgraph Ground_Level [Ground Operations - 100% Offline Ready]
        FO[Field Officers / Health Advocates] -->|PWA / Offline Vault| App[React Mobile PWA]
        App -->|Encrypted PIN Vault & IndexedDB Queue| LocalStore[(Local Device Storage)]
        LocalStore -->|Auto-Sync on Network Reconnection| Sync[Background Sync Engine]
    end

    subgraph Backend_Cloud [FastAPI Cloud Core - Render]
        Sync --> API[FastAPI Server]
        API --> Rollups[(daily_district_rollups - 95% Read Cut)]
        API --> DB[(Google Cloud Firestore)]
        API --> Audit[(Audit Logs & Radar)]
        API --> ExcelEngine[Pandas & OpenPyXL Reporting Engine]
    end

    subgraph Leadership_Portal [Leadership & MIS Operations]
        API --> SA[👑 Super Admin Dashboard]
        API --> SubA[🛡️ Sub-Admin District Portals]
        SA --> ForceRef[🔄 Live Force-Refresh Engine]
        SA --> DelReport[🗑️ Atomic Day Report Deletion]
        SA --> Broadcast[📢 Central Broadcast Studio]
        Broadcast -->|Targeted Alerts| App
        Broadcast -->|Targeted Alerts| SubA
    end
```

---

## 🚀 Key Features

### 1. 📱 100% Offline-First Field Officer Mobile PWA
- **Encrypted Local PIN Vault (`dfy_pin_vault`)**:
  - Salting and SHA-256 Web Crypto hashing store credentials locally.
  - FO can log in and verify their PIN anywhere in remote rural areas with **zero internet connection**.
- **Automatic Morning Date Rollover**:
  - Automatically updates session dates to `today` when workers wake up or enter remote field zones without logging out, eliminating morning authentication lockout.
- **Emergency Field Duty Mode**:
  - If a health worker uses a replacement phone or cleared browser cache deep in a zero-network village, valid 4-digit PINs activate Emergency Duty Mode, ensuring TB patient registrations are never blocked.
- **IndexedDB Offline Queue & Reactive Auto-Sync**:
  - Reports submitted offline are stored safely in IndexedDB (`DFY_MIS_OFFLINE_DB`).
  - Auto-sync triggers seamlessly on app launch or the instant network connectivity is restored.
- **Live Visual Network Indicators**:
  - Top header displays `📴 Offline` when disconnected and `Sync (N)` when reports are pending in queue.
  - Interactive PIN feedback: `Verifying PIN...`, `✓ Offline PIN Verified`, or `✕ Sahi 4-digit PIN darj karein`.
- **20+ Clinical Indicators**:
  - Grouped into collapsible accordion workflows (Notifications, HIV/DM, DBT, Sample Collection, Tested, Culture/DST, Contact Tracing, FDC Medicine Kits, Aadhaar Face Auth, Doctor Visits).
- **1-Click WhatsApp Formatter**: Formats daily metrics into emoji-enriched text ready for official monitoring groups.

---

### 2. 📊 Executive Analytics & Reports Studio
- **Strict Staff Directory Alignment**:
  - The dashboard pacing matrix binds strictly to official staff directory records (`staffDirectory`).
  - String sanitization and canonical district mapping eliminate duplicate or phantom staff rows.
- **Live Force-Refresh Engine (`force_refresh: true`)**:
  - Header green "Refresh" button purges in-memory RAM cache prefixes and disk snapshots, streaming fresh data directly from Firestore.
- **Atomic District Rollups (`daily_district_rollups`)**:
  - Slashes daily Firestore read operations by **95%** using atomic increments for metric counters.
- **Real-Time Attendance Radar**: Matches directory rosters against today's submissions to immediately highlight missing reports.
- **Head-to-Head Peer Comparator**: Dual officer comparative cards with velocity metrics and 1-click bilingual coaching memos.
- **5-in-1 Executive Export Studio**:
  1. *State Master Consolidation (.xlsx)*
  2. *District Drilldown Workbook (.xlsx)*
  3. *Clinical Dropout Action Sheet (.xlsx)*
  4. *Single Officer Performance Dossier (.xlsx)*
  5. *1-Click State ZIP Package*

---

### 3. 🚨 Clinical Cascade & Patient Dropout Radar
- **End-to-End Cascade Tracking**: Follows each registered patient ID through the clinical funnel:
  $$\text{Notification} \longrightarrow \text{HIV/DM Screening} \longrightarrow \text{DBT Account Linking} \longrightarrow \text{Treatment Outcome}$$
- **Automated Dropout Detection**: Highlights missing clinical linkages per patient ID with severity levels (`CRITICAL`, `WARNING`, `ON TRACK`).

---

### 4. 🛡️ Cross-Officer Duplicate ID Radar
- **Statewide Nikshay ID Audit**: Scans for duplicate patient IDs entered across different officers, dates, or districts.
- **Conflict Resolution & Correction**: Admins can inspect duplicate occurrences, view diff logs, and correct typos with full audit logging.

---

### 5. 🔐 Enterprise RBAC & Single-Day Report Deletion
- **Role Hierarchy**:
  - `SUPER_ADMIN`: Statewide visibility across all 22+ districts, user provisioning, global settings, target management, staff PIN directory, report deletion across all districts, and statewide broadcast control.
  - `SUB_ADMIN`: District-isolated dashboard, reports, attendance, and cascade alerts strictly restricted to assigned districts (`allowed_districts`).
- **Atomic Staff Day Report Deletion (`POST /admin/reports/delete-day`)**:
  - Administrators can delete erroneous single-day reports for any field officer.
  - Enforces Sub-Admin RBAC guards (rejects deletions outside assigned districts).
  - Automatically rolls back rollup counters (`notifications`, `tests`, etc.), removes officer from `submitted_fos`, purges caches, and writes an immutable audit record.
  - Features a high-stakes safety confirmation dialog in the UI.

---

### 6. 📢 Broadcast & Urgent Announcement System
- **Central Broadcast Studio**: Publish directives targeted to `ALL`, `FIELD_STAFF`, or `SUB_ADMINS`.
- **Urgent Modal Popup on Login**: `HIGH` priority broadcasts display an unmissable modal dialog on user login/open.
- **Persistent Notice Board**: Notices remain highlighted in top bulletin banners on both the Field App and Admin Dashboard until dismissed.

---

### 7. 📜 Audit Trail Radar & Security Recovery
- **Immutable Action Logging**: Every target change, patient ID edit, PIN reset, day report deletion, and broadcast is logged with actor name, role, district, and diff details.
- **Automated 30-Day Retention**: Background engine prunes expired audit records in batches, maintaining compliance and preventing database bloat.
- **Zero-Budget Emergency Recovery**: Master security key (`DFY-RESCUE-9921`) and PIN (`7788`) self-recovery mechanism for administrator credential resets.

---

## 📍 Districts Covered

The system supports active staff and reporting across **22+ Districts of Bihar**:

| Region | Districts Covered |
|---|---|
| **North Bihar** | Darbhanga, Madhubani, Muzaffarpur, Purba Champaran (East Champaran), Sheohar, Sitamarhi, Vaishali |
| **South Bihar** | Aurangabad, Bhojpur, Buxar, Gaya, Jamui, Jehanabad, Kaimur, Nawada, Rohtas |
| **East & Central** | Begusarai, Khagaria, Lakhisarai, Munger, Samastipur, Sheikhpura |

---

## 💻 Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Routing**: [React Router v7](https://reactrouter.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Visualizations**: [Recharts 3.10](https://recharts.org/)
- **Offline Storage**: IndexedDB (`DFY_MIS_OFFLINE_DB`) + `localStorage` Web Crypto Vault
- **PWA**: Service Worker caching via `vite-plugin-pwa`

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.10+)
- **Server**: [Uvicorn](https://www.uvicorn.org/) (ASGI)
- **Data Processing**: [Pandas](https://pandas.pydata.org/)
- **Excel Engineering**: [OpenPyXL](https://openpyxl.readthedocs.io/)
- **Validation**: [Pydantic v2](https://docs.pydantic.dev/)

### Database & Cloud
- **Primary Store**: [Google Cloud Firestore](https://firebase.google.com/docs/firestore)
- **Hosting / Deployments**: [Render](https://render.com/) (API Web Service), Vercel / Netlify (Frontend)

---

## 📂 Project Directory Structure

```
Mis field report/
├── main.py                     # FastAPI Backend: APIs, RBAC, Firebase, Excel exports, Audits & Rollups
├── requirements.txt            # Python dependencies
├── staff_master.csv            # Master staff directory & district assignments
├── firebase_key.json           # Firebase Admin Service Account credentials (git-ignored)
├── generate_templates.py       # Helper scripts for Excel template generation
├── templates/                  # Excel KPI report templates & assets
│
└── dfy-frontend/               # React 19 + Vite Frontend Application
    ├── index.html              # App entry HTML with PWA meta tags
    ├── package.json            # Node dependencies and build scripts
    ├── vite.config.js          # Vite build configuration & PWA setup
    ├── public/
    │   ├── manifest.json       # Progressive Web App (PWA) manifest
    │   └── favicon.svg         # DFY brand icon
    └── src/
        ├── App.jsx             # Field Officer Mobile PWA: 100% offline PIN, queue, alerts, forms
        ├── AdminDashboard.jsx  # Central Admin & Sub-Admin Analytics Dashboard
        ├── offlineQueue.js     # IndexedDB offline storage & auto-sync engine
        ├── staff_directory.json # Master local baseline staff directory
        ├── main.jsx            # React root mount point & Router
        └── index.css           # Tailwind CSS imports & animations
```

---

## 🔌 API Endpoints Reference

### 1. Field Reporting & Staff Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/verify-pin` | Verify 4-digit staff PIN against master directory |
| `POST` | `/submit-daily-report` | Submit daily clinical report & patient IDs (idempotent, rollups) |
| `POST` | `/check-today-status` | Check if officer has submitted a report today |
| `POST` | `/my-profile-stats` | Fetch officer-specific monthly summary & history |

### 2. Admin Analytics, RBAC & Report Management
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/admin/login` | Admin & Sub-Admin credentials login with RBAC permissions |
| `POST` | `/admin/dashboard-data` | Filtered analytics data, KPIs, leaderboard & target pacing (`force_refresh` support) |
| `POST` | `/admin/reports/delete-day` | **New**: Delete an officer's single-day report with atomic rollup rollback & RBAC |
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
| `GET` | `/staff-directory` | Fetch normalized master staff directory |
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
Place your Firebase Service Account JSON credentials file as `firebase_key.json` in the root directory, or configure `FIREBASE_CREDENTIALS` environment variable.

---

## 🚢 Deployment Guide

### Backend (Render.com)
1. Create a **Web Service** on Render pointing to your GitHub repository.
2. Build Command: `pip install -r requirements.txt`
3. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add your Firebase secret key and JWT secret key under Environment variables.

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
