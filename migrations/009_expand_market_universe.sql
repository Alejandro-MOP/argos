-- V1.6-A — Market Universe Expansion & Segmentation
-- Expansión data-only e idempotente. Sin cambios de schema y sin deletes.

WITH seed_symbols(symbol, provider_symbol, asset_type, sector, industry, market, exchange, timezone, session_type, description) AS (
  VALUES
  ('SPY', 'SPY', 'ETF', 'Broad Market', 'S&P 500 ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'SPDR S&P 500 ETF Trust.'),
  ('QQQ', 'QQQ', 'ETF', 'Broad Market', 'Nasdaq 100 ETF', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'Invesco QQQ Trust.'),
  ('DIA', 'DIA', 'ETF', 'Broad Market', 'Dow Jones Industrial Average ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'SPDR Dow Jones Industrial Average ETF Trust.'),
  ('IWM', 'IWM', 'ETF', 'Broad Market', 'Russell 2000 ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'iShares Russell 2000 ETF.'),
  ('XLK', 'XLK', 'ETF', 'Technology', 'Technology Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Technology Select Sector SPDR Fund.'),
  ('XLF', 'XLF', 'ETF', 'Financial Services', 'Financial Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Financial Select Sector SPDR Fund.'),
  ('XLE', 'XLE', 'ETF', 'Energy', 'Energy Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Energy Select Sector SPDR Fund.'),
  ('XLV', 'XLV', 'ETF', 'Healthcare', 'Healthcare Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Health Care Select Sector SPDR Fund.'),
  ('XLY', 'XLY', 'ETF', 'Consumer Cyclical', 'Consumer Discretionary Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Consumer Discretionary Select Sector SPDR Fund.'),
  ('XLP', 'XLP', 'ETF', 'Consumer Defensive', 'Consumer Staples Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Consumer Staples Select Sector SPDR Fund.'),
  ('XLI', 'XLI', 'ETF', 'Industrials', 'Industrial Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Industrial Select Sector SPDR Fund.'),
  ('XLU', 'XLU', 'ETF', 'Utilities', 'Utilities Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Utilities Select Sector SPDR Fund.'),
  ('XLC', 'XLC', 'ETF', 'Communication Services', 'Communication Services Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Communication Services Select Sector SPDR Fund.'),
  ('XLRE', 'XLRE', 'ETF', 'Real Estate', 'Real Estate Sector ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'Real Estate Select Sector SPDR Fund.'),
  ('SMH', 'SMH', 'ETF', 'Semiconductors', 'Semiconductor ETF', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'VanEck Semiconductor ETF.'),
  ('SOXX', 'SOXX', 'ETF', 'Semiconductors', 'Semiconductor ETF', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'iShares Semiconductor ETF.'),
  ('TSM', 'TSM', 'STOCK', 'Technology', 'Semiconductors', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Taiwan Semiconductor Manufacturing Company ADR.'),
  ('AAPL', 'AAPL', 'STOCK', 'Technology', 'Consumer Electronics', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'Apple Inc.'),
  ('ADBE', 'ADBE', 'STOCK', 'Technology', 'Software - Infrastructure', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'Adobe Inc.'),
  ('WFC', 'WFC', 'STOCK', 'Financial Services', 'Banks - Diversified', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Wells Fargo & Company.'),
  ('V', 'V', 'STOCK', 'Financial Services', 'Credit Services', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Visa Inc.'),
  ('MA', 'MA', 'STOCK', 'Financial Services', 'Credit Services', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Mastercard Incorporated.'),
  ('SLB', 'SLB', 'STOCK', 'Energy', 'Oil & Gas Equipment & Services', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'SLB N.V.'),
  ('HON', 'HON', 'STOCK', 'Industrials', 'Conglomerates', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'Honeywell International Inc.'),
  ('UPS', 'UPS', 'STOCK', 'Industrials', 'Integrated Freight & Logistics', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'United Parcel Service Inc.'),
  ('HD', 'HD', 'STOCK', 'Consumer Cyclical', 'Home Improvement Retail', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'The Home Depot Inc.'),
  ('BKNG', 'BKNG', 'STOCK', 'Consumer Cyclical', 'Travel Services', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'Booking Holdings Inc.'),
  ('UNH', 'UNH', 'STOCK', 'Healthcare', 'Healthcare Plans', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'UnitedHealth Group Incorporated.'),
  ('CMCSA', 'CMCSA', 'STOCK', 'Communication Services', 'Telecom Services', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'Comcast Corporation.'),
  ('T', 'T', 'STOCK', 'Communication Services', 'Telecom Services', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'AT&T Inc.'),
  ('VZ', 'VZ', 'STOCK', 'Communication Services', 'Telecom Services', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Verizon Communications Inc.'),
  ('NEE', 'NEE', 'STOCK', 'Utilities', 'Utilities - Regulated Electric', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'NextEra Energy Inc.'),
  ('DUK', 'DUK', 'STOCK', 'Utilities', 'Utilities - Regulated Electric', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Duke Energy Corporation.'),
  ('SO', 'SO', 'STOCK', 'Utilities', 'Utilities - Regulated Electric', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'The Southern Company.'),
  ('AMT', 'AMT', 'STOCK', 'Real Estate', 'REIT - Specialty', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'American Tower Corporation.'),
  ('PLD', 'PLD', 'STOCK', 'Real Estate', 'REIT - Industrial', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Prologis Inc.'),
  ('O', 'O', 'STOCK', 'Real Estate', 'REIT - Retail', 'US', 'NYSE', 'America/New_York', 'US_REGULAR', 'Realty Income Corporation.'),
  ('TLT', 'TLT', 'ETF', 'Rates', 'Long Treasury Bond ETF', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'iShares 20+ Year Treasury Bond ETF.'),
  ('IEF', 'IEF', 'ETF', 'Rates', 'Intermediate Treasury Bond ETF', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'iShares 7-10 Year Treasury Bond ETF.'),
  ('SHY', 'SHY', 'ETF', 'Rates', 'Short Treasury Bond ETF', 'US', 'NASDAQ', 'America/New_York', 'US_REGULAR', 'iShares 1-3 Year Treasury Bond ETF.'),
  ('SLV', 'SLV', 'ETF', 'Metals', 'Silver ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'iShares Silver Trust.'),
  ('GDX', 'GDX', 'ETF', 'Metals', 'Gold Miners ETF', 'US', 'NYSEARCA', 'America/New_York', 'US_REGULAR', 'VanEck Gold Miners ETF.')
)
INSERT INTO market_signal_engine.market_symbols (
  symbol,
  provider_symbol,
  display_name,
  asset_type,
  sector,
  industry,
  market,
  exchange,
  timezone,
  session_type,
  supports_intraday,
  description,
  is_active
)
SELECT
  symbol,
  provider_symbol,
  symbol,
  asset_type,
  sector,
  industry,
  market,
  exchange,
  timezone,
  session_type,
  true,
  description,
  true
FROM seed_symbols
ON CONFLICT (symbol) DO UPDATE SET
  provider_symbol = COALESCE(market_signal_engine.market_symbols.provider_symbol, EXCLUDED.provider_symbol),
  display_name = COALESCE(market_signal_engine.market_symbols.display_name, EXCLUDED.display_name),
  asset_type = market_signal_engine.market_symbols.asset_type,
  sector = COALESCE(market_signal_engine.market_symbols.sector, EXCLUDED.sector),
  industry = COALESCE(market_signal_engine.market_symbols.industry, EXCLUDED.industry),
  market = COALESCE(market_signal_engine.market_symbols.market, EXCLUDED.market),
  exchange = COALESCE(market_signal_engine.market_symbols.exchange, EXCLUDED.exchange),
  timezone = COALESCE(market_signal_engine.market_symbols.timezone, EXCLUDED.timezone),
  session_type = market_signal_engine.market_symbols.session_type,
  supports_intraday = market_signal_engine.market_symbols.supports_intraday,
  description = COALESCE(market_signal_engine.market_symbols.description, EXCLUDED.description),
  updated_at = now();

-- GLD ya existía en el universo inicial pero no tenía sector/categoría.
UPDATE market_signal_engine.market_symbols
SET sector = 'Metals',
    industry = COALESCE(industry, 'Gold ETF'),
    updated_at = now()
WHERE symbol = 'GLD'
  AND is_active = true
  AND (sector IS NULL OR btrim(sector) = '');

WITH expanded_symbols(symbol) AS (
  VALUES
  ('SPY'),
  ('QQQ'),
  ('DIA'),
  ('IWM'),
  ('XLK'),
  ('XLF'),
  ('XLE'),
  ('XLV'),
  ('XLY'),
  ('XLP'),
  ('XLI'),
  ('XLU'),
  ('XLC'),
  ('XLRE'),
  ('SMH'),
  ('SOXX'),
  ('TSM'),
  ('AAPL'),
  ('ADBE'),
  ('WFC'),
  ('V'),
  ('MA'),
  ('SLB'),
  ('HON'),
  ('UPS'),
  ('HD'),
  ('BKNG'),
  ('UNH'),
  ('CMCSA'),
  ('T'),
  ('VZ'),
  ('NEE'),
  ('DUK'),
  ('SO'),
  ('AMT'),
  ('PLD'),
  ('O'),
  ('TLT'),
  ('IEF'),
  ('SHY'),
  ('SLV'),
  ('GDX')
), seed_timeframes(timeframe) AS (
  VALUES ('1m'), ('5m'), ('15m'), ('1d'), ('1w')
)
INSERT INTO market_signal_engine.symbol_timeframes (symbol_id, timeframe, is_active)
SELECT market_symbols.id, seed_timeframes.timeframe, true
FROM expanded_symbols
JOIN market_signal_engine.market_symbols market_symbols
  ON market_symbols.symbol = expanded_symbols.symbol
  AND market_symbols.is_active = true
CROSS JOIN seed_timeframes
ON CONFLICT (symbol_id, timeframe) DO UPDATE SET
  is_active = true,
  updated_at = now();
