import type { TelegramControlUpdate } from '../src/models/TelegramControl';
import { TelegramAuthorizationService } from '../src/services/TelegramAuthorizationService';
import { TelegramCommandRouter } from '../src/services/TelegramCommandRouter';
import { TelegramConversationStateService } from '../src/services/TelegramConversationStateService';
import { CALLBACKS, TelegramControlPresenter } from '../src/services/TelegramControlPresenter';

const buildRouter = () => {
  const conversationState = new TelegramConversationStateService();
  const router = new TelegramCommandRouter(
    new TelegramAuthorizationService('123'),
    new TelegramControlPresenter(),
    conversationState,
  );

  return { router, conversationState };
};

const update = (overrides: Partial<TelegramControlUpdate>): TelegramControlUpdate => ({
  user: { id: '123' },
  chat: { id: 'chat-1', type: 'private' },
  ...overrides,
});

describe('TelegramCommandRouter', () => {
  it('rejects unauthorized updates before command routing', async () => {
    const { router } = buildRouter();

    const response = await router.route(update({ user: { id: '999' }, message: { text: '/menu' } }));

    expect(response).toEqual({ code: 'UNAUTHORIZED', text: 'No autorizado.' });
  });

  it.each(['/start', '/menu'])('routes %s to the main menu and clears state', async (command) => {
    const { router, conversationState } = buildRouter();
    conversationState.set({ userId: '123', flow: 'costs', step: 'awaiting-capital' });

    const response = await router.route(update({ message: { text: command } }));

    expect(response.code).toBe('OK');
    expect(response.text).toContain('ARGOS Control');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('routes /help to help', async () => {
    const { router } = buildRouter();

    const response = await router.route(update({ message: { text: '/help' } }));

    expect(response.code).toBe('HELP');
    expect(response.text).toContain('ARGOS Control Help');
  });

  it('routes /cancel to cancel and clears state', async () => {
    const { router, conversationState } = buildRouter();
    conversationState.set({ userId: '123', flow: 'costs', step: 'awaiting-target' });

    const response = await router.route(update({ message: { text: '/cancel' } }));

    expect(response.code).toBe('CANCELLED');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('returns unknown command for unsupported text', async () => {
    const { router } = buildRouter();

    const response = await router.route(update({ message: { text: 'hola argos' } }));

    expect(response.code).toBe('UNKNOWN_COMMAND');
  });

  it.each([
    [CALLBACKS.mainMenu, 'OK', 'ARGOS Control'],
    [CALLBACKS.researchMenu, 'OK', 'Research'],
    [CALLBACKS.marketMenu, 'OK', 'Market'],
    [CALLBACKS.costsMenu, 'OK', 'Costs'],
    [CALLBACKS.systemMenu, 'OK', 'System'],
    [CALLBACKS.researchSnapshot, 'ERROR', 'ARGOS no pudo consultar Research Snapshot'],
    [CALLBACKS.researchProfiles, 'ERROR', 'ARGOS no pudo consultar Strategy Profiles'],
    [CALLBACKS.researchPerformance, 'ERROR', 'ARGOS no pudo consultar Forward Performance'],
    [CALLBACKS.marketScan, 'NOT_IMPLEMENTED', 'Market Scan integration is not available yet.'],
    [CALLBACKS.marketAnalyze, 'NOT_IMPLEMENTED', 'Analyze Symbol integration is not available yet.'],
    [CALLBACKS.costsBitsoMxn, 'NOT_IMPLEMENTED', 'Bitso MXN costs integration is not available yet.'],
    [CALLBACKS.costsBitsoUsdc, 'NOT_IMPLEMENTED', 'Bitso USDC costs integration is not available yet.'],
    [CALLBACKS.systemStatus, 'ERROR', 'ARGOS no pudo consultar System Status'],
    [CALLBACKS.systemHelp, 'HELP', 'ARGOS Control Help'],
    [CALLBACKS.back, 'OK', 'ARGOS Control'],
    [CALLBACKS.backResearch, 'OK', 'Research'],
    [CALLBACKS.backSystem, 'OK', 'System'],
  ])('routes callback %s', async (callbackData, expectedCode, expectedText) => {
    const { router } = buildRouter();

    const response = await router.route(update({ callback: { data: callbackData } }));

    expect(response.code).toBe(expectedCode);
    expect(response.text).toContain(expectedText);
  });

  it.each([
    ['', 'empty callback'],
    ['other:v1:menu:main', 'unknown namespace'],
    ['argos:v2:menu:main', 'unknown version'],
    ['argos:v1', 'malformed callback'],
    ['argos:v1:admin:restart', 'unknown domain'],
    ['argos:v1:menu:unknown', 'unknown action'],
    [`argos:v1:menu:${'x'.repeat(80)}`, 'callback too long'],
  ])('handles malformed callback %s', async (callbackData, reason) => {
    const { router } = buildRouter();

    const response = await router.route(update({ callback: { data: callbackData } }));

    expect(response.code).toBe('INVALID_CALLBACK');
    expect(response.text).toContain(reason);
  });
});


describe('TelegramCommandRouter read-only integrations', () => {
  const buildIntegratedRouter = () => {
    const readOnlyQueries = {
      getResearchSnapshot: jest.fn().mockResolvedValue(sampleSnapshot()),
      getStrategyProfiles: jest.fn().mockResolvedValue(sampleStrategyProfiles()),
      getForwardPerformance: jest.fn().mockResolvedValue(sampleForwardPerformance()),
      getSystemStatus: jest.fn().mockResolvedValue({
        controlBot: 'ONLINE',
        database: 'CONNECTED',
        researchServices: 'AVAILABLE',
        mode: 'Local Development',
        controlTransport: 'Telegram Long Polling',
      }),
    };
    const logger = { error: jest.fn() };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      new TelegramConversationStateService(),
      readOnlyQueries,
      logger,
    );

    return { router, readOnlyQueries, logger };
  };

  it('calls ResearchSnapshotService once for the snapshot callback', async () => {
    const { router, readOnlyQueries } = buildIntegratedRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.researchSnapshot } }));

    expect(readOnlyQueries.getResearchSnapshot).toHaveBeenCalledTimes(1);
    expect(response.text).toContain('ARGOS RESEARCH SNAPSHOT');
    expect(response.text).toContain('Eligible: 204');
  });

  it('calls Strategy Profiles provider once for the profiles callback', async () => {
    const { router, readOnlyQueries } = buildIntegratedRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.researchProfiles } }));

    expect(readOnlyQueries.getStrategyProfiles).toHaveBeenCalledTimes(1);
    expect(response.text).toContain('STRATEGY PROFILES');
    expect(response.text).toContain('Profiles: 1');
  });

  it('calls Forward Performance provider once for the performance callback', async () => {
    const { router, readOnlyQueries } = buildIntegratedRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.researchPerformance } }));

    expect(readOnlyQueries.getForwardPerformance).toHaveBeenCalledTimes(1);
    expect(response.text).toContain('FORWARD PERFORMANCE');
    expect(response.text).toContain('Signals evaluated: 25');
  });

  it('calls System Status service once for the status callback', async () => {
    const { router, readOnlyQueries } = buildIntegratedRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.systemStatus } }));

    expect(readOnlyQueries.getSystemStatus).toHaveBeenCalledTimes(1);
    expect(response.text).toContain('ARGOS SYSTEM STATUS');
    expect(response.text).toContain('Database: Connected');
  });

  it('does not call read-only queries for unauthorized users', async () => {
    const { router, readOnlyQueries } = buildIntegratedRouter();

    const response = await router.route(
      update({ user: { id: '999' }, callback: { data: CALLBACKS.researchSnapshot } }),
    );

    expect(response.code).toBe('UNAUTHORIZED');
    expect(readOnlyQueries.getResearchSnapshot).not.toHaveBeenCalled();
    expect(readOnlyQueries.getStrategyProfiles).not.toHaveBeenCalled();
    expect(readOnlyQueries.getForwardPerformance).not.toHaveBeenCalled();
    expect(readOnlyQueries.getSystemStatus).not.toHaveBeenCalled();
  });

  it('returns a safe error when a read-only query fails', async () => {
    const { router, readOnlyQueries, logger } = buildIntegratedRouter();
    readOnlyQueries.getResearchSnapshot.mockRejectedValue(new Error('database failed postgres://user:secret@localhost/db'));

    const response = await router.route(update({ callback: { data: CALLBACKS.researchSnapshot } }));

    expect(response.code).toBe('ERROR');
    expect(response.text).toContain('ARGOS no pudo consultar Research Snapshot');
    expect(response.text).not.toContain('postgres://');
    expect(logger.error).toHaveBeenCalledWith(expect.not.stringContaining('secret'));
  });
});

