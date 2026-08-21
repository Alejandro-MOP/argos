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
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Temporalidad: 15m'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target +2%: $367.11'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Target +3%: $370.71'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.not.stringContaining('Pérdida estimada'));
  });

  it('sends enriched Signal and Opportunity messages through Telegram', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal({ ...buildSignal(), timeframe: '1m' }, buildOpportunity(), 1_000);

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
        text: expect.stringContaining('⏰ Timeframe: 1m'),
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
        text: expect.not.stringContaining('372.89000000000004'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('💰 INVERSIÓN'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Capital: $1,000.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('🛑 STOP FINANCIERO (-1%)'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Precio: $356.31'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Pérdida estimada: -$10.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('📊 STOP TÉCNICO SUGERIDO'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('🎯 TAKE PROFIT +2%'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Precio objetivo: $367.11'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Ganancia estimada: +$20.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Capital estimado: $1,020.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('🚀 TAKE PROFIT +3%'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Ganancia estimada: +$30.00'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('📐 Objetivo +2/+3%:'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('✅ EMA20 sobre EMA50 y ambas ascendentes'),
      }),
    );
  });

  it('shows prices without capital outcomes when capital is omitted', async () => {
    const httpClient = buildHttpClient();
    const telegramClient = new TelegramClient('secret-token', '12345', true, httpClient);
    const service = new NotificationService(telegramClient);

    await service.sendSignal(buildSignal(), buildOpportunity());

    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Entry: $359.91'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Precio objetivo: $367.11'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.not.stringContaining('Ganancia estimada'),
      }),
    );
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

    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Entry: $0.085440'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Precio: $0.084586'),
      }),
    );
    expect(httpClient.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        text: expect.stringContaining('Precio objetivo: $0.087149'),
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
