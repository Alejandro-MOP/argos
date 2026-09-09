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

const formatPrice = (value: number): string => value < 1 ? value.toFixed(6) : value.toFixed(2);



export const formatOrbFvgTradeReadyAlert = (signal: OrbFvgSignalSnapshot): string => [
  '🧪 ORB-FVG TRADE READY',
  '',
  `${signal.ticker} · ${signal.assetType}`,
  signal.direction,
  `Experiment: ${signal.experimentVersion}`,
  '',
  'Opening Range',
  `OR High: ${formatPrice(signal.openingRangeCandle.high)}`,
  `OR Low: ${formatPrice(signal.openingRangeCandle.low)}`,
  '',
  'FVG',
  `Low: ${formatPrice(signal.fvgLow)}`,
  `High: ${formatPrice(signal.fvgHigh)}`,
  `Midpoint: ${signal.fvgMidpoint === undefined ? 'n/a' : formatPrice(signal.fvgMidpoint)}`,
  '',
  'Retest',
  `Timestamp: ${signal.latestRetestAt ? sessionService.formatEt(signal.latestRetestAt) : 'n/a'}`,
  `Depth: ${signal.retestDepthPct === undefined ? 'n/a' : `${signal.retestDepthPct.toFixed(2)}%`}`,
  '',
  'Structure',
  `Pre-retrace high: ${signal.preRetraceHigh === undefined ? 'n/a' : formatPrice(signal.preRetraceHigh)}`,
  `Structure break: ${signal.structureBreakCandleTimestamp ? sessionService.formatEt(signal.structureBreakCandleTimestamp) : 'n/a'}`,
  '',
  'Continuation',
  `Confirmation: ${signal.continuationCandleTimestamp ? sessionService.formatEt(signal.continuationCandleTimestamp) : 'n/a'}`,
  `Close: ${signal.continuationClose === undefined ? 'n/a' : formatPrice(signal.continuationClose)}`,
  '',
  `Setup ready: ${signal.setupReadyAt ? sessionService.formatEt(signal.setupReadyAt) : 'n/a'}`,
  '',
  'Setup confirmed. Review 1m for discretionary entry.',
  'RESEARCH ONLY',
  'NO TRADE RECOMMENDATION',
].join('\n');
