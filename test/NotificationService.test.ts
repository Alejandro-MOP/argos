import type { AxiosInstance } from 'axios';
import { TelegramClient } from '../src/clients/TelegramClient';
import type { Opportunity } from '../src/models/Opportunity';
import type { Signal } from '../src/models/Signal';
import { NotificationService } from '../src/services/NotificationService';

const buildSignal = (): Signal => ({
  ticker: 'NVDA',
  timeframe: '15m',
  entry: 100,
  stop: 95,
  target: 110,
  score: 90,
  signalType: 'LONG',
  createdAt: new Date('2026-06-18T15:00:00.000Z'),
});

const buildOpportunity = (): Opportunity => ({
  ticker: 'NVDA',
  timeframe: '15m',
  score: 90,
  trendScore: 25,
  volumeScore: 20,
  momentumScore: 20,
  structureScore: 25,
  reasons: ['EMA20 sobre EMA50', 'Breakout confirmado'],
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
  });

  it('sends enriched Signal and Opportunity messages through Telegram', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity());

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(httpClient.post).toHaveBeenCalledWith(
      '/botsecret-token/sendMessage',
      expect.objectContaining({
        chat_id: '12345',
        text: expect.stringContaining('🚨 OPORTUNIDAD DETECTADA'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Risk/Reward:\n1:2.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Timeframe:\n15m'),
      }),
    );
  });
});
