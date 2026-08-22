import type { AxiosInstance } from 'axios';
import { TelegramClient } from '../src/clients/TelegramClient';
import type { Opportunity } from '../src/models/Opportunity';
import type { Signal } from '../src/models/Signal';
import type { SignalContext, PerformanceSummary } from '../src/models/SignalContext';
import { NotificationService } from '../src/services/NotificationService';

const buildSignal = (): Signal => ({
  ticker: 'NVDA',
  timeframe: '15m',
  entry: 359.91,
  stop: 353.42,
  target: 372.89000000000004,
  score: 90,
  signalType: 'LONG',
  createdAt: new Date('2026-06-18T15:00:00.000Z'),
});

const buildOpportunity = (): Opportunity => ({
  ticker: 'NVDA',
  timeframe: '15m',
  score: 87,
  trendScore: 25,
  volumeScore: 22,
  momentumScore: 20,
  structureScore: 20,
  reasons: [
    'EMA20 sobre EMA50 y ambas ascendentes',
    'RSI14 en zona constructiva (51.26)',
    'Higher highs y higher lows',
  ],
  detectedAt: new Date('2026-06-18T15:00:00.000Z'),
});

const buildHttpClient = (): AxiosInstance => {
  return {
    post: jest.fn().mockResolvedValue({ data: { ok: true } }),
  } as unknown as AxiosInstance;
};

const buildPerformanceSummary = (overrides: Partial<PerformanceSummary> = {}): PerformanceSummary => ({
  sampleSize: 143,
  tp1: { targetPercent: 2, wins: 71, losses: 29, winRate: 71 },
  tp2: { targetPercent: 3, wins: 54, losses: 46, winRate: 54 },
  averageMfePercent: 3.4,
  averageMaePercent: -0.6,
  ...overrides,
});

const getSentText = (httpClient: AxiosInstance): string => {
  const post = httpClient.post as jest.Mock;
  return post.mock.calls[0][1].text;
};

