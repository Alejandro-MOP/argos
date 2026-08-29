import type { BrokerProductProfile, TransactionCostInput, TransactionCostResult } from '../src/models/TransactionCost';
import {
  BROKER_PRODUCT_PROFILES,
  findBrokerProductProfile,
} from '../src/transactionCosts/BrokerProductProfileCatalog';
import {
  TransactionCostCalculationError,
  TransactionCostCalculator,
} from '../src/transactionCosts/TransactionCostCalculator';
import { TransactionCostService } from '../src/services/TransactionCostService';

const AS_OF = '2026-08-28T12:00:00.000Z';

const buildService = () => new TransactionCostService(new TransactionCostCalculator());

const request = (overrides: Record<string, unknown> = {}) => ({
  brokerProfileId: 'BITSO_CRYPTO_MXN',
  entryNotional: {
    amount: 5_000,
    currency: 'MXN',
  },
  grossTargetPercent: 2,
  buyExecution: 'TAKER',
  sellExecution: 'TAKER',
  asOf: AS_OF,
  ...overrides,
});

describe('TransactionCostService', () => {
  it('evaluates the validated BITSO_CRYPTO_MXN taker/taker regression case', () => {
    const evaluation = buildService().evaluate(request());

    expect(evaluation.result.grossProfit).toEqual({ amount: 100, currency: 'MXN' });
    expect(evaluation.result.buyCost.fee).toEqual({ amount: 39, currency: 'MXN' });
    expect(evaluation.result.sellCost.fee).toEqual({ amount: 39.78, currency: 'MXN' });
    expect(evaluation.result.roundTripCost).toEqual({ amount: 78.78, currency: 'MXN' });
    expect(evaluation.result.totalCashRequired).toEqual({ amount: 5039, currency: 'MXN' });
    expect(evaluation.result.netProfit).toEqual({ amount: 21.22, currency: 'MXN' });
    expect(evaluation.result.netReturnPercent).toBe(0.4244);
    expect(evaluation.result.breakEvenGrossTargetPercent).toBe(1.572264);
    expect(evaluation.result.grossTargetBelowBreakEven).toBe(false);
    expect(evaluation.interpretation).toEqual({
      grossMarketMovementPercent: 2,
      netInvestorReturnPercent: 0.4244,
      breakEvenPercent: 1.572264,
      targetCoversModeledCosts: true,
    });
  });

  it('evaluates BITSO_CRYPTO_MXN maker/maker', () => {
    const evaluation = buildService().evaluate(request({ buyExecution: 'MAKER', sellExecution: 'MAKER' }));

    expect(evaluation.result.buyCost.fee).toEqual({ amount: 30, currency: 'MXN' });
    expect(evaluation.result.sellCost.fee).toEqual({ amount: 30.6, currency: 'MXN' });
    expect(evaluation.result.netProfit).toEqual({ amount: 39.4, currency: 'MXN' });
    expect(evaluation.result.breakEvenGrossTargetPercent).toBe(1.207243);
  });

  it('evaluates BITSO_CRYPTO_USDC taker/taker', () => {
    const evaluation = buildService().evaluate(
      request({
        brokerProfileId: 'BITSO_CRYPTO_USDC',
        entryNotional: { amount: 5_000, currency: 'USDC' },
      }),
    );

    expect(evaluation.result.buyCost.fee).toEqual({ amount: 18, currency: 'USDC' });
    expect(evaluation.result.sellCost.fee).toEqual({ amount: 18.36, currency: 'USDC' });
    expect(evaluation.result.netProfit).toEqual({ amount: 63.64, currency: 'USDC' });
    expect(evaluation.result.breakEvenGrossTargetPercent).toBe(0.722601);
  });

  it('accepts grossTargetPercent = 0', () => {
    const evaluation = buildService().evaluate(request({ grossTargetPercent: 0 }));

    expect(evaluation.result.grossTargetPercent).toBe(0);
    expect(evaluation.result.netProfit.amount).toBeLessThan(0);
    expect(evaluation.interpretation.targetCoversModeledCosts).toBe(false);
  });

  it('rejects unknown broker profiles', () => {
    expect(() => buildService().evaluate(request({ brokerProfileId: 'UNKNOWN_PROFILE' }))).toThrow(
      expect.objectContaining({ code: 'broker-profile-not-found', statusCode: 404 }),
    );
  });

  it('rejects currency mismatch', () => {
    expect(() => buildService().evaluate(request({ entryNotional: { amount: 5_000, currency: 'USDC' } }))).toThrow(
      expect.objectContaining({ code: 'currency-mismatch', statusCode: 400 }),
    );
  });

  it.each([
    ['missing brokerProfileId', { brokerProfileId: undefined }, 'missing-broker-profile-id'],
    ['missing entryNotional', { entryNotional: undefined }, 'missing-entry-notional'],
    ['invalid capital', { entryNotional: { amount: '5000', currency: 'MXN' } }, 'invalid-capital'],
    ['negative capital', { entryNotional: { amount: -1, currency: 'MXN' } }, 'invalid-capital'],
    ['missing currency', { entryNotional: { amount: 5_000 } }, 'currency-mismatch'],
    ['missing target', { grossTargetPercent: undefined }, 'invalid-gross-target'],
    ['non numeric target', { grossTargetPercent: '2' }, 'invalid-gross-target'],
    ['negative target', { grossTargetPercent: -0.01 }, 'invalid-gross-target'],
    ['invalid buy execution', { buyExecution: 'LIMIT' }, 'invalid-execution-mode'],
    ['invalid sell execution', { sellExecution: 'MARKET' }, 'invalid-execution-mode'],
    ['invalid asOf', { asOf: 'nope' }, 'invalid-as-of'],
  ])('rejects %s', (_caseName, overrides, expectedCode) => {
    expect(() => buildService().evaluate(request(overrides))).toThrow(
      expect.objectContaining({ code: expectedCode }),
    );
  });

  it('accepts valid asOf and respects profile effective date', () => {
    expect(() => buildService().evaluate(request({ asOf: AS_OF }))).not.toThrow();
    expect(() => buildService().evaluate(request({ asOf: '2026-08-27T23:59:59.999Z' }))).toThrow(
      expect.objectContaining({ code: 'fee-schedule-not-effective', statusCode: 400 }),
    );
  });

  it('maps calculator break-even errors as 422 application errors', () => {
    const calculator = {
      evaluate: jest.fn(() => {
        throw new TransactionCostCalculationError('No break-even', 'break-even-not-found');
      }),
    };
    const service = new TransactionCostService(calculator, findBrokerProductProfile);

    expect(() => service.evaluate(request())).toThrow(
      expect.objectContaining({ code: 'break-even-not-found', statusCode: 422 }),
    );
  });

  it('derives interpretation from TransactionCostResult instead of recalculating financial math', () => {
    const profile = BROKER_PRODUCT_PROFILES[0] as BrokerProductProfile;
    const calculator = {
      evaluate: jest.fn((): TransactionCostResult => ({
        brokerProfileId: 'BITSO_CRYPTO_MXN',
        broker: 'BITSO',
        product: 'Crypto spot vs MXN',
        feeScheduleVersion: 'test',
        effectiveFrom: '2026-08-28T00:00:00.000Z',
        sourceLabel: 'test',
        verifiedAt: '2026-08-28T00:00:00.000Z',
        entryNotional: { amount: 5_000, currency: 'MXN' },
        grossTargetPercent: 9.99,
        grossExitValue: { amount: 5_499.5, currency: 'MXN' },
        exitNotional: { amount: 5_499.5, currency: 'MXN' },
        grossProfit: { amount: 499.5, currency: 'MXN' },
        buyExecutionMode: 'TAKER',
        sellExecutionMode: 'TAKER',
        buyCost: {
          notional: { amount: 5_000, currency: 'MXN' },
          fee: { amount: 1, currency: 'MXN' },
          feePercentOfNotional: 0.02,
          ruleType: 'PERCENTAGE_NOTIONAL',
          appliedMinimum: false,
          appliedMaximum: false,
        },
        sellCost: {
          notional: { amount: 5_499.5, currency: 'MXN' },
          fee: { amount: 1, currency: 'MXN' },
          feePercentOfNotional: 0.02,
          ruleType: 'PERCENTAGE_NOTIONAL',
          appliedMinimum: false,
          appliedMaximum: false,
        },
        roundTripCost: { amount: 2, currency: 'MXN' },
        totalCashRequired: { amount: 5_001, currency: 'MXN' },
        netProfit: { amount: 497.5, currency: 'MXN' },
        netReturnPercent: 8.88,
        breakEvenGrossTargetPercent: 7.77,
        grossTargetBelowBreakEven: true,
        assumptions: {
          spreadIncluded: false,
          slippageIncluded: false,
          fundingCostsIncluded: false,
          withdrawalCostsIncluded: false,
          fxCostsIncluded: false,
        },
      })),
    };
    const service = new TransactionCostService(calculator, () => profile);

    const evaluation = service.evaluate(request());

    expect(evaluation.interpretation).toEqual({
      grossMarketMovementPercent: 9.99,
      netInvestorReturnPercent: 8.88,
      breakEvenPercent: 7.77,
      targetCoversModeledCosts: false,
    });
  });

  it('delegates calculation to TransactionCostCalculator with normalized input', () => {
    const profile = BROKER_PRODUCT_PROFILES[0] as BrokerProductProfile;
    const calculator = {
      evaluate: jest.fn(new TransactionCostCalculator().evaluate.bind(new TransactionCostCalculator())),
    };
    const service = new TransactionCostService(calculator, () => profile);

    service.evaluate(
      request({
        buyExecution: 'taker',
        sellExecution: 'maker',
        entryNotional: { amount: 1_000, currency: 'mxn' },
      }),
    );

    expect(calculator.evaluate).toHaveBeenCalledWith(
      expect.objectContaining<TransactionCostInput>({
        entryNotional: { amount: 1_000, currency: 'MXN' },
        grossTargetPercent: 2,
        buyExecutionMode: 'TAKER',
        sellExecutionMode: 'MAKER',
        asOf: new Date(AS_OF),
      }),
      profile,
    );
  });
});
