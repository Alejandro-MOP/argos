import type { StrategyProfile } from '../src/models/StrategyProfile';
import { CALLBACKS, TelegramControlPresenter } from '../src/services/TelegramControlPresenter';

describe('TelegramControlPresenter', () => {
  const presenter = new TelegramControlPresenter();

  it('renders main menu with stable callback data', () => {
    expect(presenter.mainMenu()).toEqual({
      code: 'OK',
      text: 'ARGOS Control\n\nSelecciona una opción:',
      keyboard: {
        rows: [
          [
            { text: '📊 Research', callbackData: CALLBACKS.researchMenu },
            { text: '🔎 Market', callbackData: CALLBACKS.marketMenu },
          ],
          [
            { text: '💰 Costs', callbackData: CALLBACKS.costsMenu },
            { text: '⚙️ System', callbackData: CALLBACKS.systemMenu },
          ],
        ],
      },
    });
  });

  it('renders research menu', () => {
    const response = presenter.researchMenu();

    expect(response.text).toContain('Research');
    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '📊 Snapshot', callbackData: CALLBACKS.researchSnapshot },
      { text: '📈 Strategy Profiles', callbackData: CALLBACKS.researchProfiles },
      { text: '🧪 Forward Performance', callbackData: CALLBACKS.researchPerformance },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders market menu', () => {
    const response = presenter.marketMenu();

    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '🔎 Analyze Symbol', callbackData: CALLBACKS.marketAnalyze },
      { text: '🚀 Run Market Scan', callbackData: CALLBACKS.marketScan },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders costs menu', () => {
    const response = presenter.costsMenu();

    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '🇲🇽 Bitso MXN', callbackData: CALLBACKS.costsBitsoMxn },
      { text: '💵 Bitso USDC', callbackData: CALLBACKS.costsBitsoUsdc },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders system menu', () => {
    const response = presenter.systemMenu();

    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '❤️ Status', callbackData: CALLBACKS.systemStatus },
      { text: '❓ Help', callbackData: CALLBACKS.systemHelp },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders back navigation on helper responses', () => {
    expect(presenter.help().keyboard?.rows).toEqual([[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]]);
    expect(presenter.invalidCallback('bad').keyboard?.rows).toEqual([[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]]);
    expect(presenter.notImplemented('Research Snapshot').keyboard?.rows).toEqual([[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]]);
  });
});


describe('TelegramControlPresenter read-only research views', () => {
  const presenter = new TelegramControlPresenter();

  it('renders a compact Research Snapshot with values from the service', () => {
    const response = presenter.researchSnapshot({
      schemaVersion: '1',
      snapshot: {
        snapshotDate: '2026-08-29',
        generatedAt: '2026-08-29T10:00:00.000Z',
        timeZone: 'America/Mexico_City',
        strategyVersion: 'v-test',
      },
      dataQuality: {
        evidenceCount: 321,
        evaluationCount: 210,
        evidenceWithoutEvaluationCount: 111,
        evaluatedEvidenceCount: 210,
        evidenceWithMfeMaeCount: 200,
      },
      evidenceSummary: {
        totalEvidence: 204,
        scoreBuckets: { '80-84': 1, '85-89': 2, '90-94': 3, '95-100': 4 },
        operationalOpportunities: 87,
        operationalThreshold: 90,
      },
      evaluationStatuses: { OPEN: 9, CLOSED: 8, EXPIRED: 7, AMBIGUOUS: 6 },
      profileSampleSizes: [],
      globalTargetLadder: [],
      mfeMaeByProfile: [
        {
          assetType: 'STOCK',
          timeframe: '15m',
          scoreBucket: '90-94',
          strategyVersion: 'v-test',
          sampleSize: 55,
          avgMfePercent: 1.34,
          medianMfePercent: 1.1,
          avgMaePercent: -1.28,
          medianMaePercent: -1,
        },
      ],
      strategyProfiles: [],
      strategyProfileSemantics: {
        tradeOutcome: 'real semantics',
        marketReachability: 'real semantics',
        dataMaturity: 'real semantics',
        maePercentiles: 'real semantics',
      },
      watchProfiles: [],
      forwardPerformance: sampleForwardPerformance(),
    });

    expect(response.text).toContain('Eligible: 204');
    expect(response.text).toContain('Operational opportunities: 87');
    expect(response.text).toContain('MFE avg: 1.34%');
    expect(response.text).toContain('MAE avg: -1.28%');
    expect(response.text).not.toContain('{');
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '🔄 Refresh', callbackData: CALLBACKS.researchSnapshot });
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '⬅️ Back', callbackData: CALLBACKS.backResearch });
  });

  it('renders Strategy Profiles summary without a giant raw JSON payload', () => {
    const response = presenter.strategyProfiles({
      filters: {},
      semantics: {
        tradeOutcome: 'real trade semantics',
        marketReachability: 'real reach semantics',
        dataMaturity: 'real maturity semantics',
        maePercentiles: 'real mae semantics',
      },
      profiles: [sampleProfile({ assetType: 'CRYPTO', timeframe: '15m', scoreBucket: '90-94', sampleSize: 42 })],
    });

    expect(response.text).toContain('Profiles: 1');
    expect(response.text).toContain('CRYPTO · 15m · 90-94');
    expect(response.text).toContain('Samples: 42');
    expect(response.text).not.toContain('"profiles"');
    expect(response.text.length).toBeLessThan(1200);
  });

  it('renders useful empty Strategy Profiles state', () => {
    const response = presenter.strategyProfiles({
      filters: {},
      semantics: {
        tradeOutcome: '',
        marketReachability: '',
        dataMaturity: '',
        maePercentiles: '',
      },
      profiles: [],
    });

    expect(response.text).toContain('Profiles: 0');
    expect(response.text).toContain('Sin perfiles disponibles todavía.');
  });

  it('renders Forward Performance metrics from returned values', () => {
    const response = presenter.forwardPerformance(sampleForwardPerformance());

    expect(response.text).toContain('Signals evaluated: 25');
    expect(response.text).toContain('MFE average: 2.45%');
    expect(response.text).toContain('MAE average: -0.75%');
    expect(response.text).toContain('Win rate: 66.67%');
    expect(response.text).toContain('Expectancy: 1.25%');
    expect(response.text).not.toContain('{');
  });

  it('renders useful empty Forward Performance state', () => {
    const response = presenter.forwardPerformance({ ...sampleForwardPerformance(), sampleSize: 0, experimentalTargets: [] });

    expect(response.text).toContain('Signals evaluated: 0');
    expect(response.text).toContain('Sin targets evaluados todavía.');
  });

  it('renders System Status without credentials', () => {
    const response = presenter.systemStatus({
      controlBot: 'ONLINE',
      database: 'CONNECTED',
      researchServices: 'AVAILABLE',
      mode: 'Local Development',
      controlTransport: 'Telegram Long Polling',
    });

    expect(response.text).toContain('Control Bot: Online');
    expect(response.text).toContain('Database: Connected');
    expect(response.text).not.toContain('postgres://');
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '🔄 Refresh', callbackData: CALLBACKS.systemStatus });
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '⬅️ Back', callbackData: CALLBACKS.backSystem });
  });

  it('renders safe service failure messages without stack traces', () => {
    const response = presenter.queryError('Research Snapshot');

    expect(response.code).toBe('ERROR');
    expect(response.text).toContain('ARGOS no pudo consultar Research Snapshot');
    expect(response.text).not.toContain('Error:');
    expect(response.text).not.toContain('at ');
  });
});


