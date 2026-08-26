CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS market_signal_engine;

INSERT INTO market_signal_engine.engine_config (key, value, value_type, category, description, is_active)
VALUES (
  'EVIDENCE_MIN_SCORE',
  '80',
  'number',
  'evidence',
  'Score mínimo para capturar un Evidence Signal de investigación. No controla Opportunities ni Telegram.',
  true
)
ON CONFLICT (key) DO UPDATE SET
  value_type = EXCLUDED.value_type,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE TABLE IF NOT EXISTS market_signal_engine.evidence_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  provider_symbol TEXT,
  timeframe TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL,
  signal_type TEXT NOT NULL DEFAULT 'LONG',
  score NUMERIC NOT NULL,
  trend_score NUMERIC NOT NULL,
  volume_score NUMERIC NOT NULL,
  momentum_score NUMERIC NOT NULL,
  structure_score NUMERIC NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry NUMERIC NOT NULL,
  technical_stop_price NUMERIC,
  financial_stop_percent NUMERIC NOT NULL,
  financial_stop_price NUMERIC NOT NULL,
  tp1_percent NUMERIC NOT NULL,
  tp1_price NUMERIC NOT NULL,
  tp2_percent NUMERIC NOT NULL,
  tp2_price NUMERIC NOT NULL,
  strategy_version TEXT NOT NULL,
  asset_type TEXT,
  sector TEXT,
  industry TEXT,
  market TEXT,
  is_operational_opportunity BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evidence_signals_signal_type_check CHECK (signal_type IN ('LONG'))
);

CREATE TABLE IF NOT EXISTS market_signal_engine.evidence_signal_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_signal_id UUID NOT NULL REFERENCES market_signal_engine.evidence_signals(id) ON DELETE CASCADE,
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
  CONSTRAINT evidence_signal_evaluations_status_check CHECK (
    status IN ('OPEN', 'PARTIALLY_RESOLVED', 'CLOSED', 'EXPIRED', 'AMBIGUOUS')
  ),
  CONSTRAINT evidence_signal_evaluations_outcome_tp1_check CHECK (
    outcome_tp1 IS NULL OR outcome_tp1 IN ('WIN', 'LOSS', 'EXPIRED', 'AMBIGUOUS')
  ),
  CONSTRAINT evidence_signal_evaluations_outcome_tp2_check CHECK (
    outcome_tp2 IS NULL OR outcome_tp2 IN ('WIN', 'LOSS', 'EXPIRED', 'AMBIGUOUS')
  )
);

CREATE TABLE IF NOT EXISTS market_signal_engine.evidence_target_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_signal_id UUID NOT NULL REFERENCES market_signal_engine.evidence_signals(id) ON DELETE CASCADE,
  target_percent NUMERIC NOT NULL,
  target_price NUMERIC NOT NULL,
  outcome TEXT,
  hit_at TIMESTAMPTZ,
  candles_until INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evidence_signal_id, target_percent),
  CONSTRAINT evidence_target_evaluations_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('WIN', 'LOSS', 'EXPIRED', 'AMBIGUOUS')
  )
);

CREATE INDEX IF NOT EXISTS idx_evidence_signals_ticker_timeframe_detected_at
  ON market_signal_engine.evidence_signals (ticker, timeframe, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_signals_strategy_score
  ON market_signal_engine.evidence_signals (strategy_version, score, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_evidence_signals_dimensions
  ON market_signal_engine.evidence_signals (timeframe, asset_type, sector, industry);

CREATE INDEX IF NOT EXISTS idx_evidence_signals_operational
  ON market_signal_engine.evidence_signals (is_operational_opportunity);

CREATE INDEX IF NOT EXISTS idx_evidence_signal_evaluations_signal_id
  ON market_signal_engine.evidence_signal_evaluations (evidence_signal_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_signal_evaluations_signal_unique
  ON market_signal_engine.evidence_signal_evaluations (evidence_signal_id);

CREATE INDEX IF NOT EXISTS idx_evidence_signal_evaluations_status
  ON market_signal_engine.evidence_signal_evaluations (status);

CREATE INDEX IF NOT EXISTS idx_evidence_target_evaluations_signal_target
  ON market_signal_engine.evidence_target_evaluations (evidence_signal_id, target_percent);
