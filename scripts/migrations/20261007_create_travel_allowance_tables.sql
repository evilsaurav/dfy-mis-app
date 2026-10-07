-- Migration: 20261007_create_travel_allowance_tables.sql
-- Description: PostgreSQL schema for Travel Allowance & Bike Log subsystem (DFY TB MIS)
-- DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT USER APPROVAL GATE.

BEGIN;

-- 1. Singleton Settings for Dynamic KM Rate
CREATE TABLE IF NOT EXISTS travel_allowance_settings (
    id TEXT PRIMARY KEY DEFAULT 'global',
    rate_per_km NUMERIC(6, 2) NOT NULL DEFAULT 4.00 CHECK (rate_per_km >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT
);

-- Seed default global rate if not exists
INSERT INTO travel_allowance_settings (id, rate_per_km, updated_at, updated_by)
VALUES ('global', 4.00, NOW(), 'system_init')
ON CONFLICT (id) DO NOTHING;

-- 2. Master Monthly Roster per Staff Member
CREATE TABLE IF NOT EXISTS travel_allowance_rosters (
    id BIGSERIAL PRIMARY KEY,
    month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
    district_id SMALLINT NOT NULL REFERENCES districts(id),
    district TEXT NOT NULL,
    staff_id BIGINT NOT NULL REFERENCES staff_directory(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    staff_key TEXT NOT NULL,
    designation TEXT NOT NULL DEFAULT 'Field Officer',
    
    -- Financials & Readings
    rate_per_km NUMERIC(6, 2) NOT NULL DEFAULT 4.00 CHECK (rate_per_km >= 0),
    total_km NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (total_km >= 0),
    gross_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (gross_amount >= 0),
    deduction_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (deduction_amount >= 0),
    deduction_reason TEXT DEFAULT '',
    final_payable_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (final_payable_amount >= 0),
    admin_remarks TEXT DEFAULT '',
    
    -- State Machine
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REVERTED')),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    
    -- Workflow audit trail
    submitted_at TIMESTAMPTZ,
    submitted_by TEXT,
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    reverted_at TIMESTAMPTZ,
    reverted_by TEXT,
    revert_reason TEXT,
    unlocked_at TIMESTAMPTZ,
    unlocked_by TEXT,
    
    -- 24h Dispute management
    dispute_status TEXT NOT NULL DEFAULT 'NONE' CHECK (dispute_status IN ('NONE', 'PENDING', 'RESOLVED', 'REJECTED')),
    dispute_reason TEXT,
    disputed_at TIMESTAMPTZ,
    dispute_resolved_at TIMESTAMPTZ,
    dispute_resolved_by TEXT,
    dispute_resolution_remarks TEXT,
    
    -- System metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by TEXT,
    legacy_doc_id TEXT,
    
    CONSTRAINT uq_ta_roster_staff_month UNIQUE (staff_id, month)
);

CREATE INDEX IF NOT EXISTS idx_ta_rosters_month_dist ON travel_allowance_rosters(month, district);
CREATE INDEX IF NOT EXISTS idx_ta_rosters_staff_month ON travel_allowance_rosters(staff_id, month);
CREATE INDEX IF NOT EXISTS idx_ta_rosters_status ON travel_allowance_rosters(status);

-- 3. Daily Breakdown (Child records)
CREATE TABLE IF NOT EXISTS travel_allowance_daily_logs (
    id BIGSERIAL PRIMARY KEY,
    roster_id BIGINT NOT NULL REFERENCES travel_allowance_rosters(id) ON DELETE CASCADE,
    day SMALLINT NOT NULL CHECK (day >= 1 AND day <= 31),
    date DATE NOT NULL,
    morning_km NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (morning_km >= 0),
    evening_km NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (evening_km >= 0),
    total_km NUMERIC(8, 2) NOT NULL DEFAULT 0.00 CHECK (total_km >= 0),
    visited_names TEXT DEFAULT '',
    purpose TEXT DEFAULT '',
    is_manual_override BOOLEAN NOT NULL DEFAULT false,
    admin_remarks TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_ta_daily_logs_roster_day UNIQUE (roster_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ta_daily_logs_roster_id ON travel_allowance_daily_logs(roster_id);
CREATE INDEX IF NOT EXISTS idx_ta_daily_logs_date ON travel_allowance_daily_logs(date);

-- 4. Super-Admin Permission Gate for Pre-fill Feature
CREATE TABLE IF NOT EXISTS travel_allowance_permissions (
    admin_id BIGINT PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
    can_prefill BOOLEAN NOT NULL DEFAULT false,
    granted_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
