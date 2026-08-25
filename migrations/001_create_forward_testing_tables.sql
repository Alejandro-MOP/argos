CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  score NUMERIC NOT NULL,
  trend_score NUMERIC NOT NULL,
  volume_score NUMERIC NOT NULL,
  momentum_score NUMERIC NOT NULL,
  structure_score NUMERIC NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_at TIMESTAMPTZ NOT NULL,
  score NUMERIC NOT NULL,
  trend_score NUMERIC NOT NULL,
  volume_score NUMERIC NOT NULL,
  momentum_score NUMERIC NOT NULL,
  structure_score NUMERIC NOT NULL,
  entry NUMERIC NOT NULL,
  technical_stop_price NUMERIC,
  financial_stop_percent NUMERIC NOT NULL,
  financial_stop_price NUMERIC NOT NULL,
  tp1_percent NUMERIC NOT NULL,
  tp1_price NUMERIC NOT NULL,
  tp2_percent NUMERIC NOT NULL,
  tp2_price NUMERIC NOT NULL,
  telegram_sent BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  outcome_tp1 TEXT,
  outcome_tp2 TEXT,
  exit_at_tp1 TIMESTAMPTZ,
  exit_at_tp2 TIMESTAMPTZ,
  candles_until_tp1 INTEGER,
  candles_until_tp2 INTEGER,
  max_favorable_excursion_percent NUMERIC,
  max_adverse_excursion_percent NUMERIC,
  evaluated_until TIMESTAMPTZ,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signal_evaluations_status_check CHECK (
    status IN ('OPEN', 'PARTIALLY_RESOLVED', 'CLOSED', 'EXPIRED', 'AMBIGUOUS')
  ),
  CONSTRAINT signal_evaluations_outcome_tp1_check CHECK (
    outcome_tp1 IS NULL OR outcome_tp1 IN ('WIN', 'LOSS', 'EXPIRED', 'AMBIGUOUS')
  ),
  CONSTRAINT signal_evaluations_outcome_tp2_check CHECK (
    outcome_tp2 IS NULL OR outcome_tp2 IN ('WIN', 'LOSS', 'EXPIRED', 'AMBIGUOUS')
  )
);

CREATE INDEX IF NOT EXISTS idx_opportunities_ticker_timeframe_detected_at
  ON opportunities (ticker, timeframe, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_opportunities_score
  ON opportunities (score);

CREATE INDEX IF NOT EXISTS idx_signals_ticker_timeframe_signal_at
  ON signals (ticker, timeframe, signal_at DESC);

CREATE INDEX IF NOT EXISTS idx_signals_score
  ON signals (score);

CREATE INDEX IF NOT EXISTS idx_signals_signal_at
  ON signals (signal_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_evaluations_signal_id
  ON signal_evaluations (signal_id);

CREATE INDEX IF NOT EXISTS idx_signal_evaluations_status
  ON signal_evaluations (status);

CREATE INDEX IF NOT EXISTS idx_forward_performance_lookup
  ON signals (ticker, timeframe, score, signal_at DESC);
