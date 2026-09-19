// changelogData.js - Application Release Notes & Update History
// High-performance client-side release log (Zero backend / Firestore load)

export const APP_VERSION = "2.7.0";
export const LAST_UPDATED_DATE = "19 Sep 2026";

export const CHANGELOG_ENTRIES = [
  {
    version: "v2.7.0",
    date: "19 Sep 2026",
    title: "Daily Notification Multi-District Tray Filter, FO Bottom Nav Dock, Patient Journey Tracker & Visual Help Guide",
    badge: "Latest Release",
    badgeColor: "emerald",
    highlights: [
      "🎯 Multi-District Notification Tray Filter: Flexible district selection in Modal 0A supporting All Districts, single district, or multi-district custom chip decks with live instant search.",
      "📱 FO Modern Bottom Nav Dock: Redesigned FO mobile interface with a fixed 4-tab bottom navigation dock (Report, Tracker, Profile, Guide) eliminating top header clutter.",
      "🔍 Live Patient Journey & Nikshay Reconciler Sync: FO lookup for 8/9-digit Nikshay IDs showing verified Reconciler ledger status (DBT, HIV/DM, UDST, Contact Tracing) and visit timeline.",
      "📖 Interactive Visual Help & Guide: 4-stage system flowchart graph explaining the end-to-end DFY TB MIS architecture, alongside NTEP Adult & Pediatric FDC dosage charts and 24-hr self-correction rules.",
      "🛡️ Sub-Admin District Guard & Zero-Overlap UI: Strict RBAC isolation ensuring Sub-Admins only filter allowed districts, and sticky submit bar repositioned above bottom nav dock."
    ],
    details: [
      {
        tag: "Admin Dashboard",
        color: "amber",
        text: "Multi-District Verification Tray: Added chip-based multi-district selection in Modal 0A with Select All and Clear controls, allowing State Admins and Sub-Admins to verify notification IDs across multiple districts in one view."
      },
      {
        tag: "FO Navigation",
        color: "indigo",
        text: "Modern Bottom Dock: Streamlined FO mobile experience by replacing top bar switches with a fixed bottom navigation dock providing seamless 1-tap switching between Reporting, Tracking, Profile, and Guide."
      },
      {
        tag: "Nikshay Integration",
        color: "emerald",
        text: "Reconciler Verification Status: Field Officers can now immediately verify whether reported patient data is synced and approved on Nikshay, reviewing DBT bank linkages and comorbidity tests in real-time."
      },
      {
        tag: "Guidance & Reference",
        color: "teal",
        text: "System Workflow Graph: Interactive 4-step flowchart showing how field data moves from Field Entry to Zero-Loss Sync, Nikshay Reconciler, and Patient Journey, accompanied by NTEP weight-band dosage reference tables."
      }
    ]
  },
  {
    version: "v2.6.0",
    date: "17 Sep 2026",
    title: "FO Mobile UI Enhancement Suite, Live Session HUD & IST Timezone Synchronization",
    badge: "Previous Release",
    badgeColor: "slate",
    highlights: [
      "📊 Live Session Mini-HUD: Sticky floating session tally displaying real-time ID count, TB notifications, FDC medicine, and doctor visits with bottom action bar summary.",
      "⚖️ FDC Quick Weight Chips: 1-Tap weight selection chips for adults and pediatrics with live visual Phase badges (IP/CP) and blister foil breakdown.",
      "💬 1-Tap WhatsApp Share: Direct WhatsApp sharing button on post-submission success modal and profile date inspector for instant DTO reporting.",
      "📅 7-Day Activity Roster: Interactive 7-day attendance strip with date inspector integration and target progress achievement ring.",
      "🕒 IST Timezone Alignment: Enforced Indian Standard Time (IST UTC+5:30) on reporting and attendance dates, eliminating UTC midnight rollbacks.",
      "🔢 Profile 8-Digit ID Edit: Extended FO self-service ID correction modal to support 8-digit legacy IDs for FDC and Outcome Assigned."
    ],
    details: [
      {
        tag: "FO Interface",
        color: "indigo",
        text: "Floating Mini-HUD & Sticky Bar: Field Officers can monitor live session tallies while scrolling the form, backed by an active summary above the review & submit button."
      },
      {
        tag: "FDC Smart Card",
        color: "teal",
        text: "Tactile Weight Selection: Added weight chips (30kg–80kg for adult, 6kg–35kg for pediatric) to quickly calculate dosages without opening the mobile keyboard."
      },
      {
        tag: "Communication",
        color: "emerald",
        text: "Direct WhatsApp Dispatch: Added 1-tap WhatsApp sharing link in post-submit modal and historical date inspector for effortless coordinator reporting."
      },
      {
        tag: "Core Backend & Timezone",
        color: "amber",
        text: "Zero UTC Date Drift: Fixed timezone drift across report submission, daily attendance, and profile streak calculation to guarantee 100% accurate calendar dates."
      }
    ]
  },
  {
    version: "v2.5.0",
    date: "17 Sep 2026",
    title: "TB FDC Medicine Distribution Studio, 8-Digit Legacy ID Clause & Staff Lifecycle Synchronization",
    badge: "Previous Release",
    badgeColor: "slate",
    highlights: [
      "💊 FDC Medicine Distribution Engine: Smart weight-band calculation for adult & pediatric TB regimens with automatic daily tablet and 28-day blister pack estimation.",
      "🔢 8-Digit Legacy ID Clause: Full ingestion support for 8-digit and 9-digit patient IDs in FDC (fdc_provided_ids) and Outcome Assigned (outcome_assigned_ids).",
      "📊 2-Sheet Medicine Consumption Studio: Live dashboard consumption viewer and concurrency-locked Excel report generation with zero RAM spike.",
      "👥 Staff Lifecycle Soft-Delete & Radar Sync: Officer deactivation preserves all historical data while guaranteeing zero defaulter ghosts on future dates.",
      "🏷️ Designation Management: Comprehensive staff role management (FO, DC, STS, TBHV, LT) with unified PIN and details editing."
    ],
    details: [
      {
        tag: "Feature",
        color: "indigo",
        text: "Inline Smart FDC Dosage Card: Embedded inside FO mobile reporting with live reactive dosage badge, adult/pediatric toggle, and weight-band calculation stored zero-cost in daily_field_reports."
      },
      {
        tag: "Data Ingestion",
        color: "amber",
        text: "8-Digit & 9-Digit ID Support: Added regex and length relaxation for legacy IDs in FDC and Outcome Assigned across mobile form, backend validation, feed modal, and edit day modal."
      },
      {
        tag: "Reporting & Export",
        color: "emerald",
        text: "Medicine Consumption Studio: 2-sheet Excel report protected by asyncio semaphore, with multi-district selection chip deck and sequential queue downloading (1000ms cooldown) for zero Render memory spikes."
      },
      {
        tag: "Staff Lifecycle & Attendance",
        color: "teal",
        text: "Date-Aware Attendance Roster: Soft-deleted staff are excluded from expected attendance roster after their deletion date, preventing chronic defaulter ghosting while preserving 100% historical records."
      },
      {
        tag: "Administration",
        color: "blue",
        text: "Staff Designation Suite: Added designation dropdowns, table badges, and combined Edit Staff Details modal for atomic role and PIN updates."
      }
    ]
  },
  {
    version: "v2.4.0",
    date: "16 Sep 2026",
    title: "Full Day Report Editor, 7-Day ID Modification Audit Radar & Sleek Glassmorphism UI",
    badge: "Previous Release",
    badgeColor: "slate",
    highlights: [
      "✏️ Admin Edit Day: Pre-populated full day report editing modal with KM, visited names, remarks & 19+ category ID buckets.",
      "🕒 7-Day ID History: Comprehensive audit radar tracking all Patient ID additions, edits, replacements, and deletions across the past 7 days.",
      "🚀 In-Dashboard Changelog: Live update history and release notes directly embedded in the dashboard top bar.",
      "✨ Modern Sleek UI: Frosted glassmorphism panels, tabular numeric alignment, and tactile feedback without extra external JS bundles."
    ],
    details: [
      {
        tag: "Feature",
        color: "indigo",
        text: "Full Day Report Editor: Added 'Edit Day' alongside 'Delete Day' in FO Dossier inspection. Allows full modification of KM, visited doctors/chemists, remarks, and patient IDs with atomic rollup recalculation."
      },
      {
        tag: "Audit & Security",
        color: "amber",
        text: "7-Day ID Modification Radar: Dedicated viewer with search and action filters (Delete, Replace, Add) tracking exact old vs new IDs and admin identity."
      },
      {
        tag: "UI / UX",
        color: "teal",
        text: "Glassmorphism Makeover: Antialiased Plus Jakarta Sans typography, sleek frosted cards, rounded-2xl search inputs, and responsive layout polish."
      }
    ]
  },
  {
    version: "v2.3.0",
    date: "15 Sep 2026",
    title: "Attendance Intelligence Radar & FO Master Alignment",
    badge: "Major Update",
    badgeColor: "indigo",
    highlights: [
      "⚡ Attendance Intelligence Radar: Zero-read derived attendance calculation directly from cached daily reports.",
      "🎯 Staff Directory Auto-Alignment: Canonicalized FO names matching staff directory to eliminate duplicate table rows.",
      "📊 Punctuality & Chronic Defaulters: 3-day and 5-day absent streak tracking with instant WhatsApp alert copy."
    ],
    details: [
      {
        tag: "Feature",
        color: "indigo",
        text: "Attendance Intelligence Radar with district-wise submission percentages, active working days, and streak analysis."
      },
      {
        tag: "Data Integrity",
        color: "emerald",
        text: "Multi-district name canonicalization and auto-linking preventing duplicate FO rows in the Master Table."
      }
    ]
  },
  {
    version: "v2.2.0",
    date: "12 Sep 2026",
    title: "Data Integrity Fortress & Cross-District Isolation",
    badge: "Security & Stability",
    badgeColor: "rose",
    highlights: [
      "🛡️ Strict District Isolation: Removed cross-district fallback vulnerabilities in feed and edit-id endpoints.",
      "🧟 Zombie Document Deletion Prevention: Multi-alias candidate document detection ensures zero orphan documents remain.",
      "🔒 Double-Tap Protection: Rollup update atomicity and debounced submission checks to prevent count inflation."
    ],
    details: [
      {
        tag: "Security",
        color: "rose",
        text: "Eliminated cross-district query fallbacks, ensuring writes strictly stay within the specified district."
      },
      {
        tag: "Data Integrity",
        color: "emerald",
        text: "Added multi-district rollback guards in rollup synchronization and cache invalidation."
      }
    ]
  },
  {
    version: "v2.1.0",
    date: "11 Sep 2026",
    title: "High-Speed Delta Sync & 90% Firestore Read Cut",
    badge: "Performance",
    badgeColor: "teal",
    highlights: [
      "⚡ Delta Sync Engine: Client checks server mutation timestamp before fetching, cutting read latency to under 100ms.",
      "🪦 Tombstone Deletion Tracking: Deleted reports propagate instantly to cached dashboard clients.",
      "💾 Multi-Tiered Memory Caching: In-memory monthly snapshots eliminate redundant Firestore queries."
    ],
    details: [
      {
        tag: "Performance",
        color: "teal",
        text: "Delta sync headers and memory cache cut Firestore daily bill and read load by over 90%."
      }
    ]
  },
  {
    version: "v2.0.0",
    date: "10 Sep 2026",
    title: "Security Radar & Real-Time IP Geolocation",
    badge: "Security",
    badgeColor: "amber",
    highlights: [
      "🌍 IP Geolocation & ISP Intelligence: Real-time City, State, ISP, and device tracking for every admin login and data mutation.",
      "⏰ 12-Hour IST Audit Logging: Clean AM/PM timestamps on all admin activity records.",
      "🚫 Brute-Force Lockout: 10-minute automatic account lock upon repeated failed login attempts."
    ],
    details: [
      {
        tag: "Security",
        color: "amber",
        text: "Full administrative transparency with actor tracking, diff payloads, and IP intruder detection."
      }
    ]
  },
  {
    version: "v1.9.0",
    date: "08 Sep 2026",
    title: "Daily Notification Verification Tray & Nikshay 24-Col Excel Sync",
    badge: "Core Feature",
    badgeColor: "indigo",
    highlights: [
      "📋 Notification Verification Tray: Instant tabular view of all submitted patient IDs cross-checked against Nikshay portal dumps.",
      "📑 24-Column Excel Copy: One-click clipboard copy formatted for direct pasting into Nikshay reporting sheets.",
      "📘 Admin SOP Manual: Centralized operational manual embedded right into the dashboard."
    ],
    details: [
      {
        tag: "Core",
        color: "indigo",
        text: "Streamlined field officer verification and data ingestion with direct Nikshay export format."
      }
    ]
  }
];