describe('NotificationService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to console.log when Telegram is disabled', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', false, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal());

    expect(httpClient.post).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Señal LONG: NVDA'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Temporalidad: 15m'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target +2%: $367.11'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target +3%: $370.71'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.not.stringContaining('Pérdida estimada'));
  });

  it('renders Telegram with only current setup when no SignalContext is provided', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal({ ...buildSignal(), timeframe: '1m' }, buildOpportunity(), 1_000);

    const text = getSentText(httpClient);
    expect(text).toContain('🚨 MARKET SIGNAL');
    expect(text).toContain('🟢 NVDA · 1m');
    expect(text).toContain('⭐ Score: 87/100');
    expect(text).toContain('📈 Trend: 25/25');
    expect(text).toContain('📊 Volume: 22/25');
    expect(text).toContain('⚡ Momentum: 20/25');
    expect(text).toContain('🏗 Structure: 20/25');
    expect(text).toContain('✅ EMA20 sobre EMA50 y ambas ascendentes');
    expect(text).toContain('💰 TRADE PLAN');
    expect(text).toContain('Capital: $1,000.00');
    expect(text).toContain('Entry: $359.91');
    expect(text).toContain('🛑 -1% → $356.31');
    expect(text).toContain('Pérdida estimada: -$10.00');
    expect(text).toContain('🎯 +2% → $367.11');
    expect(text).toContain('Ganancia estimada: +$20.00');
    expect(text).toContain('🚀 +3% → $370.71');
    expect(text).not.toContain('📊 BACKTEST');
    expect(text).not.toContain('🧪 FORWARD TEST');
    expect(text).not.toContain('372.89000000000004');
  });

  it('renders Backtest intelligence when historical context is available', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient, { minimumScore: 80 });
    const context: SignalContext = {
      historicalEnabled: true,
      historical: buildPerformanceSummary(),
    };

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, context);

    const text = getSentText(httpClient);
    expect(text).toContain('📊 BACKTEST');
    expect(text).toContain('NVDA · 15m · Score ≥80');
    expect(text).toContain('143 casos históricos');
    expect(text).toContain('🎯 TP +2%: 71%');
    expect(text).toContain('🚀 TP +3%: 54%');
    expect(text).toContain('📈 MFE promedio: +3.40%');
    expect(text).toContain('📉 MAE promedio: -0.60%');
  });

  it('renders insufficient historical data when Backtest has no summary', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, { historicalEnabled: true });

    expect(getSentText(httpClient)).toContain('📊 BACKTEST\nDatos históricos insuficientes');
  });

  it('warns when Backtest sample size is small', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, {
      historicalEnabled: true,
      historical: buildPerformanceSummary({ sampleSize: 8, insufficientData: true }),
    });

    const text = getSentText(httpClient);
    expect(text).toContain('8 casos históricos');
    expect(text).toContain('⚠️ Muestra pequeña');
  });

  it('renders pending Forward Test when no real signal history exists', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, { forwardEnabled: true });

    expect(getSentText(httpClient)).toContain(
      '🧪 FORWARD TEST\nPendiente de recopilar señales reales',
    );
  });

  it('renders Forward Test mock data when provided', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, {
      forwardEnabled: true,
      forward: buildPerformanceSummary({
        sampleSize: 31,
        tp1: { targetPercent: 2, wins: 17, losses: 8, winRate: 68 },
        tp2: { targetPercent: 3, wins: 13, losses: 12, winRate: 52 },
      }),
    });

    const text = getSentText(httpClient);
    expect(text).toContain('🧪 FORWARD TEST');
    expect(text).toContain('Alertas reales del bot');
    expect(text).toContain('31 señales registradas');
    expect(text).toContain('🎯 TP +2%: 68%');
    expect(text).toContain('🚀 TP +3%: 52%');
  });

  it('keeps score and win rates independent and avoids probability language', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient, { minimumScore: 80 });

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, {
      historicalEnabled: true,
      historical: buildPerformanceSummary({
        tp1: { targetPercent: 2, wins: 7, losses: 3, winRate: 70 },
      }),
    });

    const text = getSentText(httpClient);
    expect(text).toContain('⭐ Score: 87/100');
    expect(text).toContain('🎯 TP +2%: 70%');
    expect(text).not.toMatch(/probabilidad de ganar/i);
    expect(text).not.toMatch(/70% de probabilidad/i);
  });

  it('omits Backtest section when BACKTEST_CONTEXT_ENABLED=false', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, {
      historicalEnabled: false,
      historical: buildPerformanceSummary(),
    });

    expect(getSentText(httpClient)).not.toContain('📊 BACKTEST');
  });

  it('omits Forward Test section when FORWARD_TEST_CONTEXT_ENABLED=false', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity(), 1_000, {
      forwardEnabled: false,
      forward: buildPerformanceSummary(),
    });

    expect(getSentText(httpClient)).not.toContain('🧪 FORWARD TEST');
  });

  it('shows prices without capital outcomes when capital is omitted', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity());

    const text = getSentText(httpClient);
    expect(text).toContain('Entry: $359.91');
    expect(text).toContain('🎯 +2% → $367.11');
    expect(text).not.toContain('Ganancia estimada');
  });

  it('keeps low-priced crypto plans executable in Telegram output', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(
      {
        ...buildSignal(),
        ticker: 'DOGE-USD',
        entry: 0.0854400023818016,
        stop: 0.08534999936819077,
      },
      { ...buildOpportunity(), ticker: 'DOGE-USD' },
      1_000,
    );

    const text = getSentText(httpClient);
    expect(text).toContain('Entry: $0.085440');
    expect(text).toContain('🛑 -1% → $0.084586');
    expect(text).toContain('🎯 +2% → $0.087149');
  });

  it('shows a fallback message when an opportunity has no reasons', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), { ...buildOpportunity(), reasons: [] });

    expect(getSentText(httpClient)).toContain('Sin razones registradas.');
  });

  it('uses its minimum score to decide whether an opportunity should notify', () => {
    const service = new NotificationService(undefined, { minimumScore: 80 });
    const opportunity = buildOpportunity();

    expect(service.shouldNotifyOpportunity({ ...opportunity, score: 79 })).toBe(false);
    expect(service.shouldNotifyOpportunity({ ...opportunity, score: 80 })).toBe(true);
    expect(service.getMinimumScore()).toBe(80);
  });
});
