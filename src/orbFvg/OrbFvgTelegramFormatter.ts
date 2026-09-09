import type { OrbFvgSignalSnapshot } from '../models/OrbFvgSignal';
import { OrbFvgSessionService } from './OrbFvgSessionService';

const sessionService = new OrbFvgSessionService();

export const formatOrbFvgDetectionAlert = (signal: OrbFvgSignalSnapshot): string => [
  '🧪 ARGOS ORB-FVG',
  '',
  `${signal.ticker} · ${signal.assetType}`,
  signal.direction,
  '',
  'Opening Range',
  `High: ${formatPrice(signal.openingRangeCandle.high)}`,
  `Low: ${formatPrice(signal.openingRangeCandle.low)}`,
  '',
  `Breakout: ${formatPrice(signal.breakoutCandle.close)} @ ${sessionService.formatEt(signal.breakoutAt)}`,
  `FVG: ${formatPrice(signal.fvgLow)} → ${formatPrice(signal.fvgHigh)}`,
  '',
  signal.entryPrice === undefined ? 'Entry ref: pending manual/paper entry' : `Entry ref: ${formatPrice(signal.entryPrice)}`,
  signal.stopPrice === undefined ? 'Stop ref: pending manual/paper entry' : `Stop ref: ${formatPrice(signal.stopPrice)}`,
  signal.target2RPrice === undefined ? 'Target 2R: pending manual/paper entry' : `Target 2R: ${formatPrice(signal.target2RPrice)}`,
  '',
  `Detected: ${sessionService.formatEt(signal.signalAt)}`,
  '',
  'RESEARCH ONLY',
  'NO TRADE RECOMMENDATION',
].join('\n');

export const formatOrbFvgSetupPreviewAlert = (signal: OrbFvgSignalSnapshot): string => [
  '👀 ORB-FVG — SETUP PREVIEW',
  '',
  `Ticker: ${signal.ticker}`,
  `Asset type: ${signal.assetType}`,
  `Direction: ${signal.direction}`,
  'Detector: 5m',
  `Experiment: ${signal.experimentVersion}`,
  '',
  '✓ Opening Range breakout',
  '✓ Bullish FVG',
  '✓ FVG retest',
  '✓ Pre-retrace high recovered',
  '',
  `OR High: ${formatPrice(signal.openingRangeCandle.high)}`,
  `OR Low: ${formatPrice(signal.openingRangeCandle.low)}`,
  `FVG: ${formatPrice(signal.fvgLow)} – ${formatPrice(signal.fvgHigh)}`,
  `FVG midpoint: ${formatOptionalPrice(signal.fvgMidpoint)}`,
  `Pre-retrace High: ${formatOptionalPrice(signal.preRetraceHigh)}`,
  `Current Close: ${formatOptionalPrice(signal.setupPreviewPrice ?? signal.structureBreakClose)}`,
  '',
  'Status:',
  'Waiting for continuation confirmation',
  '',
  'Advanced setup detected. Review chart if desired.',
  'RESEARCH ONLY',
  'NO TRADE RECOMMENDATION',
].join('\n');

export const formatOrbFvgTradeReadyAlert = (signal: OrbFvgSignalSnapshot): string => [
  '🎯 ORB-FVG — TRADE READY',
  '',
  `Ticker: ${signal.ticker}`,
  `Asset type: ${signal.assetType}`,
  `Direction: ${signal.direction}`,
  'Detector: 5m',
  `Experiment: ${signal.experimentVersion}`,
  '',
  '✓ Opening Range breakout',
  '✓ Bullish FVG',
  '✓ FVG retest',
  '✓ Structure break',
  '✓ Continuation confirmed',
  '',
  `OR High: ${formatPrice(signal.openingRangeCandle.high)}`,
  `OR Low: ${formatPrice(signal.openingRangeCandle.low)}`,
  `FVG: ${formatPrice(signal.fvgLow)} – ${formatPrice(signal.fvgHigh)}`,
  `FVG midpoint: ${formatOptionalPrice(signal.fvgMidpoint)}`,
  `Pre-retrace High: ${formatOptionalPrice(signal.preRetraceHigh)}`,
  `Structure Break Close: ${formatOptionalPrice(signal.structureBreakClose)}`,
  `Confirmation Close: ${formatOptionalPrice(signal.tradeReadyPrice ?? signal.continuationClose)}`,
  '',
  'Status:',
  'TRADE_READY',
  '',
  'Structure confirmed. Review 1m for discretionary entry.',
  'RESEARCH ONLY',
  'NO TRADE RECOMMENDATION',
].join('\n');

const formatPrice = (value: number): string => value < 1 ? value.toFixed(6) : value.toFixed(2);

const formatOptionalPrice = (value: number | undefined): string =>
  value === undefined ? 'n/a' : formatPrice(value);
