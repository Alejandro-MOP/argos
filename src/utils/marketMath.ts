import type { Candle } from '../models/Candle';

export const averageVolume = (candles: Candle[]): number => {
  if (candles.length === 0) {
    return 0;
  }

  const totalVolume = candles.reduce((total, candle) => total + candle.volume, 0);
  return totalVolume / candles.length;
};

export const highestHigh = (candles: Candle[]): number => {
  return Math.max(...candles.map((candle) => candle.high));
};

export const lowestLow = (candles: Candle[]): number => {
  return Math.min(...candles.map((candle) => candle.low));
};

export const calculateEmaSeries = (values: number[], period: number): number[] => {
  if (values.length === 0 || period <= 0) {
    return [];
  }

  const smoothing = 2 / (period + 1);
  const emaSeries: number[] = [];

  values.forEach((value, index) => {
    if (index === 0) {
      emaSeries.push(value);
      return;
    }

    const previousEma = emaSeries[index - 1];
    emaSeries.push(value * smoothing + previousEma * (1 - smoothing));
  });

  return emaSeries;
};

export const calculateRsi = (candles: Candle[], period: number): number | null => {
  if (candles.length <= period) {
    return null;
  }

  const recentCandles = candles.slice(-(period + 1));
  let gains = 0;
  let losses = 0;

  for (let index = 1; index < recentCandles.length; index += 1) {
    const change = recentCandles[index].close - recentCandles[index - 1].close;

    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
};

export const clampScore = (score: number, maxScore: number): number => {
  return Math.max(0, Math.min(maxScore, score));
};