const sampleSnapshot = () => ({
  schemaVersion: '1' as const,
  snapshot: {
    snapshotDate: '2026-08-29',
    generatedAt: '2026-08-29T10:00:00.000Z',
    timeZone: 'America/Mexico_City',
    strategyVersion: 'v-test',
  },
  dataQuality: {
    evidenceCount: 204,
    evaluationCount: 150,
    evidenceWithoutEvaluationCount: 54,
    evaluatedEvidenceCount: 150,
    evidenceWithMfeMaeCount: 140,
  },
  evidenceSummary: {
    totalEvidence: 204,
    scoreBuckets: { '80-84': 30, '85-89': 40, '90-94': 50, '95-100': 84 },
    operationalOpportunities: 87,
    operationalThreshold: 90,
  },
  evaluationStatuses: { OPEN: 12, CLOSED: 70, EXPIRED: 8, AMBIGUOUS: 4 },
  profileSampleSizes: [],
  globalTargetLadder: [],
  mfeMaeByProfile: [],
  strategyProfiles: [],
  strategyProfileSemantics: { tradeOutcome: '', marketReachability: '', dataMaturity: '', maePercentiles: '' },
  watchProfiles: [],
  forwardPerformance: sampleForwardPerformance(),
});

const sampleStrategyProfiles = () => ({
  filters: {},
  semantics: { tradeOutcome: '', marketReachability: '', dataMaturity: '', maePercentiles: '' },
  profiles: [
    {
      assetType: 'STOCK',
      timeframe: '5m',
      scoreBucket: '90-94' as const,
      strategyVersion: 'v-test',
      sampleSize: 35,
      resolvedSignalSampleSize: 12,
      dataMaturity: 'EARLY' as const,
      statusDistribution: { open: 1, partiallyResolved: 2, closed: 3, expired: 4, ambiguous: 5 },
      mfe: { average: 1, median: 1, p25: 0.5, p75: 1.5, p90: 2 },
      mae: { average: -1, median: -1, p25: -1.5, p75: -0.5, p90: -0.25 },
      experimentalTargets: [],
      sanity: { anomalyCount: 0, anomalies: [] },
    },
  ],
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
