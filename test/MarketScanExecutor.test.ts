import type { Candle } from '../src/models/Candle';
import type { Opportunity } from '../src/models/Opportunity';
import { MarketDataRateLimitError } from '../src/errors/MarketDataErrors';
import {
  MarketScanExecutor,
  type MarketScanExecutorDependencies,
  type MarketScanLogger,
} from '../src/services/MarketScanExecutor';

const buildCandles = (count: number, lastTimestamp = new Date()): Candle[] => {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(lastTimestamp.getTime() - (count - index - 1) * 60_000),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1_000_000 + index,
  }));
};

const buildOpportunity = (ticker: string, score: number): Opportunity => ({
  ticker,
  timeframe: '15m',
  score,
  trendScore: 25,
  volumeScore: 25,
  momentumScore: 25,
  structureScore: score - 75,
  reasons: [],
  detectedAt: new Date(),
});

const buildLogger = (): MarketScanLogger => ({
  log: jest.fn(),
  error: jest.fn(),
});

const buildExecutor = (overrides: Partial<MarketScanExecutorDependencies>): MarketScanExecutor => {
  const dependencies = {
    marketDataService: {
      getCandles: jest.fn(),
    },
    watchlistService: {
      getTickers: jest.fn().mockReturnValue(['SPY']),
    },
    opportunityService: {
      analyze: jest.fn(),
    },
    rankingService: {
      rank: jest.fn((opportunities: Opportunity[]) => opportunities),
    },
    opportunityFilter: {
      shouldNotify: jest.fn(),
      evaluate: jest.fn().mockResolvedValue({ shouldNotify: true }),
      getMinimumScore: jest.fn().mockReturnValue(50),
    },
    riskService: {
      calculateRisk: jest.fn().mockReturnValue({
        ticker: 'SPY',
        timeframe: '15m',
        entry: 100,
        stop: 95,
        target: 110,
        score: 90,
        signalType: 'LONG',
        createdAt: new Date(),
      }),
    },
    opportunityRepository: {
      save: jest.fn(),
      findAll: jest.fn(),
      findRecentByTicker: jest.fn(),
    },
    signalRepository: {
      save: jest.fn(),
      findAll: jest.fn(),
    },
    notificationService: {
      sendSignal: jest.fn(),
      shouldNotifyOpportunity: jest.fn((opportunity: Opportunity) => opportunity.score >= 80),
      getMinimumScore: jest.fn().mockReturnValue(80),
    },
    rateLimiterService: {
      wait: jest.fn().mockResolvedValue(undefined),
    },
    marketDataMaxAgeMinutes: 30,
    marketDataMaxRetries: 3,
    marketDataRetryBaseDelayMs: 30_000,
    marketDataSequential: true,
    ...overrides,
  } as unknown as MarketScanExecutorDependencies;

  return new MarketScanExecutor(dependencies);
};

