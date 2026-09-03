import type { TelegramControlUpdate } from '../src/models/TelegramControl';
import { TelegramAuthorizationService } from '../src/services/TelegramAuthorizationService';
import { TelegramCommandRouter } from '../src/services/TelegramCommandRouter';
import { TelegramConversationStateService } from '../src/services/TelegramConversationStateService';
import { CALLBACKS, TelegramControlPresenter } from '../src/services/TelegramControlPresenter';
import { MarketUniverseService } from '../src/services/MarketUniverseService';

const buildRouter = () => {
  const conversationState = new TelegramConversationStateService();
  const router = new TelegramCommandRouter(
    new TelegramAuthorizationService('123'),
    new TelegramControlPresenter(),
    conversationState,
  );

  return { router, conversationState };
};


const marketSymbol = (overrides: Record<string, unknown> = {}) => ({
  id: String(overrides.symbol ?? 'NVDA'),
  symbol: 'NVDA',
  providerSymbol: 'NVDA',
  displayName: 'NVIDIA',
  assetType: 'STOCK' as const,
  sector: 'Technology',
  industry: 'Semiconductors',
  exchange: 'NASDAQ',
  market: 'US',
  timezone: 'America/New_York',
  sessionType: 'US_REGULAR' as const,
  supportsIntraday: true,
  description: undefined,
  isActive: true,
  timeframes: ['1m', '5m', '15m', '1d', '1w'],
  ...overrides,
});

const buildMarketUniverseService = (symbols = [marketSymbol()]): MarketUniverseService => new MarketUniverseService(
  { findActiveWithTimeframes: jest.fn().mockResolvedValue(symbols) },
  { getTickers: jest.fn() } as never,
);

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
    [CALLBACKS.costsMenu, 'OK', 'TRANSACTION COSTS'],
    [CALLBACKS.systemMenu, 'OK', 'System'],
    [CALLBACKS.researchSnapshot, 'ERROR', 'ARGOS no pudo consultar Research Snapshot'],
    [CALLBACKS.researchProfiles, 'ERROR', 'ARGOS no pudo consultar Strategy Profiles'],
    [CALLBACKS.researchPerformance, 'ERROR', 'ARGOS no pudo consultar Forward Performance'],
    [CALLBACKS.marketScan, 'INPUT_REQUIRED', 'FULL MARKET SCAN'],
    [CALLBACKS.marketAnalyze, 'INPUT_REQUIRED', 'ANALIZAR SÍMBOLO'],
    [CALLBACKS.costsBitsoMxn, 'INPUT_REQUIRED', 'BITSO MXN'],
    [CALLBACKS.costsBitsoUsdc, 'INPUT_REQUIRED', 'BITSO USDC'],
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
      undefined,
      undefined,
      undefined,
      undefined,
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
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[REDACTED_DATABASE_URL]'));
  });
});


