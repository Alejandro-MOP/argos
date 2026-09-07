import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();
loadLocalSettingsValues();

interface AzureLocalSettingsFile {
  Values?: Record<string, unknown>;
}

function loadLocalSettingsValues(): void {
  const isJestRuntime = process.argv.some((argument) => argument.includes('jest'));

  if (process.env.NODE_ENV === 'test' || isJestRuntime) {
    return;
  }

  const localSettingsPath = join(process.cwd(), 'local.settings.json');

  if (!existsSync(localSettingsPath)) {
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(localSettingsPath, 'utf8')) as AzureLocalSettingsFile;

    for (const [key, value] of Object.entries(parsed.Values ?? {})) {
      if (process.env[key] === undefined && typeof value === 'string') {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore malformed local.settings.json here. Azure Functions/Core Tools will surface
    // local settings issues when running the Functions host.
  }
}

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
};

const parseOptionalBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  return value.trim().toLowerCase() === 'true';
};

export const parseTelegramAllowedUserIds = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((userId) => userId.trim())
    .filter((userId) => userId.length > 0 && /^\d+$/.test(userId));
};

const telegramAlertsBotToken = process.env.TELEGRAM_ALERTS_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
const telegramAlertsChatId = process.env.TELEGRAM_ALERTS_CHAT_ID ?? process.env.TELEGRAM_CHAT_ID ?? '';
const telegramAlertsEnabled =
  parseOptionalBoolean(process.env.TELEGRAM_ALERTS_ENABLED) ??
  parseBoolean(process.env.TELEGRAM_ENABLED, true);

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? '',
  telegramBotToken: telegramAlertsBotToken,
  telegramChatId: telegramAlertsChatId,
  telegramEnabled: telegramAlertsEnabled,
  telegramAlertsBotToken,
  telegramAlertsChatId,
  telegramAlertsEnabled,
  telegramControlBotToken: process.env.TELEGRAM_CONTROL_BOT_TOKEN ?? '',
  telegramControlEnabled: parseBoolean(process.env.TELEGRAM_CONTROL_ENABLED, false),
  telegramControlAllowedUserIds: parseTelegramAllowedUserIds(
    process.env.TELEGRAM_CONTROL_ALLOWED_USER_IDS,
  ),
  marketScanSchedule: process.env.MARKET_SCAN_SCHEDULE ?? '0 */15 14-21 * * 1-5',
  forwardSignalEvaluationSchedule:
    process.env.FORWARD_SIGNAL_EVALUATION_SCHEDULE ?? '0 0 * * * *',
  databaseBackupEnabled: parseBoolean(process.env.DATABASE_BACKUP_ENABLED, false),
  databaseBackupSchedule: process.env.DATABASE_BACKUP_SCHEDULE ?? '0 50 5 * * *',
  databaseBackupBasePath: process.env.DATABASE_BACKUP_BASE_PATH ?? './backups',
  databaseBackupTimezone: process.env.DATABASE_BACKUP_TIMEZONE ?? 'America/Mexico_City',
  databasePgDumpBin: process.env.DATABASE_PG_DUMP_BIN ?? 'pg_dump',
  databasePgRestoreBin: process.env.DATABASE_PG_RESTORE_BIN ?? 'pg_restore',
  databasePsqlBin: process.env.DATABASE_PSQL_BIN ?? 'psql',
  marketScanDebug: parseBoolean(process.env.MARKET_SCAN_DEBUG, false),
};
