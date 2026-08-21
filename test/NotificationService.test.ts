import type { AxiosInstance } from 'axios';
import { TelegramClient } from '../src/clients/TelegramClient';
import type { Opportunity } from '../src/models/Opportunity';
import type { Signal } from '../src/models/Signal';
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
  ticker: 'GOOGL',
  timeframe: '15m',
  score: 55.4,
  trendScore: 25,
  volumeScore: 0,
  momentumScore: 15,
  structureScore: 15,
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
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Temporalidad: 15M'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Objetivo: 372.89'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.not.stringContaining('Pérdida estimada'));
  });

  it('sends enriched Signal and Opportunity messages through Telegram', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal({ ...buildSignal(), timeframe: '1d' }, buildOpportunity(), 1_000);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(httpClient.post).toHaveBeenCalledWith(
      '/botsecret-token/sendMessage',
      expect.objectContaining({
        chat_id: '12345',
        text: expect.stringContaining('🚨 MARKET SIGNAL'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('🟢 Ticker: GOOGL'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('⏰ Timeframe: 1D'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('⭐ Score: 55/100'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('🎯 Target: 372.89'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.not.stringContaining('372.89000000000004'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('⚖️ Risk/Reward: 1:2.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('💰 Capital: 1000.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('📉 Pérdida estimada: 18.03'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('📈 Ganancia estimada: 36.06'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('✅ EMA20 sobre EMA50 y ambas ascendentes'),
      }),
    );
  });

  it('shows a fallback message when an opportunity has no reasons', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), { ...buildOpportunity(), reasons: [] });

    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Sin razones registradas.'),
      }),
    );
  });

  it('uses its minimum score to decide whether an opportunity should notify', () => {
    const service = new NotificationService(undefined, { minimumScore: 80 });
    const opportunity = buildOpportunity();

    expect(service.shouldNotifyOpportunity({ ...opportunity, score: 79 })).toBe(false);
    expect(service.shouldNotifyOpportunity({ ...opportunity, score: 80 })).toBe(true);
    expect(service.getMinimumScore()).toBe(80);
  });
});