describe('TelegramControlPresenter transaction cost views', () => {
  const presenter = new TelegramControlPresenter();

  it('renders transaction cost prompts and action buttons', () => {
    expect(presenter.costsCapitalPrompt('BITSO MXN').text).toContain('Ingresa el capital');
    expect(presenter.costsTargetPrompt('BITSO MXN', 5000, 'MXN').text).toContain('$5,000.00 MXN');

    const executionPrompt = presenter.costsExecutionPrompt('BITSO MXN');
    expect(executionPrompt.text).toContain('Tipo de ejecución');
    expect(executionPrompt.keyboard?.rows.flat()).toContainEqual({ text: 'Maker', callbackData: CALLBACKS.costsMaker });
    expect(executionPrompt.keyboard?.rows.flat()).toContainEqual({ text: 'Taker', callbackData: CALLBACKS.costsTaker });
  });

  it('renders compact MXN transaction cost result from service values', () => {
    const response = presenter.transactionCostResult(sampleTransactionCostEvaluation(), 'BITSO MXN');

    expect(response.text).toContain('💰 TRANSACTION COSTS');
    expect(response.text).toContain('BITSO MXN');
    expect(response.text).toContain('$5,000.00 MXN');
    expect(response.text).toContain('$5,039.00 MXN');
    expect(response.text).toContain('+2.00%');
    expect(response.text).toContain('Execution:\nTaker');
    expect(response.text).toContain('Buy: $39.00 MXN');
    expect(response.text).toContain('Sell: $39.78 MXN');
    expect(response.text).toContain('Round trip: $78.78 MXN');
    expect(response.text).toContain('+$21.22 MXN');
    expect(response.text).toContain('+0.42%');
    expect(response.text).toContain('+1.57%');
    expect(response.text).toContain('✅ El target supera los costos modelados.');
    expect(response.text).toContain('No incluye spread, slippage, funding, withdrawals ni FX.');
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '🔄 New Calculation', callbackData: CALLBACKS.costsNew });
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '⬅️ Costs Menu', callbackData: CALLBACKS.costsMenu });
  });

  it('renders USDC without an ambiguous dollar symbol', () => {
    const evaluation = sampleTransactionCostEvaluation('USDC');

    const response = presenter.transactionCostResult(evaluation, 'BITSO USDC');

    expect(response.text).toContain('5,000.00 USDC');
    expect(response.text).toContain('Net profit:\n+63.64 USDC');
    expect(response.text).not.toContain('$5,000.00 USDC');
  });

  it('warns when the gross target does not cover modeled costs', () => {
    const evaluation = sampleTransactionCostEvaluation();
    evaluation.result.grossTargetBelowBreakEven = true;
    evaluation.interpretation.targetCoversModeledCosts = false;

    const response = presenter.transactionCostResult(evaluation, 'BITSO MXN');

    expect(response.text).toContain('⚠️ El target no cubre los costos modelados.');
  });
});

