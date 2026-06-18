import type { Candle } from '../src/models/Candle';
import type { Opportunity } from '../src/models/Opportunity';
import {
  MarketScanExecutor,
  type MarketScanExecutorDependencies,
  type MarketScanLogger,
} from '../src/services/MarketScanExecutor';

const buildCandles = (count: number): Candle[] => {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(1_700_000_000_000 + index * 60_000),
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
    },
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
      expect.stringContaining(
        'Datos de mercado ticker=SPY velas=59 primerTimestamp=2023-11-14T22:13:20.000Z',
      ),
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
});
