import type { Candle } from '../models/Candle';
import type { OrbFvgCandleSnapshot, OrbFvgDirection } from '../models/OrbFvgSignal';

export interface OpeningRangeWindow {
  sessionDate: string;
  startsAt: Date;
  endsAt: Date;
  regularSessionEndsAt: Date;
}

export interface BreakoutDetection {
  direction: OrbFvgDirection;
  candle: Candle;
  breakoutDistancePct: number;
  wickBreakout: boolean;
  closeBreakout: boolean;
}

export interface FvgDetection {
  direction: OrbFvgDirection;
  candle1: Candle;
  candle2: Candle;
  candle3: Candle;
  fvgLow: number;
  fvgHigh: number;
  fvgSizePct: number;
}

export interface OrbFvgOutcomeEvaluation {
  status: 'OPEN' | 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXPIRED';
  outcome?: 'WIN' | 'LOSS' | 'AMBIGUOUS' | 'EXPIRED';
  highestPriceSeen: number;
  lowestPriceSeen: number;
  mfePct: number;
  maePct: number;
  maxR: number;
  targetReachedAt?: Date;
  stopReachedAt?: Date;
  resolvedAt?: Date;
}

const ONE_MINUTE_MS = 60_000;

export const toCandleSnapshot = (candle: Candle): OrbFvgCandleSnapshot => ({
  timestamp: candle.timestamp,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
});

export const calculateOpeningRangeSizePct = (high: number, low: number): number =>
  roundPercent(((high - low) / low) * 100);

export const findOpeningRangeCandle = (
  candles: Candle[],
  window: OpeningRangeWindow,
  now: Date,
): Candle | undefined => {
  if (now.getTime() < window.endsAt.getTime()) {
    return undefined;
  }

  return candles
    .filter((candle) => candle.timestamp.getTime() >= window.startsAt.getTime())
    .filter((candle) => candle.timestamp.getTime() < window.endsAt.getTime())
    .find((candle) => candle.timestamp.getTime() + 15 * ONE_MINUTE_MS <= now.getTime());
};

export const filterClosedOneMinuteCandles = (candles: Candle[], now: Date): Candle[] =>
  candles
    .filter((candle) => candle.timestamp.getTime() + ONE_MINUTE_MS <= now.getTime())
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

export const detectBreakout = (openingRangeHigh: number, openingRangeLow: number, candle: Candle): BreakoutDetection | undefined => {
  if (candle.close > openingRangeHigh && candle.open <= openingRangeHigh) {
    return {
      direction: 'LONG',
      candle,
      breakoutDistancePct: roundPercent(((candle.close - openingRangeHigh) / openingRangeHigh) * 100),
      wickBreakout: candle.high > openingRangeHigh,
      closeBreakout: true,
    };
  }

  if (candle.close < openingRangeLow && candle.open >= openingRangeLow) {
    return {
      direction: 'SHORT',
      candle,
      breakoutDistancePct: roundPercent(((openingRangeLow - candle.close) / openingRangeLow) * 100),
      wickBreakout: candle.low < openingRangeLow,
      closeBreakout: true,
    };
  }

  return undefined;
};

export const detectFvg = (candle1: Candle, candle2: Candle, candle3: Candle): FvgDetection | undefined => {
  void candle2;

  if (candle3.low > candle1.high) {
    return {
      direction: 'LONG',
      candle1,
      candle2,
      candle3,
      fvgLow: candle1.high,
      fvgHigh: candle3.low,
      fvgSizePct: roundPercent(((candle3.low - candle1.high) / candle1.high) * 100),
    };
  }

  if (candle3.high < candle1.low) {
    return {
      direction: 'SHORT',
      candle1,
      candle2,
      candle3,
      fvgLow: candle3.high,
      fvgHigh: candle1.low,
      fvgSizePct: roundPercent(((candle1.low - candle3.high) / candle1.low) * 100),
    };
  }

  return undefined;
};

