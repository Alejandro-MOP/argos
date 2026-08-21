import type { Signal } from '../models/Signal';

export type TargetFeasibilityAssessment = 'reasonable' | 'aggressive' | 'very-aggressive';

export interface TradePlanConfig {
  stopLossPercent: number;
  targetMinPercent: number;
  targetMaxPercent: number;
}

export interface TradePlan {
  entry: number;
  financialStop: {
    percent: number;
    price: number;
    estimatedLoss?: number;
  };
  technicalStop: {
    price: number;
    source: string;
  };
  targets: {
    min: {
      percent: number;
      price: number;
      estimatedProfit?: number;
      endingCapital?: number;
    };
    max: {
      percent: number;
      price: number;
      estimatedProfit?: number;
      endingCapital?: number;
    };
  };
  capital?: number;
  targetFeasibility: {
    minTargetPercent: number;
    maxTargetPercent: number;
    assessment: TargetFeasibilityAssessment;
  };
}

export const calculateTradePlan = (
  signal: Signal,
  config: TradePlanConfig,
  capital?: number,
): TradePlan | undefined => {
  if (signal.entry <= 0 || !Number.isFinite(signal.entry)) {
    return undefined;
  }

  validateTradePlanConfig(config);

  const normalizedCapital = normalizeCapital(capital);
  const estimatedLoss = normalizedCapital
    ? roundMoney(normalizedCapital * (config.stopLossPercent / 100))
    : undefined;
  const estimatedProfitMin = normalizedCapital
    ? roundMoney(normalizedCapital * (config.targetMinPercent / 100))
    : undefined;
  const estimatedProfitMax = normalizedCapital
    ? roundMoney(normalizedCapital * (config.targetMaxPercent / 100))
    : undefined;

  return {
    entry: roundMoney(signal.entry),
    financialStop: {
      percent: roundPercent(config.stopLossPercent),
      price: roundMoney(signal.entry * (1 - config.stopLossPercent / 100)),
      estimatedLoss,
    },
    technicalStop: {
      price: roundMoney(signal.stop),
      source: 'last-candle-low',
    },
    targets: {
      min: {
        percent: roundPercent(config.targetMinPercent),
        price: roundMoney(signal.entry * (1 + config.targetMinPercent / 100)),
        estimatedProfit: estimatedProfitMin,
        endingCapital:
          normalizedCapital && estimatedProfitMin !== undefined
            ? roundMoney(normalizedCapital + estimatedProfitMin)
            : undefined,
      },
      max: {
        percent: roundPercent(config.targetMaxPercent),
        price: roundMoney(signal.entry * (1 + config.targetMaxPercent / 100)),
        estimatedProfit: estimatedProfitMax,
        endingCapital:
          normalizedCapital && estimatedProfitMax !== undefined
            ? roundMoney(normalizedCapital + estimatedProfitMax)
            : undefined,
      },
    },
    capital: normalizedCapital ? roundMoney(normalizedCapital) : undefined,
    targetFeasibility: {
      minTargetPercent: roundPercent(config.targetMinPercent),
      maxTargetPercent: roundPercent(config.targetMaxPercent),
      assessment: assessTargetFeasibility(signal, config),
    },
  };
};

export const validateTradePlanConfig = (config: TradePlanConfig): void => {
  if (!Number.isFinite(config.stopLossPercent) || config.stopLossPercent <= 0) {
    throw new Error('TRADE_STOP_LOSS_PERCENT must be greater than 0');
  }

  if (!Number.isFinite(config.targetMinPercent) || config.targetMinPercent <= 0) {
    throw new Error('TRADE_TARGET_MIN_PERCENT must be greater than 0');
  }

  if (
    !Number.isFinite(config.targetMaxPercent) ||
    config.targetMaxPercent <= config.targetMinPercent
  ) {
    throw new Error('TRADE_TARGET_MAX_PERCENT must be greater than TRADE_TARGET_MIN_PERCENT');
  }
};

const normalizeCapital = (capital: number | undefined): number | undefined => {
  if (capital === undefined) {
    return undefined;
  }

  return Number.isFinite(capital) && capital > 0 ? capital : undefined;
};

const assessTargetFeasibility = (
  signal: Signal,
  config: TradePlanConfig,
): TargetFeasibilityAssessment => {
  const technicalMovePercent = Math.abs(signal.entry - signal.stop) / signal.entry * 100;

  if (!Number.isFinite(technicalMovePercent) || technicalMovePercent <= 0) {
    return 'very-aggressive';
  }

  if (config.targetMaxPercent <= technicalMovePercent * 2) {
    return 'reasonable';
  }

  if (config.targetMaxPercent <= technicalMovePercent * 4) {
    return 'aggressive';
  }

  return 'very-aggressive';
};

const roundMoney = (value: number): number => round(value, 2);
const roundPercent = (value: number): number => round(value, 2);

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
