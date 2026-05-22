-- ============================================================
-- Supabase Schema: Automatic Stock Recommendation System
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------
-- Main table: recommendation_history
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendation_history (
  id                        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker                    VARCHAR(10)   NOT NULL,
  date                      DATE          NOT NULL,

  -- Price targets
  entry_price               NUMERIC(14,2) NOT NULL,
  target_price              NUMERIC(14,2) NOT NULL,
  stop_loss                 NUMERIC(14,2) NOT NULL,

  -- Scores (0–1)
  technical_score           NUMERIC(5,4)  NOT NULL,
  fundamental_score         NUMERIC(5,4)  NOT NULL,
  sentiment_score           NUMERIC(5,4)  NOT NULL,
  aggregated_score          NUMERIC(5,4)  NOT NULL,

  -- Score breakdowns (per-indicator detail, stored as JSONB)
  technical_breakdown       JSONB,
  fundamental_breakdown     JSONB,

  -- Groq outputs
  sentiment_json            JSONB         NOT NULL DEFAULT '{}',
  narrative                 TEXT          NOT NULL DEFAULT '',

  -- Context at time of recommendation
  win_rate_at_recommendation NUMERIC(5,4) NOT NULL DEFAULT 0,

  -- Lifecycle
  status                    VARCHAR(10)   NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  resolution_date           DATE,
  resolution_price          NUMERIC(14,2),
  resolution_reason         TEXT,

  -- Timestamps
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for fast pending lookups
CREATE INDEX IF NOT EXISTS idx_recommendation_status
  ON recommendation_history (status)
  WHERE status = 'PENDING';

-- Unique constraint: one recommendation per ticker per date
CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendation_ticker_date
  ON recommendation_history (ticker, date);

-- Index for ticker-based queries
CREATE INDEX IF NOT EXISTS idx_recommendation_ticker
  ON recommendation_history (ticker, date DESC);

-- ----------------------------------------------------------------
-- Auto-update updated_at on row modification
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recommendation_updated_at ON recommendation_history;

CREATE TRIGGER trg_recommendation_updated_at
  BEFORE UPDATE ON recommendation_history
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- Row Level Security (disabled — service role key used in app)
-- ----------------------------------------------------------------
ALTER TABLE recommendation_history DISABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------
-- cron_logs: tracks every pipeline execution
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cron_logs (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  status           TEXT          NOT NULL DEFAULT 'RUNNING'
                     CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
  triggered_by     TEXT          NOT NULL DEFAULT 'manual',
  recommended      TEXT[],
  audited          INT           DEFAULT 0,
  errors           TEXT[],
  message          TEXT
);

ALTER TABLE cron_logs DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cron_logs_started
  ON cron_logs (started_at DESC);

-- ----------------------------------------------------------------
-- Migration: add breakdown columns to existing tables
-- Run these if the table already exists without the columns
-- ----------------------------------------------------------------
ALTER TABLE recommendation_history
  ADD COLUMN IF NOT EXISTS technical_breakdown   JSONB,
  ADD COLUMN IF NOT EXISTS fundamental_breakdown JSONB;
