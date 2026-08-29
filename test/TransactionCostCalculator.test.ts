import type {
  BrokerProductProfile,
  BrokerProductProfileId,
  CurrencyCode,
  ExecutionMode,
  FeeRule,
} from '../src/models/TransactionCost';
import {
  BROKER_PRODUCT_PROFILES,
  findBrokerProductProfile,
} from '../src/transactionCosts/BrokerProductProfileCatalog';
import {
  TransactionCostCalculationError,
  TransactionCostCalculator,
} from '../src/transactionCosts/TransactionCostCalculator';

const calculator = new TransactionCostCalculator();
const EFFECTIVE_DATE = new Date('2026-08-28T12:00:00.000Z');

function profile(profileId: BrokerProductProfileId): BrokerProductProfile {
  const found = findBrokerProductProfile(profileId, EFFECTIVE_DATE);

  if (!found) {
    throw new Error(`Missing test profile ${profileId}`);
  }

  return structuredClone(found);
}

function percentageRule(
  percent: number,
  currency: CurrencyCode = 'MXN',
  minimumAmount?: number,
  maximumAmount?: number,
): FeeRule {
  return {
    type: 'PERCENTAGE_NOTIONAL',
    percent,
    minimumAmount:
      minimumAmount === undefined
        ? undefined
        : {
            amount: minimumAmount,
            currency,
          },
    maximumAmount:
      maximumAmount === undefined
        ? undefined
        : {
            amount: maximumAmount,
            currency,
          },
  };
}

function profileWithRules(params: {
  percent: number;
  minimumAmount?: number;
  maximumAmount?: number;
  currency?: CurrencyCode;
}): BrokerProductProfile {
  const base = profile('BITSO_CRYPTO_MXN');
  const currency = params.currency ?? 'MXN';
  const rule = percentageRule(params.percent, currency, params.minimumAmount, params.maximumAmount);

  return {
    ...base,
    quoteCurrency: currency,
    feeSchedule: {
      ...base.feeSchedule,
      tradeCosts: {
        makerBuy: rule,
        takerBuy: rule,
        makerSell: rule,
        takerSell: rule,
      },
    },
  };
}

function evaluate(params?: {
  target?: number;
  capital?: number;
  profile?: BrokerProductProfile;
  buyMode?: ExecutionMode;
  sellMode?: ExecutionMode;
  currency?: CurrencyCode;
}) {
  const selectedProfile = params?.profile ?? profile('BITSO_CRYPTO_MXN');
  const currency = params?.currency ?? selectedProfile.quoteCurrency;

  return calculator.evaluate(
    {
      entryNotional: {
        amount: params?.capital ?? 5_000,
        currency,
      },
      grossTargetPercent: params?.target ?? 2,
      buyExecutionMode: params?.buyMode ?? 'TAKER',
      sellExecutionMode: params?.sellMode ?? 'TAKER',
      asOf: EFFECTIVE_DATE,
    },
    selectedProfile,
  );
}