describe('MarketScanExecutor', () => {
  it('marks provider responses below 60 candles as insufficient-candles errors', async () => {
    const logger = buildLogger();
    const marketDataService = {
      getCandles: jest.fn().mockResolvedValue(buildCandles(59)),
    };
    const executor = buildExecutor({
      marketDataService,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(result.errors).toEqual([
      {
        ticker: 'SPY',
        message: 'insufficient-candles',
        candlesCount: 59,
        requestedFrom: 'n/a',
        requestedTo: 'n/a',
      },
    ]);
    expect(result.opportunities).toEqual([]);
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('Datos de mercado ticker=SPY velas=59'),
    );
  });

  it('skips tickers with enough provider data but fewer candles than the scan limit', async () => {
    const logger = buildLogger();
    const opportunityService = {
      analyze: jest.fn(),
    };
    const executor = buildExecutor({
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(70)),
      },
      opportunityService,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(result.errors).toEqual([]);
    expect(result.skipped).toEqual([{ ticker: 'SPY', score: 0, reason: 'insufficient-data' }]);
    expect(opportunityService.analyze).not.toHaveBeenCalled();
  });

  it('separates below-threshold and duplicate-window skipped reasons', async () => {
    const logger = buildLogger();
    const opportunities = [buildOpportunity('SPY', 70), buildOpportunity('QQQ', 90)];
    const executor = buildExecutor({
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(80)),
      },
      opportunityService: {
        analyze: jest
          .fn()
          .mockReturnValueOnce(opportunities[0])
          .mockReturnValueOnce(opportunities[1]),
      },
      opportunityFilter: {
        shouldNotify: jest.fn(),
        evaluate: jest
          .fn()
          .mockResolvedValueOnce({ shouldNotify: false, reason: 'below-threshold' })
          .mockResolvedValueOnce({ shouldNotify: false, reason: 'duplicate-window' }),
        getMinimumScore: jest.fn().mockReturnValue(50),
      },
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY', 'QQQ'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(result.skipped).toEqual([
      { ticker: 'SPY', score: 70, reason: 'below-threshold' },
      { ticker: 'QQQ', score: 90, reason: 'duplicate-window' },
    ]);
    expect(result.opportunities).toEqual([]);
  });

  it('marks opportunities with invalid risk as invalid-risk', async () => {
    const logger = buildLogger();
    const executor = buildExecutor({
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(80)),
      },
      opportunityService: {
        analyze: jest.fn().mockReturnValue(buildOpportunity('SPY', 90)),
      },
      riskService: {
        calculateRisk: jest.fn().mockReturnValue(null),
      },
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(result.skipped).toEqual([{ ticker: 'SPY', score: 90, reason: 'invalid-risk' }]);
    expect(result.opportunities).toEqual([expect.objectContaining({ ticker: 'SPY', score: 90 })]);
  });

  it('keeps valid opportunities out of notifiedSignals when below Telegram threshold', async () => {
    const logger = buildLogger();
    const opportunity = buildOpportunity('SPY', 55);
    const opportunityRepository = {
      save: jest.fn(),
      findAll: jest.fn(),
      findRecentByTicker: jest.fn(),
    };
    const signalRepository = {
      save: jest.fn(),
      findAll: jest.fn(),
    };
    const notificationService = {
      sendSignal: jest.fn(),
      shouldNotifyOpportunity: jest.fn().mockReturnValue(false),
      getMinimumScore: jest.fn().mockReturnValue(80),
    };
    const executor = buildExecutor({
      debug: true,
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(80)),
      },
      opportunityService: {
        analyze: jest.fn().mockReturnValue(opportunity),
      },
      opportunityRepository,
      signalRepository,
      notificationService,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: true },
      logger,
    );

    expect(result.opportunities).toEqual([opportunity]);
    expect(result.notifiedSignals).toEqual([]);
    expect(result.opportunitySignals).toHaveLength(1);
    expect(result.opportunitySignals[0]).toEqual(
      expect.objectContaining({ ticker: 'SPY', entry: 100, stop: 95, target: 110 }),
    );
    expect(result.skipped).toContainEqual({
      ticker: 'SPY',
      score: 55,
      reason: 'below-telegram-threshold',
    });
    expect(opportunityRepository.save).toHaveBeenCalledWith(opportunity);
    expect(signalRepository.save).not.toHaveBeenCalled();
    expect(notificationService.sendSignal).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      '[debug] decisionNotificacion ticker=SPY score=55 opportunityMinScore=50 telegramMinScore=80 willNotify=false',
    );
  });

  it('adds high-score opportunities to notifiedSignals and sends Telegram when notify is enabled', async () => {
    const logger = buildLogger();
    const opportunity = buildOpportunity('SPY', 85);
    const notificationService = {
      sendSignal: jest.fn(),
      shouldNotifyOpportunity: jest.fn().mockReturnValue(true),
      getMinimumScore: jest.fn().mockReturnValue(80),
    };
    const executor = buildExecutor({
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(80)),
      },
      opportunityService: {
        analyze: jest.fn().mockReturnValue(opportunity),
      },
      notificationService,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: true },
      logger,
    );

    expect(result.opportunitySignals).toHaveLength(1);
    expect(result.notifiedSignals).toHaveLength(1);
    expect(notificationService.sendSignal).toHaveBeenCalledWith(
      result.notifiedSignals[0],
      opportunity,
    );
    expect(result.skipped).not.toContainEqual(
      expect.objectContaining({ reason: 'below-telegram-threshold' }),
    );
  });

  it('skips stale intraday market data before generating opportunities', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T15:00:00.000Z'));
    const logger = buildLogger();
    const staleLastTimestamp = new Date('2026-06-18T14:20:00.000Z');
    const opportunityService = {
      analyze: jest.fn(),
    };
    const executor = buildExecutor({
      debug: true,
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(80, staleLastTimestamp)),
      },
      opportunityService,
      marketDataMaxAgeMinutes: 30,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(result.skipped).toEqual([
      {
        ticker: 'SPY',
        score: 0,
        reason: 'stale-market-data',
        lastTimestamp: staleLastTimestamp,
        dataAgeMinutes: 40,
        maxAllowedAgeMinutes: 30,
      },
    ]);
    expect(result.opportunities).toEqual([]);
    expect(opportunityService.analyze).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      '[debug] frescuraDatos ticker=SPY lastTimestamp=2026-06-18T14:20:00.000Z now=2026-06-18T15:00:00.000Z dataAgeMinutes=40 isStale=true',
    );

    jest.useRealTimers();
  });

  it('does not apply freshness validation to daily timeframes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-18T15:00:00.000Z'));
    const logger = buildLogger();
    const opportunityService = {
      analyze: jest.fn().mockReturnValue(buildOpportunity('SPY', 90)),
    };
    const executor = buildExecutor({
      marketDataService: {
        getCandles: jest
          .fn()
          .mockResolvedValue(buildCandles(80, new Date('2026-06-17T14:00:00.000Z'))),
      },
      opportunityService,
      marketDataMaxAgeMinutes: 30,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const result = await executor.run(
      { tickers: ['SPY'], timeframe: '1d', candleLimit: 80, notify: false },
      logger,
    );

    expect(result.skipped).not.toContainEqual(
      expect.objectContaining({ reason: 'stale-market-data' }),
    );
    expect(opportunityService.analyze).toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('logs debug details only when debug is enabled', async () => {
    const logger = buildLogger();
    const executor = buildExecutor({
      debug: true,
      marketDataService: {
        getCandles: jest.fn().mockResolvedValue(buildCandles(80)),
      },
      opportunityService: {
        analyze: jest.fn().mockReturnValue(buildOpportunity('SPY', 90)),
      },
    } as unknown as Partial<MarketScanExecutorDependencies>);

    await executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(logger.log).toHaveBeenCalledWith(
      '[debug] Debug de escaneo habilitado. temporalidad=15m limiteVelas=80 notificar=false',
    );
  });

  it('processes tickers sequentially and waits before each request after the first', async () => {
    const logger = buildLogger();
    const calls: string[] = [];
    const rateLimiterService = {
      wait: jest.fn().mockImplementation(async () => {
        calls.push('wait');
      }),
    };
    const executor = buildExecutor({
      marketDataService: {
        getCandles: jest.fn().mockImplementation(async (ticker: string) => {
          calls.push(`get:${ticker}`);
          return buildCandles(80);
        }),
      },
      opportunityService: {
        analyze: jest.fn((ticker: string) => buildOpportunity(ticker, 90)),
      },
      rateLimiterService,
      marketDataSequential: true,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    await executor.run(
      { tickers: ['SPY', 'QQQ', 'AMD'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    expect(calls).toEqual(['get:SPY', 'wait', 'get:QQQ', 'wait', 'get:AMD']);
    expect(rateLimiterService.wait).toHaveBeenCalledTimes(2);
  });

  it('retries rate limit errors with exponential backoff', async () => {
    jest.useFakeTimers();
    const logger = buildLogger();
    const marketDataService = {
      getCandles: jest
        .fn()
        .mockRejectedValueOnce(
          new MarketDataRateLimitError(
            'polygon',
            429,
            '/v2/aggs/ticker/SPY',
            'request-1',
            'Too Many Requests',
          ),
        )
        .mockRejectedValueOnce(
          new MarketDataRateLimitError(
            'polygon',
            429,
            '/v2/aggs/ticker/SPY',
            'request-2',
            'Too Many Requests',
          ),
        )
        .mockResolvedValue(buildCandles(80)),
    };
    const executor = buildExecutor({
      marketDataService,
      opportunityService: {
        analyze: jest.fn().mockReturnValue(buildOpportunity('SPY', 90)),
      },
      marketDataRetryBaseDelayMs: 10,
      marketDataMaxRetries: 3,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const runPromise = executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(20);
    const result = await runPromise;

    expect(marketDataService.getCandles).toHaveBeenCalledTimes(3);
    expect(result.errors).toEqual([]);
    expect(result.opportunities).toHaveLength(1);

    jest.useRealTimers();
  });

  it('returns clean rate-limit-exceeded errors after retries are exhausted', async () => {
    jest.useFakeTimers();
    const logger = buildLogger();
    const marketDataService = {
      getCandles: jest
        .fn()
        .mockRejectedValue(
          new MarketDataRateLimitError(
            'polygon',
            429,
            '/v2/aggs/ticker/SPY',
            'request-final',
            'Too Many Requests',
          ),
        ),
    };
    const executor = buildExecutor({
      marketDataService,
      marketDataRetryBaseDelayMs: 10,
      marketDataMaxRetries: 1,
    } as unknown as Partial<MarketScanExecutorDependencies>);

    const runPromise = executor.run(
      { tickers: ['SPY'], timeframe: '15m', candleLimit: 80, notify: false },
      logger,
    );

    await jest.advanceTimersByTimeAsync(10);
    const result = await runPromise;

    expect(marketDataService.getCandles).toHaveBeenCalledTimes(2);
    expect(result.errors).toEqual([
      {
        ticker: 'SPY',
        message: 'rate-limit-exceeded',
        status: 429,
        statusText: 'Too Many Requests',
        provider: 'polygon',
        endpoint: '/v2/aggs/ticker/SPY',
        requestId: 'request-final',
      },
    ]);
    expect(logger.error).toHaveBeenCalledWith('No se pudo escanear SPY', result.errors[0]);

    jest.useRealTimers();
  });
});