describe('TelegramCommandRouter full market scan flow', () => {
  const buildMarketScanRouter = (marketScanExecutor: { run: jest.Mock } = { run: jest.fn().mockResolvedValue(sampleMarketScanResult()) }) => {
    const conversationState = new TelegramConversationStateService();
    const logger = { log: jest.fn(), error: jest.fn() };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      conversationState,
      undefined,
      undefined,
      undefined,
      marketScanExecutor,
      undefined,
      logger,
    );

    return { router, conversationState, marketScanExecutor, logger };
  };

  const runBackgroundTasks = async (response: { backgroundTasks?: Array<(sender: { send: jest.Mock }) => Promise<void>> }) => {
    const sender = { send: jest.fn().mockResolvedValue(undefined) };
    await Promise.all((response.backgroundTasks ?? []).map((task) => task(sender)));
    return sender;
  };

  it('shows confirmation before running Full Market Scan', async () => {
    const { router, marketScanExecutor } = buildMarketScanRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.marketScan } }));

    expect(response.code).toBe('INPUT_REQUIRED');
    expect(response.text).toContain('FULL MARKET SCAN');
    expect(response.text).toContain('registrar Evidence');
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '✅ Confirm', callbackData: CALLBACKS.marketScanConfirm });
    expect(marketScanExecutor.run).not.toHaveBeenCalled();
  });

  it('does not execute scan on cancel', async () => {
    const { router, marketScanExecutor } = buildMarketScanRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.marketScanCancel } }));

    expect(response.code).toBe('CANCELLED');
    expect(response.text).toContain('Market Scan cancelado');
    expect(marketScanExecutor.run).not.toHaveBeenCalled();
  });

  it('starts scan only after explicit confirm and schedules it in background', async () => {
    const { router, marketScanExecutor } = buildMarketScanRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.marketScanConfirm } }));

    expect(response.code).toBe('OK');
    expect(response.text).toContain('Market Scan iniciado');
    expect(marketScanExecutor.run).not.toHaveBeenCalled();
    expect(response.backgroundTasks).toHaveLength(1);

    const sender = await runBackgroundTasks(response);

    expect(marketScanExecutor.run).toHaveBeenCalledWith({ notify: true }, expect.objectContaining({ log: expect.any(Function), error: expect.any(Function) }));
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({
      code: 'OK',
      text: expect.stringContaining('MARKET SCAN COMPLETED WITH WARNINGS'),
    }));
  });

  it('does not call MarketScanExecutor for unauthorized users', async () => {
    const { router, marketScanExecutor } = buildMarketScanRouter();

    const response = await router.route(update({ user: { id: '999' }, callback: { data: CALLBACKS.marketScanConfirm } }));

    expect(response.code).toBe('UNAUTHORIZED');
    expect(marketScanExecutor.run).not.toHaveBeenCalled();
  });

  it('prevents double execution while a scan is running and releases guard after success', async () => {
    let resolveScan!: (value: ReturnType<typeof sampleMarketScanResult>) => void;
    const marketScanExecutor = {
      run: jest.fn().mockReturnValue(new Promise((resolve) => { resolveScan = resolve; })),
    };
    const { router } = buildMarketScanRouter(marketScanExecutor);

    const first = await router.route(update({ callback: { data: CALLBACKS.marketScanConfirm } }));
    const second = await router.route(update({ callback: { data: CALLBACKS.marketScanConfirm } }));

    expect(second.text).toContain('Ya hay un Market Scan en ejecución');
    expect(marketScanExecutor.run).not.toHaveBeenCalled();

    const senderPromise = runBackgroundTasks(first);
    expect(marketScanExecutor.run).toHaveBeenCalledTimes(1);
    resolveScan(sampleMarketScanResult());
    await senderPromise;

    const third = await router.route(update({ callback: { data: CALLBACKS.marketScanConfirm } }));
    expect(third.text).toContain('Market Scan iniciado');
  });

  it('releases guard after scan failure and allows retry', async () => {
    const marketScanExecutor = { run: jest.fn().mockRejectedValueOnce(new Error('token=super-secret failed')).mockResolvedValueOnce(sampleMarketScanResult()) };
    const { router, logger } = buildMarketScanRouter(marketScanExecutor);

    const failed = await router.route(update({ callback: { data: CALLBACKS.marketScanConfirm } }));
    const failedSender = await runBackgroundTasks(failed);

    expect(failedSender.send).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ERROR',
      text: expect.stringContaining('Market Scan failed'),
    }));
    expect(logger.error).toHaveBeenCalledWith(expect.not.stringContaining('super-secret'));

    const retry = await router.route(update({ callback: { data: CALLBACKS.marketScanConfirm } }));
    await runBackgroundTasks(retry);

    expect(marketScanExecutor.run).toHaveBeenCalledTimes(2);
  });

  it('keeps Analyze Symbol ad-hoc and does not mix it with Full Market Scan', async () => {
    const marketScanExecutor = { run: jest.fn().mockResolvedValue(sampleMarketScanResult()) };
    const analyzeSymbolService = { analyze: jest.fn().mockResolvedValue(sampleAnalyzeSymbolResult()) };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      new TelegramConversationStateService(),
      undefined,
      undefined,
      analyzeSymbolService,
      marketScanExecutor,
    );

    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));
    await router.route(update({ message: { text: 'NVDA' } }));
    const response = await router.route(update({ callback: { data: CALLBACKS.analyzeTf15m } }));

    expect(response.text).toContain('Este análisis técnico no ejecuta ni registra una operación.');
    expect(analyzeSymbolService.analyze).toHaveBeenCalledTimes(1);
    expect(marketScanExecutor.run).not.toHaveBeenCalled();
  });
});


