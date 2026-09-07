import { parseTelegramAllowedUserIds } from '../src/config/env';

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

  it('keeps legacy Telegram Alerts secrets working', async () => {
    jest.resetModules();
    process.env = {
      TELEGRAM_BOT_TOKEN: 'legacy-token',
      TELEGRAM_CHAT_ID: 'legacy-chat',
      TELEGRAM_ENABLED: 'false',
    } as NodeJS.ProcessEnv;

    const { env } = await import('../src/config/env');

    expect(env.telegramBotToken).toBe('legacy-token');
    expect(env.telegramChatId).toBe('legacy-chat');
    expect(env.telegramEnabled).toBe(false);
    expect(env.telegramAlertsBotToken).toBe('legacy-token');
    expect(env.telegramAlertsChatId).toBe('legacy-chat');
    expect(env.telegramAlertsEnabled).toBe(false);
    expect('scoring' in env).toBe(false);
  });

  it('gives TELEGRAM_ALERTS_* precedence over legacy Alerts secrets', async () => {
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
