// changelogData.js - Application Release Notes & Update History
// High-performance client-side release log (Zero backend / Firestore load)

export const APP_VERSION = "2.4.0";
export const LAST_UPDATED_DATE = "16 Sep 2026";

export const CHANGELOG_ENTRIES = [
  {
    version: "v2.4.0",
    date: "16 Sep 2026",
    title: "Full Day Report Editor, 7-Day ID Modification Audit Radar & Sleek Glassmorphism UI",
    badge: "Latest Release",
    badgeColor: "emerald",
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