const sampleProfile = (overrides: Partial<StrategyProfile> = {}): StrategyProfile => ({
  ...sampleProfileBase(),
  ...overrides,
});

const sampleProfileBase = (): StrategyProfile => ({
  assetType: 'STOCK',
  timeframe: '5m',
  scoreBucket: '80-84' as const,
  strategyVersion: 'v-test',
  sampleSize: 10,
  resolvedSignalSampleSize: 4,
  dataMaturity: 'INSUFFICIENT' as const,
  statusDistribution: { open: 1, partiallyResolved: 1, closed: 1, expired: 1, ambiguous: 0 },
  mfe: { average: 1, median: 1, p25: 0.5, p75: 1.5, p90: 2 },
  mae: { average: -1, median: -1, p25: -1.5, p75: -0.5, p90: -0.25 },
  experimentalTargets: [],
  sanity: { anomalyCount: 0, anomalies: [] },
});

const sampleForwardPerformance = () => ({
  filters: {},
  sampleSize: 25,
  smallSample: false,
  tp1: { wins: 10, losses: 5, expired: 1, ambiguous: 2, winRate: 66.67 },
  tp2: { wins: 8, losses: 7, expired: 1, ambiguous: 2, winRate: 53.33 },
  experimentalTargets: [
    {
      targetPercent: 2,
      wins: 10,
      losses: 5,
      expired: 1,
      ambiguous: 2,
      winRate: 66.67,
      historicalForwardExpectancyPercent: 1.25,
      profitFactor: 3,
    },
  ],
  mfe: { average: 2.45, median: 2.1 },
  mae: { average: -0.75, median: -0.6 },
  expiredRate: 4,
  ambiguousRate: 8,
  scoreBuckets: [],
  byTimeframe: [],
  byTicker: [],
  byAssetType: [],
  bySector: [],
  byIndustry: [],
  byStrategyVersion: [],
});


const sampleTransactionCostEvaluation = (currency: 'MXN' | 'USDC' = 'MXN') => ({
  result: {
    brokerProfileId: currency === 'USDC' ? 'BITSO_CRYPTO_USDC' as const : 'BITSO_CRYPTO_MXN' as const,
    broker: 'BITSO' as const,
    product: `Crypto spot vs ${currency}`,
    feeScheduleVersion: 'bitso-crypto-base-tier-2026-08-28',
    effectiveFrom: '2026-08-28T00:00:00.000Z',
    sourceLabel: 'Bitso fees',
    sourceUrl: 'https://bitso.com/fees',
    verifiedAt: '2026-08-28T00:00:00.000Z',
    entryNotional: { amount: 5000, currency },
    grossTargetPercent: 2,
    grossExitValue: { amount: 5100, currency },
    exitNotional: { amount: 5100, currency },
    grossProfit: { amount: 100, currency },
    buyExecutionMode: 'TAKER' as const,
    sellExecutionMode: 'TAKER' as const,
    buyCost: {
      notional: { amount: 5000, currency },
      fee: { amount: currency === 'USDC' ? 18 : 39, currency },
      feePercentOfNotional: currency === 'USDC' ? 0.36 : 0.78,
      ruleType: 'PERCENTAGE_NOTIONAL' as const,
      appliedMinimum: false,
      appliedMaximum: false,
    },
    sellCost: {
      notional: { amount: 5100, currency },
      fee: { amount: currency === 'USDC' ? 18.36 : 39.78, currency },
      feePercentOfNotional: currency === 'USDC' ? 0.36 : 0.78,
      ruleType: 'PERCENTAGE_NOTIONAL' as const,
      appliedMinimum: false,
      appliedMaximum: false,
    },
    roundTripCost: { amount: currency === 'USDC' ? 36.36 : 78.78, currency },
    totalCashRequired: { amount: currency === 'USDC' ? 5018 : 5039, currency },
    netProfit: { amount: currency === 'USDC' ? 63.64 : 21.22, currency },
    netReturnPercent: currency === 'USDC' ? 1.2728 : 0.4244,
    breakEvenGrossTargetPercent: currency === 'USDC' ? 0.722601 : 1.572264,
    grossTargetBelowBreakEven: false,
    assumptions: {
      spreadIncluded: false as const,
      slippageIncluded: false as const,
      fundingCostsIncluded: false as const,
      withdrawalCostsIncluded: false as const,
      fxCostsIncluded: false as const,
    },
  },
  interpretation: {
    grossMarketMovementPercent: 2,
    netInvestorReturnPercent: currency === 'USDC' ? 1.2728 : 0.4244,
    breakEvenPercent: currency === 'USDC' ? 0.722601 : 1.572264,
    targetCoversModeledCosts: true,
  },
});