export const calculateTarget2R = (direction: OrbFvgDirection, entry: number, risk: number): number =>
  direction === 'LONG' ? roundPrice(entry + 2 * risk) : roundPrice(entry - 2 * risk);

export const calculateRiskPct = (risk: number, entry: number): number => roundPercent((risk / entry) * 100);

export const evaluateOrbFvgOutcome = (params: {
  direction: OrbFvgDirection;
  entryPrice: number;
  stopPrice: number;
  target2RPrice: number;
  signalAt: Date;
  expiresAt: Date;
  candles: Candle[];
  previousHighestPriceSeen?: number;
  previousLowestPriceSeen?: number;
  now?: Date;
}): OrbFvgOutcomeEvaluation => {
  const sorted = params.candles
    .filter((candle) => candle.timestamp.getTime() > params.signalAt.getTime())
    .filter((candle) => candle.timestamp.getTime() <= params.expiresAt.getTime())
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
  let highestPriceSeen = Math.max(params.entryPrice, params.previousHighestPriceSeen ?? params.entryPrice);
  let lowestPriceSeen = Math.min(params.entryPrice, params.previousLowestPriceSeen ?? params.entryPrice);
  let targetReachedAt: Date | undefined;
  let stopReachedAt: Date | undefined;
  let status: OrbFvgOutcomeEvaluation['status'] = 'OPEN';

  for (const candle of sorted) {
    highestPriceSeen = Math.max(highestPriceSeen, candle.high);
    lowestPriceSeen = Math.min(lowestPriceSeen, candle.low);
    const hitTarget = params.direction === 'LONG'
      ? candle.high >= params.target2RPrice
      : candle.low <= params.target2RPrice;
    const hitStop = params.direction === 'LONG'
      ? candle.low <= params.stopPrice
      : candle.high >= params.stopPrice;

    if (hitTarget && hitStop) {
      targetReachedAt = candle.timestamp;
      stopReachedAt = candle.timestamp;
      status = 'AMBIGUOUS';
      break;
    }

    if (hitTarget) {
      targetReachedAt = candle.timestamp;
      status = 'WIN';
      break;
    }

    if (hitStop) {
      stopReachedAt = candle.timestamp;
      status = 'LOSS';
      break;
    }
  }

  const now = params.now ?? new Date();

  if (status === 'OPEN' && now.getTime() >= params.expiresAt.getTime()) {
    status = 'EXPIRED';
  }

  const mfePct = params.direction === 'LONG'
    ? roundPercent(((highestPriceSeen - params.entryPrice) / params.entryPrice) * 100)
    : roundPercent(((params.entryPrice - lowestPriceSeen) / params.entryPrice) * 100);
  const maePct = params.direction === 'LONG'
    ? roundPercent(((lowestPriceSeen - params.entryPrice) / params.entryPrice) * 100)
    : roundPercent(((params.entryPrice - highestPriceSeen) / params.entryPrice) * 100);
  const maxR = roundRatio((mfePct / 100 * params.entryPrice) / Math.abs(params.entryPrice - params.stopPrice));

  return {
    status,
    outcome: status === 'OPEN' ? undefined : status,
    highestPriceSeen: roundPrice(highestPriceSeen),
    lowestPriceSeen: roundPrice(lowestPriceSeen),
    mfePct,
    maePct,
    maxR,
    targetReachedAt,
    stopReachedAt,
    resolvedAt: status === 'OPEN' ? undefined : (targetReachedAt ?? stopReachedAt ?? params.expiresAt),
  };
};

export const calculateRLevelPrice = (direction: OrbFvgDirection, entry: number, risk: number, rMultiple: number): number =>
  direction === 'LONG' ? roundPrice(entry + rMultiple * risk) : roundPrice(entry - rMultiple * risk);

export const roundPrice = (value: number): number => round(value, 8);
export const roundPercent = (value: number): number => round(value, 4);
export const roundRatio = (value: number): number => round(value, 4);

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
