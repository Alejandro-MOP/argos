import type { PersistedOrbFvgSignalSnapshot } from '../models/OrbFvgSignal';
import { OrbFvgSessionService } from './OrbFvgSessionService';

const sessionService = new OrbFvgSessionService();

export const formatOrbFvgDetectionAlert = (signal: PersistedOrbFvgSignalSnapshot): string => [
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
  `Entry ref: ${formatPrice(signal.entryPrice)}`,
  `Stop ref: ${formatPrice(signal.stopPrice)}`,
  `Target 2R: ${formatPrice(signal.target2RPrice)}`,
  '',
  `Detected: ${sessionService.formatEt(signal.signalAt)}`,
  '',
  'RESEARCH ONLY',
  'NO TRADE RECOMMENDATION',
].join('\n');

export const formatOrbFvgResolutionAlert = (signal: PersistedOrbFvgSignalSnapshot): string => [
  '🧪 ARGOS ORB-FVG RESULT',
  '',
  `${signal.ticker} · ${signal.assetType} · ${signal.direction}`,
  `Outcome: ${signal.outcome ?? signal.status}`,
  `MFE: ${formatSignedPercent(signal.mfePct)}`,
  `MAE: ${formatSignedPercent(signal.maePct)}`,
  `Max R: ${signal.maxR.toFixed(2)}R`,
  signal.resolvedAt ? `Resolved: ${sessionService.formatEt(signal.resolvedAt)}` : '',
  '',
  'RESEARCH ONLY',
].filter(Boolean).join('\n');

const formatPrice = (value: number): string => value < 1 ? value.toFixed(6) : value.toFixed(2);
const formatSignedPercent = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

