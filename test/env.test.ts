import {
  parseMarketScanTimeframes,
  parseTelegramAllowedUserIds,
  parseTradePlanConfig,
} from '../src/config/env';

describe('parseMarketScanTimeframes', () => {
  it('uses MARKET_SCAN_TIMEFRAMES when configured', () => {
    expect(parseMarketScanTimeframes({ MARKET_SCAN_TIMEFRAMES: '1m,5m,15m,1d,1w' })).toEqual([
      '1m',
      '5m',
      '15m',
      '1d',
      '1w',
    ]);
  });

  it('falls back to MARKET_SCAN_TIMEFRAME when MARKET_SCAN_TIMEFRAMES is absent', () => {
    expect(parseMarketScanTimeframes({ MARKET_SCAN_TIMEFRAME: '1d' })).toEqual(['1d']);
  });

  it('deduplicates configured timeframes', () => {
    expect(parseMarketScanTimeframes({ MARKET_SCAN_TIMEFRAMES: '1m,15m,1m,15m' })).toEqual([
      '1m',
      '15m',
    ]);
  });

  it('rejects invalid configured timeframes', () => {
    expect(() => parseMarketScanTimeframes({ MARKET_SCAN_TIMEFRAMES: '1m,4h' })).toThrow(
      'Unsupported MARKET_SCAN_TIMEFRAMES',
    );
  });
});


describe('parseTradePlanConfig', () => {
  it('uses default trade plan percentages', () => {
    expect(parseTradePlanConfig({})).toEqual({
      stopLossPercent: 1,
      targetMinPercent: 2,
      targetMaxPercent: 3,
    });
  });

  it('parses configured trade plan percentages', () => {
    expect(
      parseTradePlanConfig({
        TRADE_STOP_LOSS_PERCENT: '1.5',
        TRADE_TARGET_MIN_PERCENT: '2.5',
        TRADE_TARGET_MAX_PERCENT: '4',
      }),
    ).toEqual({
      stopLossPercent: 1.5,
      targetMinPercent: 2.5,
      targetMaxPercent: 4,
    });
  });

  it('rejects invalid trade plan configuration', () => {
    expect(() => parseTradePlanConfig({ TRADE_STOP_LOSS_PERCENT: '-1' })).toThrow(
      'TRADE_STOP_LOSS_PERCENT must be greater than 0',
    );
    expect(() =>
      parseTradePlanConfig({ TRADE_TARGET_MIN_PERCENT: '3', TRADE_TARGET_MAX_PERCENT: '2' }),
    ).toThrow('TRADE_TARGET_MAX_PERCENT must be greater than TRADE_TARGET_MIN_PERCENT');
  });
});


describe('signal intelligence env defaults', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
  });

  it('uses default Signal Intelligence configuration', async () => {
    jest.resetModules();
    process.env = {};

    const { env } = await import('../src/config/env');

    expect(env.signalIntelligence).toEqual({
      backtestContextEnabled: true,
      backtestContextMonths: 24,
      performanceMinSampleSize: 20,
      forwardTestContextEnabled: true,
    });
  });

  it('parses Signal Intelligence overrides', async () => {
    jest.resetModules();
    process.env = {
      BACKTEST_CONTEXT_ENABLED: 'false',
      BACKTEST_CONTEXT_MONTHS: '12',
      PERFORMANCE_MIN_SAMPLE_SIZE: '8',
      FORWARD_TEST_CONTEXT_ENABLED: 'false',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.signalIntelligence).toEqual({
      backtestContextEnabled: false,
      backtestContextMonths: 12,
      performanceMinSampleSize: 8,
      forwardTestContextEnabled: false,
    });
  });
});


describe('database backup env defaults', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
  });

  it('uses safe database backup defaults', async () => {
    jest.resetModules();
    process.env = {};

    const { env } = await import('../src/config/env');

    expect(env.databaseBackupEnabled).toBe(false);
    expect(env.databaseBackupSchedule).toBe('0 50 5 * * *');
    expect(env.databaseBackupBasePath).toBe('./backups');
    expect(env.databaseBackupTimezone).toBe('America/Mexico_City');
  });

  it('parses database backup overrides', async () => {
    jest.resetModules();
    process.env = {
      DATABASE_BACKUP_ENABLED: 'true',
      DATABASE_BACKUP_SCHEDULE: '0 0 6 * * *',
      DATABASE_BACKUP_BASE_PATH: '/tmp/argos-backups',
      DATABASE_BACKUP_TIMEZONE: 'UTC',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.databaseBackupEnabled).toBe(true);
    expect(env.databaseBackupSchedule).toBe('0 0 6 * * *');
    expect(env.databaseBackupBasePath).toBe('/tmp/argos-backups');
    expect(env.databaseBackupTimezone).toBe('UTC');
  });
});


describe('telegram env compatibility', () => {
  const originalEnv = process.env;

  afterEach(() => {
    jest.resetModules();
    process.env = originalEnv;
  });

  it('keeps legacy Telegram Alerts configuration working', async () => {
    jest.resetModules();
    process.env = {
      TELEGRAM_BOT_TOKEN: 'legacy-token',
      TELEGRAM_CHAT_ID: 'legacy-chat',
      TELEGRAM_ENABLED: 'false',
      TELEGRAM_NOTIFICATION_MIN_SCORE: '91',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.telegramBotToken).toBe('legacy-token');
    expect(env.telegramChatId).toBe('legacy-chat');
    expect(env.telegramEnabled).toBe(false);
    expect(env.telegramAlertsBotToken).toBe('legacy-token');
    expect(env.telegramAlertsChatId).toBe('legacy-chat');
    expect(env.telegramAlertsEnabled).toBe(false);
    expect(env.scoring.telegramNotificationMinScore).toBe(91);
  });

  it('gives TELEGRAM_ALERTS_* precedence over legacy Alerts configuration', async () => {
    jest.resetModules();
    process.env = {
      TELEGRAM_BOT_TOKEN: 'legacy-token',
      TELEGRAM_CHAT_ID: 'legacy-chat',
      TELEGRAM_ENABLED: 'false',
      TELEGRAM_ALERTS_BOT_TOKEN: 'alerts-token',
      TELEGRAM_ALERTS_CHAT_ID: 'alerts-chat',
      TELEGRAM_ALERTS_ENABLED: 'true',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.telegramBotToken).toBe('alerts-token');
    expect(env.telegramChatId).toBe('alerts-chat');
    expect(env.telegramEnabled).toBe(true);
    expect(env.telegramAlertsBotToken).toBe('alerts-token');
    expect(env.telegramAlertsChatId).toBe('alerts-chat');
    expect(env.telegramAlertsEnabled).toBe(true);
  });

  it('parses Control Bot configuration independently from Alerts Bot', async () => {
    jest.resetModules();
    process.env = {
      TELEGRAM_CONTROL_BOT_TOKEN: 'control-token',
      TELEGRAM_CONTROL_ENABLED: 'true',
      TELEGRAM_CONTROL_ALLOWED_USER_IDS: '123, 456, invalid, , 789',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.telegramControlBotToken).toBe('control-token');
    expect(env.telegramControlEnabled).toBe(true);
    expect(env.telegramControlAllowedUserIds).toEqual(['123', '456', '789']);
  });

  it('parses Telegram allowed user ids safely', () => {
    expect(parseTelegramAllowedUserIds(' 123,abc,456,,78x,789 ')).toEqual(['123', '456', '789']);
  });
});
