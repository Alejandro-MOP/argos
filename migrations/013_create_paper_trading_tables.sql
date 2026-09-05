CREATE TABLE IF NOT EXISTS market_signal_engine.paper_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_signal_id UUID REFERENCES market_signal_engine.evidence_signals(id) ON DELETE SET NULL,
  ticker TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  score NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  entry_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  strategy_version TEXT NOT NULL,
  paper_strategy_version TEXT NOT NULL,
  reference_snapshot_date DATE NOT NULL,
  mfe_reference_pct NUMERIC NOT NULL,
  mae_reference_pct NUMERIC NOT NULL,
  current_mfe_pct NUMERIC NOT NULL DEFAULT 0,
  current_mae_pct NUMERIC NOT NULL DEFAULT 0,
  highest_price_seen NUMERIC NOT NULL,
  lowest_price_seen NUMERIC NOT NULL,
  exit_price NUMERIC,
  exit_at TIMESTAMPTZ,
  exit_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT paper_trades_status_check CHECK (status IN ('OPEN', 'CLOSED')),
  CONSTRAINT paper_trades_asset_type_check CHECK (asset_type IN ('STOCK')),
  CONSTRAINT paper_trades_timeframe_check CHECK (timeframe = '5m'),
  CONSTRAINT paper_trades_score_check CHECK (score = 100),
  CONSTRAINT paper_trades_strategy_version_check CHECK (strategy_version = 'v1'),
  CONSTRAINT paper_trades_paper_strategy_version_check CHECK (paper_strategy_version = 'paper-v0.1')
);

CREATE TABLE IF NOT EXISTS market_signal_engine.paper_trade_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_trade_id UUID NOT NULL REFERENCES market_signal_engine.paper_trades(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  level_pct NUMERIC NOT NULL,
  level_price NUMERIC NOT NULL,
  triggered_at TIMESTAMPTZ,
  user_action TEXT,
  user_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT paper_trade_levels_type_check CHECK (
    type IN ('REFERENCE_FAVORABLE', 'REFERENCE_ADVERSE', 'PROFIT_LEVEL', 'RISK_LEVEL', 'STOP_LOSS')
  ),
  CONSTRAINT paper_trade_levels_user_action_check CHECK (
    user_action IS NULL OR user_action IN ('CONTINUE', 'CLOSE')
  )
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_status
  ON market_signal_engine.paper_trades (status);

CREATE INDEX IF NOT EXISTS idx_paper_trades_ticker
  ON market_signal_engine.paper_trades (ticker);

CREATE INDEX IF NOT EXISTS idx_paper_trades_evidence_signal_id
  ON market_signal_engine.paper_trades (evidence_signal_id);

CREATE INDEX IF NOT EXISTS idx_paper_trade_levels_trade_id
  ON market_signal_engine.paper_trade_levels (paper_trade_id);

CREATE INDEX IF NOT EXISTS idx_paper_trade_levels_triggered_at
  ON market_signal_engine.paper_trade_levels (triggered_at);

CREATE INDEX IF NOT EXISTS idx_paper_trade_levels_trade_triggered
  ON market_signal_engine.paper_trade_levels (paper_trade_id, triggered_at);