describe('TransactionCostCalculator', () => {
  it('handles zero transaction fees', () => {
    const result = evaluate({
      profile: profileWithRules({ percent: 0 }),
      target: 1,
    });

    expect(result.roundTripCost.amount).toBe(0);
    expect(result.breakEvenGrossTargetPercent).toBe(0);
    expect(result.netReturnPercent).toBe(1);
    expect(result.grossTargetBelowBreakEven).toBe(false);
  });

  it.each([
    ['MAKER', 'MAKER', 30, 30.6, 60.6, 39.4],
    ['MAKER', 'TAKER', 30, 39.78, 69.78, 30.22],
    ['TAKER', 'MAKER', 39, 30.6, 69.6, 30.4],
    ['TAKER', 'TAKER', 39, 39.78, 78.78, 21.22],
  ] satisfies [ExecutionMode, ExecutionMode, number, number, number, number][])(
    'calculates Bitso MXN %s/%s fees',
    (buyMode, sellMode, expectedBuyCost, expectedSellCost, expectedRoundTrip, expectedNetProfit) => {
      const result = evaluate({ buyMode, sellMode, capital: 5_000, target: 2 });

      expect(result.buyCost.fee.amount).toBe(expectedBuyCost);
      expect(result.sellCost.fee.amount).toBe(expectedSellCost);
      expect(result.roundTripCost.amount).toBe(expectedRoundTrip);
      expect(result.netProfit.amount).toBe(expectedNetProfit);
      expect(result.totalCashRequired.amount).toBe(5_000 + expectedBuyCost);
    },
  );

  it('accepts gross target 0 as a valid loss after costs', () => {
    const result = evaluate({ target: 0, capital: 1_000 });

    expect(result.grossProfit.amount).toBe(0);
    expect(result.netProfit.amount).toBeLessThan(0);
    expect(result.grossTargetBelowBreakEven).toBe(true);
  });

  it('marks targets below, equal to, and above break-even', () => {
    const below = evaluate({ target: 1 });
    const atBreakEven = evaluate({ target: below.breakEvenGrossTargetPercent });
    const above = evaluate({ target: 2 });

    expect(below.grossTargetBelowBreakEven).toBe(true);
    expect(Math.abs(atBreakEven.netProfit.amount)).toBeLessThanOrEqual(0.01);
    expect(atBreakEven.grossTargetBelowBreakEven).toBe(false);
    expect(above.grossTargetBelowBreakEven).toBe(false);
  });

  it('calculates sell fee over exit notional, not entry notional', () => {
    const result = evaluate({ capital: 5_000, target: 2, sellMode: 'TAKER' });

    expect(result.exitNotional.amount).toBe(5_100);
    expect(result.sellCost.notional.amount).toBe(5_100);
    expect(result.sellCost.fee.amount).toBe(39.78);
  });

  it('applies minimum fee limits', () => {
    const result = evaluate({
      profile: profileWithRules({ percent: 0.1, minimumAmount: 10 }),
      capital: 100,
      target: 10,
    });

    expect(result.buyCost.appliedMinimum).toBe(true);
    expect(result.sellCost.appliedMinimum).toBe(true);
    expect(result.buyCost.fee.amount).toBe(10);
    expect(result.sellCost.fee.amount).toBe(10);
  });

  it('applies maximum fee limits', () => {
    const result = evaluate({
      profile: profileWithRules({ percent: 10, maximumAmount: 5 }),
      capital: 1_000,
      target: 10,
    });

    expect(result.buyCost.appliedMaximum).toBe(true);
    expect(result.sellCost.appliedMaximum).toBe(true);
    expect(result.buyCost.fee.amount).toBe(5);
    expect(result.sellCost.fee.amount).toBe(5);
  });

  it('shows minimum fees are heavier on small capital than large capital', () => {
    const minFeeProfile = profileWithRules({ percent: 0.1, minimumAmount: 10 });
    const small = evaluate({ profile: minFeeProfile, capital: 100, target: 2 });
    const large = evaluate({ profile: minFeeProfile, capital: 10_000, target: 2 });

    expect(small.netReturnPercent).toBeLessThan(large.netReturnPercent);
  });

  it.each([
    ['invalid-capital', { capital: 0 }],
    ['invalid-gross-target', { target: -0.01 }],
  ])('rejects %s', (expectedCode, params) => {
    expect(() => evaluate(params)).toThrow(
      expect.objectContaining({
        code: expectedCode,
      }),
    );
  });

  it('rejects invalid currency/profile combinations', () => {
    expect(() => evaluate({ profile: profile('BITSO_CRYPTO_USDC'), currency: 'MXN' })).toThrow(
      expect.objectContaining({
        code: 'currency-mismatch',
      }),
    );
  });

  it.each([
    ['negative fee percent', profileWithRules({ percent: -0.01 })],
    ['maximum lower than minimum', profileWithRules({ percent: 1, minimumAmount: 10, maximumAmount: 5 })],
    ['fee limit with wrong currency', profileWithRules({ percent: 1, minimumAmount: 1, currency: 'USD' })],
  ])('rejects invalid fee schedule: %s', (_caseName, invalidProfile) => {
    if (_caseName === 'fee limit with wrong currency') {
      invalidProfile.quoteCurrency = 'MXN';
    }

    expect(() => evaluate({ profile: invalidProfile })).toThrow(
      expect.objectContaining({
        code: 'invalid-fee-schedule',
      }),
    );
  });

  it('fails with a controlled error when break-even cannot be found in bounds', () => {
    const expensiveProfile = profileWithRules({ percent: 0, minimumAmount: 1_500 });

    expect(() => evaluate({ profile: expensiveProfile, target: 1, capital: 1_000 })).toThrow(
      expect.objectContaining({
        code: 'break-even-not-found',
      }),
    );
  });

  it('converges break-even with piecewise min/max fees', () => {
    const minFeeProfile = profileWithRules({ percent: 0.1, minimumAmount: 1 });
    const result = evaluate({ profile: minFeeProfile, capital: 1_000, target: 2 });
    const breakEvenResult = evaluate({
      profile: minFeeProfile,
      capital: 1_000,
      target: result.breakEvenGrossTargetPercent,
    });

    expect(result.breakEvenGrossTargetPercent).toBeGreaterThan(0);
    expect(Math.abs(breakEvenResult.netProfit.amount)).toBeLessThanOrEqual(0.01);
  });

  it('respects profile effective dates', () => {
    expect(findBrokerProductProfile('BITSO_CRYPTO_MXN', EFFECTIVE_DATE)).toBeDefined();
    expect(findBrokerProductProfile('BITSO_CRYPTO_MXN', new Date('2026-08-27T23:59:59.999Z'))).toBeUndefined();

    expect(() =>
      calculator.evaluate(
        {
          entryNotional: {
            amount: 1_000,
            currency: 'MXN',
          },
          grossTargetPercent: 1,
          buyExecutionMode: 'TAKER',
          sellExecutionMode: 'TAKER',
          asOf: new Date('2026-08-27T23:59:59.999Z'),
        },
        profile('BITSO_CRYPTO_MXN'),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'fee-schedule-not-effective',
      }),
    );
  });

  it('exposes versioned Bitso profiles with documented assumptions', () => {
    expect(BROKER_PRODUCT_PROFILES.map((candidate) => candidate.id)).toEqual([
      'BITSO_CRYPTO_MXN',
      'BITSO_CRYPTO_USDC',
    ]);

    const result = evaluate({ profile: profile('BITSO_CRYPTO_MXN'), capital: 1_000, target: 1 });

    expect(result.feeScheduleVersion).toContain('2026-08-28');
    expect(result.sourceUrl).toBe('https://bitso.com/fees');
    expect(result.assumptions).toEqual({
      spreadIncluded: false,
      slippageIncluded: false,
      fundingCostsIncluded: false,
      withdrawalCostsIncluded: false,
      fxCostsIncluded: false,
    });
  });

  it.each([
    ['BITSO_CRYPTO_MXN', 'MXN', 1.572264],
    ['BITSO_CRYPTO_USDC', 'USDC', 0.722601],
  ] satisfies [BrokerProductProfileId, CurrencyCode, number][])(
    'calculates %s taker/taker sanity cases across capital and target ranges',
    (profileId, currency, expectedBreakEven) => {
      const selectedProfile = profile(profileId);
      const breakEvenByCapital = [1_000, 5_000, 10_000].map((capital) =>
        calculator.evaluate(
          {
            entryNotional: {
              amount: capital,
              currency,
            },
            grossTargetPercent: 2,
            buyExecutionMode: 'TAKER',
            sellExecutionMode: 'TAKER',
            asOf: EFFECTIVE_DATE,
          },
          selectedProfile,
        ).breakEvenGrossTargetPercent,
      );

      expect(breakEvenByCapital).toEqual([expectedBreakEven, expectedBreakEven, expectedBreakEven]);

      [0.5, 0.75, 1, 1.5, 2, 3].forEach((target) => {
        const result = calculator.evaluate(
          {
            entryNotional: {
              amount: 5_000,
              currency,
            },
            grossTargetPercent: target,
            buyExecutionMode: 'TAKER',
            sellExecutionMode: 'TAKER',
            asOf: EFFECTIVE_DATE,
          },
          selectedProfile,
        );

        expect(result.entryNotional.amount).toBe(5_000);
        expect(result.grossTargetBelowBreakEven).toBe(target < expectedBreakEven);
      });
    },
  );

  it('rejects invalid execution modes defensively', () => {
    expect(() =>
      evaluate({
        buyMode: 'LIMIT' as ExecutionMode,
      }),
    ).toThrow(TransactionCostCalculationError);
  });
});
