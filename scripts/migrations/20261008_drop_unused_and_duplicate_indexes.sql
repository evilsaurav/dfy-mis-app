-- Migration: 20261008_drop_unused_and_duplicate_indexes.sql
-- Description: Drop confirmed-dead and duplicate indexes on PostgreSQL (Supabase)
-- Target Tables: nikshay_verified_patients, admin_audit_logs, daily_field_reports, report_kpi_entries
-- Executed: 2026-10-08 via autocommit CONCURRENTLY statements.

-- 1. Drop unused trigram GIN index on nikshay_verified_patients (0 scans, 1.2 MB).
-- Patient reconciliation matches strictly on patient_id/id, no fuzzy/trigram patient_name SQL queries exist.
DROP INDEX CONCURRENTLY IF EXISTS idx_np_patient_name_trigram;

-- 2. Drop unused jsonb_path_ops GIN index on admin_audit_logs (0 scans, 480 kB).
-- Audit logs are queried ordered by occurred_at/timestamp DESC with LIMIT; diff filtering is handled in Python.
DROP INDEX CONCURRENTLY IF EXISTS idx_aal_diff_gin;

-- 3. Drop unused partial index on daily_field_reports (0 scans, 88 kB).
-- No query in the codebase filters by submission_count = 1; composite date/district queries are used instead.
DROP INDEX CONCURRENTLY IF EXISTS idx_dfr_partial_submission;

-- 4. Drop 100% redundant duplicate index on report_kpi_entries (0 scans, 736 kB).
-- idx_rke_report_id (12,827+ scans) is byte-for-byte identical on (report_id) and remains active.
DROP INDEX CONCURRENTLY IF EXISTS idx_rkp_report_id;

-- NOTE: uq_np_legacy_doc_id on nikshay_verified_patients is a confirmed UNIQUE constraint and MUST NOT be dropped.