describe('TelegramCommandRouter analyze symbol flow', () => {
  const buildAnalyzeRouter = (
    analyzeSymbolService: { analyze: jest.Mock } = { analyze: jest.fn().mockResolvedValue(sampleAnalyzeSymbolResult()) },
    marketUniverseService = buildMarketUniverseService(),
    marketScanExecutor: { run: jest.Mock } = { run: jest.fn() },
  ) => {
    const conversationState = new TelegramConversationStateService();
    const logger = { error: jest.fn() };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      conversationState,
      undefined,
      undefined,
      analyzeSymbolService,
      marketScanExecutor,
      undefined,
      logger,
      marketUniverseService,
    );

    return { router, conversationState, analyzeSymbolService, marketUniverseService, marketScanExecutor, logger };
  };

  it('starts the analyze flow from the market menu callback', async () => {
    const { router, conversationState } = buildAnalyzeRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));

    expect(response.code).toBe('INPUT_REQUIRED');
    expect(response.text).toContain('ANALIZAR SÍMBOLO');
    expect(response.text).toContain('¿Qué quieres analizar?');
    expect(conversationState.get('123')).toEqual(expect.objectContaining({
      flow: 'analyze:symbol',
      step: 'awaiting-analyze-choice',
    }));
  });

  it('normalizes symbol input and asks for timeframe', async () => {
    const { router, conversationState } = buildAnalyzeRouter();
    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));

    const response = await router.route(update({ message: { text: ' nvda ' } }));

    expect(response.code).toBe('INPUT_REQUIRED');
    expect(response.text).toContain('Symbol: NVDA');
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '15m', callbackData: CALLBACKS.analyzeTf15m });
    expect(conversationState.get('123')).toEqual(expect.objectContaining({
      flow: 'analyze:symbol',
      step: 'awaiting-timeframe',
      data: expect.objectContaining({ symbol: 'NVDA' }),
    }));
  });

  it('keeps the symbol step when the symbol is invalid', async () => {
    const { router, conversationState, analyzeSymbolService } = buildAnalyzeRouter();
    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));

    const response = await router.route(update({ message: { text: 'NVDA/USD' } }));

    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.text).toContain('Símbolo inválido');
    expect(conversationState.get('123')?.step).toBe('awaiting-analyze-choice');
    expect(analyzeSymbolService.analyze).not.toHaveBeenCalled();
  });

  it('runs AnalyzeSymbolService for the selected timeframe and clears state', async () => {
    const { router, conversationState, analyzeSymbolService } = buildAnalyzeRouter();
    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));
    await router.route(update({ message: { text: 'nvda' } }));

    const response = await router.route(update({ callback: { data: CALLBACKS.analyzeTf15m } }));

    expect(analyzeSymbolService.analyze).toHaveBeenCalledWith({ symbol: 'NVDA', timeframe: '15m' });
    expect(response.code).toBe('OK');
    expect(response.text).toContain('🔎 NVDA · 15m');
    expect(response.text).toContain('Este análisis técnico no ejecuta ni registra una operación.');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('does not call AnalyzeSymbolService for unauthorized users', async () => {
    const { router, analyzeSymbolService } = buildAnalyzeRouter();

    const response = await router.route(update({ user: { id: '999' }, callback: { data: CALLBACKS.marketAnalyze } }));

    expect(response.code).toBe('UNAUTHORIZED');
    expect(analyzeSymbolService.analyze).not.toHaveBeenCalled();
  });

  it('returns a safe analyze error and clears state when analysis fails', async () => {
    const analyzeSymbolService = { analyze: jest.fn().mockRejectedValue(new Error('token=super-secret provider failed')) };
    const { router, conversationState, logger } = buildAnalyzeRouter(analyzeSymbolService);
    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));
    await router.route(update({ message: { text: 'NVDA' } }));

    const response = await router.route(update({ callback: { data: CALLBACKS.analyzeTf1d } }));

    expect(response.code).toBe('ERROR');
    expect(response.text).toContain('ARGOS no pudo completar el análisis');
    expect(response.text).not.toContain('super-secret');
    expect(logger.error).toHaveBeenCalledWith(expect.not.stringContaining('super-secret'));
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('cancels analyze flow from /cancel and from the cancel button', async () => {
    const { router, conversationState } = buildAnalyzeRouter();
    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));

    const commandResponse = await router.route(update({ message: { text: '/cancel' } }));

    expect(commandResponse.code).toBe('CANCELLED');
    expect(commandResponse.text).toContain('Análisis cancelado');
    expect(conversationState.get('123')).toBeUndefined();

    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));
    const buttonResponse = await router.route(update({ callback: { data: CALLBACKS.analyzeCancel } }));

    expect(buttonResponse.code).toBe('CANCELLED');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('does not analyze after TTL expiration', async () => {
    let now = new Date('2026-08-30T10:00:00.000Z');
    const conversationState = new TelegramConversationStateService(1000, () => now);
    const analyzeSymbolService = { analyze: jest.fn().mockResolvedValue(sampleAnalyzeSymbolResult()) };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      conversationState,
      undefined,
      undefined,
      analyzeSymbolService,
    );
    await router.route(update({ callback: { data: CALLBACKS.marketAnalyze } }));
    await router.route(update({ message: { text: 'NVDA' } }));
    now = new Date('2026-08-30T10:00:02.000Z');

    const response = await router.route(update({ callback: { data: CALLBACKS.analyzeTf1m } }));

    expect(response.text).toContain('El análisis expiró');
    expect(analyzeSymbolService.analyze).not.toHaveBeenCalled();
  });

  it('starts a fresh analyze flow from Analyze Again', async () => {
    const { router, conversationState } = buildAnalyzeRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.analyzeAgain } }));

    expect(response.code).toBe('INPUT_REQUIRED');
    expect(conversationState.get('123')).toEqual(expect.objectContaining({
      flow: 'analyze:symbol',
      step: 'awaiting-analyze-choice',
    }));
  });

  it('navigates STOCK asset type through sector, industry, symbol and timeframe', async () => {
    const analyzeSymbolService = { analyze: jest.fn().mockResolvedValue(sampleAnalyzeSymbolResult()) };
    const { router, marketScanExecutor } = buildAnalyzeRouter(analyzeSymbolService, buildMarketUniverseService([
      marketSymbol({ symbol: 'NVDA', displayName: 'NVIDIA', sector: 'Technology', industry: 'Semiconductors' }),
      marketSymbol({ symbol: 'MSFT', displayName: 'Microsoft', sector: 'Technology', industry: 'Software' }),
    ]));

    const sectors = await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));
    expect(sectors.text).toContain('ACCIONES');
    expect(sectors.keyboard?.rows.flat()).toContainEqual({ text: 'Technology', callbackData: CALLBACKS.analyzeItem(0) });

    const industries = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    expect(industries.text).toContain('SECTOR: Technology');
    expect(industries.keyboard?.rows.flat()).toContainEqual({ text: '📋 Todas', callbackData: CALLBACKS.analyzeAll });

    const symbols = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    expect(symbols.text).toContain('Semiconductors');
    expect(symbols.keyboard?.rows.flat()).toContainEqual({ text: 'NVDA — NVIDIA', callbackData: CALLBACKS.analyzeItem(0) });

    const timeframe = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    expect(timeframe.text).toContain('Symbol: NVDA');
    expect(timeframe.keyboard?.rows.flat()).toContainEqual({ text: '1m', callbackData: CALLBACKS.analyzeTf1m });
    expect(timeframe.keyboard?.rows.flat()).toContainEqual({ text: '5m', callbackData: CALLBACKS.analyzeTf5m });

    await router.route(update({ callback: { data: CALLBACKS.analyzeTf15m } }));
    expect(analyzeSymbolService.analyze).toHaveBeenCalledWith({ symbol: 'NVDA', timeframe: '15m' });
    expect(marketScanExecutor.run).not.toHaveBeenCalled();
  });

  it('skips STOCK industry selection when a sector has a single industry', async () => {
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService([
      marketSymbol({ symbol: 'JPM', displayName: 'JPMorgan Chase', sector: 'Financial Services', industry: 'Banks' }),
      marketSymbol({ symbol: 'BAC', displayName: 'Bank of America', sector: 'Financial Services', industry: 'Banks' }),
    ]));

    await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));
    const symbols = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));

    expect(symbols.text).toContain('Financial Services');
    expect(symbols.text).toContain('Selecciona un símbolo');
    expect(symbols.text).not.toContain('Selecciona industria');
  });

  it('keeps STOCK symbols with null industry navigable as unclassified', async () => {
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService([
      marketSymbol({ symbol: 'XYZ', displayName: undefined, sector: 'Technology', industry: undefined }),
    ]));

    await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));
    const symbols = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));

    expect(symbols.text).toContain('Other / Unclassified');
    expect(symbols.keyboard?.rows.flat()).toContainEqual({ text: 'XYZ', callbackData: CALLBACKS.analyzeItem(0) });
    expect(symbols.keyboard?.rows.flat()).not.toContainEqual({ text: 'XYZ — null', callbackData: CALLBACKS.analyzeItem(0) });
    expect(symbols.keyboard?.rows.flat()).not.toContainEqual({ text: 'XYZ — undefined', callbackData: CALLBACKS.analyzeItem(0) });
  });

  it('uses Todas to show all symbols in a sector regardless of industry', async () => {
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService([
      marketSymbol({ symbol: 'NVDA', displayName: 'NVIDIA', sector: 'Technology', industry: 'Semiconductors' }),
      marketSymbol({ symbol: 'MSFT', displayName: 'Microsoft', sector: 'Technology', industry: 'Software' }),
    ]));

    await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));
    await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    const allSymbols = await router.route(update({ callback: { data: CALLBACKS.analyzeAll } }));

    expect(allSymbols.text).toContain('Technology');
    expect(allSymbols.keyboard?.rows.flat()).toContainEqual({ text: 'MSFT — Microsoft', callbackData: CALLBACKS.analyzeItem(0) });
    expect(allSymbols.keyboard?.rows.flat()).toContainEqual({ text: 'NVDA — NVIDIA', callbackData: CALLBACKS.analyzeItem(1) });
  });

  it('navigates CRYPTO directly to active symbols and keeps 1m/5m available', async () => {
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService([
      marketSymbol({ symbol: 'BTC-USD', displayName: 'Bitcoin', assetType: 'CRYPTO', sector: 'Crypto', industry: undefined, market: 'Crypto', sessionType: 'TWENTY_FOUR_SEVEN' }),
      marketSymbol({ symbol: 'ETH-USD', displayName: 'Ethereum', assetType: 'CRYPTO', sector: 'Crypto', industry: undefined, market: 'Crypto', sessionType: 'TWENTY_FOUR_SEVEN' }),
    ]));

    const symbols = await router.route(update({ callback: { data: CALLBACKS.analyzeTypeCrypto } }));
    expect(symbols.text).toContain('CRYPTO');
    expect(symbols.keyboard?.rows.flat()).toContainEqual({ text: 'BTC-USD — Bitcoin', callbackData: CALLBACKS.analyzeItem(0) });
    expect(symbols.keyboard?.rows.flat()).not.toContainEqual({ text: 'BTC-USD — Crypto · Cryptocurrency', callbackData: CALLBACKS.analyzeItem(0) });

    const timeframe = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    expect(timeframe.text).toContain('Symbol: BTC-USD');
    expect(timeframe.keyboard?.rows.flat()).toContainEqual({ text: '1m', callbackData: CALLBACKS.analyzeTf1m });
    expect(timeframe.keyboard?.rows.flat()).toContainEqual({ text: '5m', callbackData: CALLBACKS.analyzeTf5m });
  });

  it('navigates ETF using available metadata without hardcoded categories', async () => {
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService([
      marketSymbol({ symbol: 'SPY', displayName: 'SPDR S&P 500 ETF', assetType: 'ETF', sector: 'Broad Market', industry: 'S&P 500 ETF', exchange: 'NYSEARCA' }),
      marketSymbol({ symbol: 'SMH', displayName: 'VanEck Semiconductor ETF', assetType: 'ETF', sector: 'Semiconductors', industry: 'Semiconductor ETF' }),
    ]));

    const sectors = await router.route(update({ callback: { data: CALLBACKS.analyzeTypeEtf } }));
    expect(sectors.text).toContain('ETFs');
    expect(sectors.keyboard?.rows.flat()).toContainEqual({ text: 'Broad Market', callbackData: CALLBACKS.analyzeItem(0) });

    const symbols = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    expect(symbols.text).toContain('Broad Market');
    expect(symbols.keyboard?.rows.flat()).toContainEqual({ text: 'SPY — SPDR S&P 500 ETF', callbackData: CALLBACKS.analyzeItem(0) });
  });

  it('keeps manual ticker as an escape hatch', async () => {
    const analyzeSymbolService = { analyze: jest.fn().mockResolvedValue(sampleAnalyzeSymbolResult()) };
    const { router } = buildAnalyzeRouter(analyzeSymbolService);

    const manual = await router.route(update({ callback: { data: CALLBACKS.analyzeManual } }));
    expect(manual.text).toContain('ESCRIBIR TICKER');

    await router.route(update({ message: { text: ' xyz ' } }));
    await router.route(update({ callback: { data: CALLBACKS.analyzeTf1d } }));

    expect(analyzeSymbolService.analyze).toHaveBeenCalledWith({ symbol: 'XYZ', timeframe: '1d' });
  });

  it('supports contextual back navigation', async () => {
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService([
      marketSymbol({ symbol: 'NVDA', displayName: 'NVIDIA', sector: 'Technology', industry: 'Semiconductors' }),
      marketSymbol({ symbol: 'MSFT', displayName: 'Microsoft', sector: 'Technology', industry: 'Software' }),
    ]));

    await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));
    await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    const backToSectors = await router.route(update({ callback: { data: CALLBACKS.analyzeBack } }));
    expect(backToSectors.text).toContain('ACCIONES');
    expect(backToSectors.keyboard?.rows.flat()).toContainEqual({ text: 'Technology', callbackData: CALLBACKS.analyzeItem(0) });
  });

  it('paginates large symbol lists and respects page boundaries', async () => {
    const symbols = Array.from({ length: 10 }, (_, index) => marketSymbol({
      symbol: `T${index}`,
      displayName: `Test Symbol ${index}`,
      sector: 'Technology',
      industry: 'Software',
    }));
    const { router } = buildAnalyzeRouter(undefined, buildMarketUniverseService(symbols));

    await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));
    const firstPage = await router.route(update({ callback: { data: CALLBACKS.analyzeItem(0) } }));
    expect(firstPage.text).toContain('Página 1/2');
    expect(firstPage.keyboard?.rows.flat()).toContainEqual({ text: '▶️', callbackData: CALLBACKS.analyzePageNext });

    const secondPage = await router.route(update({ callback: { data: CALLBACKS.analyzePageNext } }));
    expect(secondPage.text).toContain('Página 2/2');
    expect(secondPage.keyboard?.rows.flat()).toContainEqual({ text: '◀️', callbackData: CALLBACKS.analyzePagePrevious });
  });

  it('shows safe empty and repository error responses', async () => {
    const emptyUniverse = {
      loadSnapshot: jest.fn().mockResolvedValue({ source: 'postgres', symbols: [] }),
      listAssetTypes: jest.fn().mockReturnValue(['CRYPTO']),
      listSectors: jest.fn().mockReturnValue([]),
      listIndustries: jest.fn().mockReturnValue([]),
      listSymbols: jest.fn().mockReturnValue([]),
    } as never;
    const emptyRouter = buildAnalyzeRouter(undefined, emptyUniverse).router;
    const empty = await emptyRouter.route(update({ callback: { data: CALLBACKS.analyzeTypeCrypto } }));
    expect(empty.text).toContain('No encontré elementos activos');

    const failingUniverse = {
      loadSnapshot: jest.fn().mockRejectedValue(new Error('Market Universe repository failed')),
      listAssetTypes: jest.fn(),
      listSectors: jest.fn(),
      listIndustries: jest.fn(),
      listSymbols: jest.fn(),
    } as never;
    const { router, logger } = buildAnalyzeRouter(undefined, failingUniverse);
    const failed = await router.route(update({ callback: { data: CALLBACKS.analyzeTypeStock } }));

    expect(failed.code).toBe('ERROR');
    expect(failed.text).toContain('No pude cargar el Market Universe');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Market Universe repository failed'));
  });
});

