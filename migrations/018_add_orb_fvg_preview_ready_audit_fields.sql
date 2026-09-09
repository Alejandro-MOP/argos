ALTER TABLE market_signal_engine.orb_fvg_signals
  ADD COLUMN IF NOT EXISTS previous_breakout_candle_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS previous_breakout_open NUMERIC,
  ADD COLUMN IF NOT EXISTS previous_breakout_high NUMERIC,
  ADD COLUMN IF NOT EXISTS previous_breakout_low NUMERIC,
  ADD COLUMN IF NOT EXISTS previous_breakout_close NUMERIC,
  ADD COLUMN IF NOT EXISTS first_retest_open NUMERIC,
  ADD COLUMN IF NOT EXISTS first_retest_high NUMERIC,
  ADD COLUMN IF NOT EXISTS first_retest_low NUMERIC,
  ADD COLUMN IF NOT EXISTS first_retest_close NUMERIC,
  ADD COLUMN IF NOT EXISTS setup_preview_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS setup_preview_price NUMERIC,
  ADD COLUMN IF NOT EXISTS setup_preview_alert_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_preview_alerted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trade_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trade_ready_price NUMERIC,
  ADD COLUMN IF NOT EXISTS trade_ready_alert_sent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_ready_alerted_at TIMESTAMPTZ;

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
      'SETUP_PREVIEW',
      'WAITING_FOR_CONTINUATION',
      'CONTINUATION_CONFIRMED',
      'TRADE_READY',
      'EXPIRED_SETUP',
      'INVALIDATED_SETUP'
    )
  );

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_setup_preview_at
  ON market_signal_engine.orb_fvg_signals (setup_preview_at)
  WHERE setup_preview_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orb_fvg_signals_trade_ready_at
  ON market_signal_engine.orb_fvg_signals (trade_ready_at)
  WHERE trade_ready_at IS NOT NULL;
