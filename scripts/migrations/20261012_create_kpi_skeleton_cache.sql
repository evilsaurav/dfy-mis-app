-- Migration: 20261012_create_kpi_skeleton_cache.sql
-- Description: Dynamic KPI template skeleton cache table for Backlog #88 Option B

CREATE TABLE IF NOT EXISTS kpi_skeleton_cache (
    id BIGSERIAL PRIMARY KEY,
    district TEXT NOT NULL,
    roster_fingerprint TEXT NOT NULL,
    skeleton_bytes BYTEA NOT NULL,
    staff_count SMALLINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (district, roster_fingerprint)
);

grant select on public.kpi_skeleton_cache to anon;
grant select, insert, update, delete on public.kpi_skeleton_cache to authenticated;
grant select, insert, update, delete on public.kpi_skeleton_cache to service_role;

CREATE INDEX IF NOT EXISTS idx_kpi_skeleton_cache_district ON kpi_skeleton_cache(district);
