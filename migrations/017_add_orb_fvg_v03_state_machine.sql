ALTER TABLE market_signal_engine.orb_fvg_signals
  ADD COLUMN IF NOT EXISTS orb_fvg_state TEXT,
  ADD COLUMN IF NOT EXISTS fvg_midpoint NUMERIC,
  ADD COLUMN IF NOT EXISTS retest_count INTEGER,
  ADD COLUMN IF NOT EXISTS first_retest_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_retest_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retest_candle_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retest_low NUMERIC,
  ADD COLUMN IF NOT EXISTS retest_high NUMERIC,
  ADD COLUMN IF NOT EXISTS retest_close NUMERIC,
  ADD COLUMN IF NOT EXISTS retest_depth_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS pre_retrace_high NUMERIC,
  ADD COLUMN IF NOT EXISTS pre_retrace_high_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS structure_break_candle_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS structure_break_open NUMERIC,
  ADD COLUMN IF NOT EXISTS structure_break_high NUMERIC,
  ADD COLUMN IF NOT EXISTS structure_break_low NUMERIC,
  ADD COLUMN IF NOT EXISTS structure_break_close NUMERIC,
  ADD COLUMN IF NOT EXISTS continuation_candle_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS continuation_open NUMERIC,
  ADD COLUMN IF NOT EXISTS continuation_high NUMERIC,
  ADD COLUMN IF NOT EXISTS continuation_low NUMERIC,
  ADD COLUMN IF NOT EXISTS continuation_close NUMERIC,
  ADD COLUMN IF NOT EXISTS setup_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE market_signal_engine.orb_fvg_signals
  ALTER COLUMN entry_price DROP NOT NULL,
  ALTER COLUMN stop_price DROP NOT NULL,
  ALTER COLUMN risk DROP NOT NULL,
  ALTER COLUMN risk_pct DROP NOT NULL,
  ALTER COLUMN target_2r_price DROP NOT NULL;

ALTER TABLE market_signal_engine.orb_fvg_signals
  DROP CONSTRAINT IF EXISTS orb_fvg_signals_state_check;

ALTER TABLE market_signal_engine.orb_fvg_signals
  ADD CONSTRAINT orb_fvg_signals_state_check CHECK (
    orb_fvg_state IS NULL OR orb_fvg_state IN (
      'WAITING_FOR_OR',
      'OR_READY',
      'WAITING_FOR_BREAKOUT',
      'BREAKOUT_CONFIRMED',
      'WAITING_FOR_FVG',
      'FVG_CREATED',
      'WAITING_FOR_RETEST',
      'FVG_RETESTED',
      'WAITING_FOR_STRUCTURE_BREAK',
      'PRE_RETRACE_HIGH_BROKEN',
      'WAITING_FOR_CONTINUATION',
      'CONTINUATION_CONFIRMED',
      'TRADE_READY',
      'EXPIRED_SETUP',
      'INVALIDATED_SETUP'
    )
  );

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_experiment_state_session
  ON market_signal_engine.orb_fvg_signals (experiment_version, orb_fvg_state, session_date DESC);

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_setup_ready_at
  ON market_signal_engine.orb_fvg_signals (setup_ready_at)
  WHERE setup_ready_at IS NOT NULL;

INSERT INTO market_signal_engine.engine_config (key, value, value_type, category, description, is_active)
VALUES (
  'ORB_FVG_TRADE_READY_ALERTS_ENABLED',
  'false',
  'boolean',
  'orb-fvg',
  'Habilita alertas Telegram únicamente cuando ORB-FVG alcanza TRADE_READY. No alerta estados preliminares.',
  true
)
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  value_type = EXCLUDED.value_type,
  updated_at = now();