describe('TelegramCommandRouter transaction cost flow', () => {
  const buildCostsRouter = (transactionCostService: { evaluate: jest.Mock } = { evaluate: jest.fn((request) => sampleTransactionCostEvaluation(request?.entryNotional?.currency === 'USDC' ? 'USDC' : 'MXN')) }) => {
    const conversationState = new TelegramConversationStateService();
    const logger = { error: jest.fn() };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      conversationState,
      undefined,
      transactionCostService,
      undefined,
      undefined,
      undefined,
      logger,
    );

    return { router, conversationState, transactionCostService, logger };
  };

  it('starts BITSO MXN flow and asks for capital', async () => {
    const { router, conversationState } = buildCostsRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));

    expect(response.code).toBe('INPUT_REQUIRED');
    expect(response.text).toContain('BITSO MXN');
    expect(response.text).toContain('Ingresa el capital');
    expect(conversationState.get('123')).toEqual(expect.objectContaining({
      flow: 'costs:evaluate',
      step: 'awaiting-capital',
      data: expect.objectContaining({ brokerProfileId: 'BITSO_CRYPTO_MXN', currency: 'MXN' }),
    }));
  });

  it('keeps the capital step when capital is invalid', async () => {
    const { router, conversationState } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));

    const response = await router.route(update({ message: { text: 'casi cinco mil' } }));

    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.text).toContain('Capital inválido');
    expect(conversationState.get('123')?.step).toBe('awaiting-capital');
  });

  it('accepts friendly numeric input and asks for execution mode', async () => {
    const { router, conversationState } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));

    const capitalResponse = await router.route(update({ message: { text: '5,000' } }));
    const targetResponse = await router.route(update({ message: { text: '2' } }));

    expect(capitalResponse.text).toContain('$5,000.00 MXN');
    expect(targetResponse.text).toContain('Tipo de ejecución');
    expect(targetResponse.keyboard?.rows.flat()).toContainEqual({ text: 'Taker', callbackData: CALLBACKS.costsTaker });
    expect(conversationState.get('123')).toEqual(expect.objectContaining({
      step: 'awaiting-execution',
      data: expect.objectContaining({ capital: 5000, grossTargetPercent: 2 }),
    }));
  });

  it('evaluates BITSO MXN taker/taker through TransactionCostService and clears state', async () => {
    const { router, conversationState, transactionCostService } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));
    await router.route(update({ message: { text: '5000' } }));
    await router.route(update({ message: { text: '2' } }));

    const response = await router.route(update({ callback: { data: CALLBACKS.costsTaker } }));

    expect(transactionCostService.evaluate).toHaveBeenCalledWith({
      brokerProfileId: 'BITSO_CRYPTO_MXN',
      entryNotional: { amount: 5000, currency: 'MXN' },
      grossTargetPercent: 2,
      buyExecution: 'TAKER',
      sellExecution: 'TAKER',
    });
    expect(response.code).toBe('OK');
    expect(response.text).toContain('Net profit:');
    expect(response.text).toContain('+$21.22 MXN');
    expect(response.text).toContain('Break-even:');
    expect(response.text).toContain('✅ El target supera los costos modelados.');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('evaluates BITSO USDC maker/maker without showing ambiguous dollar symbol', async () => {
    const { router, transactionCostService } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoUsdc } }));
    await router.route(update({ message: { text: '5000,50' } }));
    await router.route(update({ message: { text: '0,78' } }));

    const response = await router.route(update({ callback: { data: CALLBACKS.costsMaker } }));

    expect(transactionCostService.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      brokerProfileId: 'BITSO_CRYPTO_USDC',
      entryNotional: { amount: 5000.5, currency: 'USDC' },
      grossTargetPercent: 0.78,
      buyExecution: 'MAKER',
      sellExecution: 'MAKER',
    }));
    expect(response.text).toContain('5,000.00 USDC');
    expect(response.text).not.toContain('$5,000.00 USDC');
  });

  it('does not call TransactionCostService for unauthorized users', async () => {
    const { router, transactionCostService } = buildCostsRouter();

    const response = await router.route(update({ user: { id: '999' }, callback: { data: CALLBACKS.costsBitsoMxn } }));

    expect(response.code).toBe('UNAUTHORIZED');
    expect(transactionCostService.evaluate).not.toHaveBeenCalled();
  });

  it('returns a safe message and clears state when TransactionCostService fails', async () => {
    const transactionCostService = { evaluate: jest.fn(() => { throw new Error('token=super-secret failed'); }) };
    const { router, conversationState, logger } = buildCostsRouter(transactionCostService);
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));
    await router.route(update({ message: { text: '5000' } }));
    await router.route(update({ message: { text: '2' } }));

    const response = await router.route(update({ callback: { data: CALLBACKS.costsTaker } }));

    expect(response.code).toBe('ERROR');
    expect(response.text).toContain('ARGOS no pudo calcular los costos');
    expect(response.text).not.toContain('super-secret');
    expect(logger.error).toHaveBeenCalledWith(expect.not.stringContaining('super-secret'));
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('cancels the cost flow from /cancel', async () => {
    const { router, conversationState } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));

    const response = await router.route(update({ message: { text: '/cancel' } }));

    expect(response.code).toBe('CANCELLED');
    expect(response.text).toContain('Operación cancelada');
    expect(response.keyboard?.rows.flat()).toContainEqual({ text: '⬅️ Back to Costs', callbackData: CALLBACKS.costsMenu });
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('keeps the target step when target is invalid', async () => {
    const { router, conversationState } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));
    await router.route(update({ message: { text: '5000' } }));

    const response = await router.route(update({ message: { text: '-2%' } }));

    expect(response.code).toBe('VALIDATION_ERROR');
    expect(response.text).toContain('Target inválido');
    expect(conversationState.get('123')?.step).toBe('awaiting-target');
  });

  it('evaluates Maker through TransactionCostService', async () => {
    const { router, transactionCostService } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));
    await router.route(update({ message: { text: '5000' } }));
    await router.route(update({ message: { text: '2' } }));

    await router.route(update({ callback: { data: CALLBACKS.costsMaker } }));

    expect(transactionCostService.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      buyExecution: 'MAKER',
      sellExecution: 'MAKER',
    }));
  });

  it('cancels the cost flow from the cancel button', async () => {
    const { router, conversationState } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));

    const response = await router.route(update({ callback: { data: CALLBACKS.costsCancel } }));

    expect(response.code).toBe('CANCELLED');
    expect(response.text).toContain('Operación cancelada');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('does not calculate after TTL expiration', async () => {
    let now = new Date('2026-08-30T10:00:00.000Z');
    const conversationState = new TelegramConversationStateService(1000, () => now);
    const transactionCostService = { evaluate: jest.fn((request) => sampleTransactionCostEvaluation(request?.entryNotional?.currency === 'USDC' ? 'USDC' : 'MXN')) };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      conversationState,
      undefined,
      transactionCostService,
    );
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));
    now = new Date('2026-08-30T10:00:02.000Z');

    const response = await router.route(update({ callback: { data: CALLBACKS.costsTaker } }));

    expect(response.text).toContain('La operación expiró');
    expect(transactionCostService.evaluate).not.toHaveBeenCalled();
  });

  it('does not treat random text outside flow as capital', async () => {
    const { router, transactionCostService } = buildCostsRouter();

    const response = await router.route(update({ message: { text: '5000' } }));

    expect(response.code).toBe('UNKNOWN_COMMAND');
    expect(transactionCostService.evaluate).not.toHaveBeenCalled();
  });

  it('keeps conversation state isolated by user', async () => {
    const { router, conversationState } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));

    const response = await router.route(update({ user: { id: '456' }, message: { text: '5000' } }));

    expect(response.code).toBe('UNAUTHORIZED');
    expect(conversationState.get('123')?.step).toBe('awaiting-capital');
    expect(conversationState.get('456')).toBeUndefined();
  });

  it('passes very large valid numbers through the service request without Telegram-side math', async () => {
    const { router, transactionCostService } = buildCostsRouter();
    await router.route(update({ callback: { data: CALLBACKS.costsBitsoMxn } }));
    await router.route(update({ message: { text: '1000000000000' } }));
    await router.route(update({ message: { text: '2' } }));

    await router.route(update({ callback: { data: CALLBACKS.costsTaker } }));

    expect(transactionCostService.evaluate).toHaveBeenCalledWith(expect.objectContaining({
      entryNotional: { amount: 1000000000000, currency: 'MXN' },
    }));
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


const sampleAnalyzeSymbolResult = () => ({
  symbol: 'NVDA',
  providerSymbol: 'NVDA',
  timeframe: '15m' as const,
  assetType: 'STOCK' as const,
  latestClose: 227.98,
  latestCandleTimestamp: new Date('2026-08-30T15:45:00.000Z'),
  candlesReturned: 80,
  score: 90,
  trendScore: 25,
  volumeScore: 20,
  momentumScore: 20,
  structureScore: 25,
  reasons: ['EMA20 sobre EMA50', 'Breakout confirmado'],
  operationalThreshold: 90,
  aboveOperationalThreshold: true,
});


const sampleMarketScanResult = () => ({
  scannedTickers: ['NVDA', 'BTC-USD'],
  scanned: [
    { ticker: 'NVDA', timeframe: '15m' },
    { ticker: 'BTC-USD', timeframe: '1m' },
  ],
  opportunities: [buildOpportunityLike('NVDA', '15m', 90)],
  opportunitySignals: [buildSignalLike('NVDA', '15m', 90)],
  notifiedSignals: [buildSignalLike('NVDA', '15m', 90)],
  skipped: [
    { ticker: 'MSFT', timeframe: '15m', score: 50, reason: 'below-threshold' as const },
    { ticker: 'AAPL', timeframe: '15m', score: 90, reason: 'duplicate-signal-identity' as const },
    { ticker: 'META', timeframe: '1m', score: 0, reason: 'market-closed' as const },
  ],
  errors: [{ ticker: 'XYZ', timeframe: '15m', message: 'provider unavailable' }],
  metrics: {
    totalCombinations: 5,
    marketClosed: 1,
    marketDataRequests: 4,
    successfulRequests: 3,
    failedRequests: 1,
    rateLimitedRequests: 0,
    retryAttempts: 0,
    durationMs: 102_000,
  },
});

const buildOpportunityLike = (ticker: string, timeframe: string, score: number) => ({
  ticker,
  timeframe,
  score,
  trendScore: 25,
  volumeScore: 25,
  momentumScore: 20,
  structureScore: 20,
  reasons: ['Breakout confirmado'],
  detectedAt: new Date('2026-08-30T10:00:00.000Z'),
});

const buildSignalLike = (ticker: string, timeframe: string, score: number) => ({
  ticker,
  timeframe,
  entry: 100,
  stop: 99,
  target: 102,
  score,
  signalType: 'LONG' as const,
  createdAt: new Date('2026-08-30T10:00:00.000Z'),
});
