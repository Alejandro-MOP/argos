import { TelegramControlApiError, type TelegramControlClient } from '../clients/TelegramControlClient';
import type { ControlResponse, TelegramControlUser } from '../models/TelegramControl';
import type { TelegramAuthorizationService } from './TelegramAuthorizationService';
import type { TelegramCommandRouter } from './TelegramCommandRouter';
import type { TelegramControlMappedUpdate, TelegramControlUpdateMapper } from './TelegramControlUpdateMapper';

export interface TelegramControlPollingLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface TelegramControlPollingConfig {
  enabled: boolean;
  botToken: string;
  allowedUserIds: string[];
  pollingTimeoutSeconds?: number;
  maxBackoffMs?: number;
}

export interface TelegramControlPollingDependencies {
  client: Pick<TelegramControlClient, 'getUpdates' | 'sendMessage' | 'answerCallbackQuery' | 'getWebhookInfo'>;
  mapper: TelegramControlUpdateMapper;
  authorizationService: Pick<TelegramAuthorizationService, 'isAuthorized'>;
  router: Pick<TelegramCommandRouter, 'route'>;
  logger?: TelegramControlPollingLogger;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface PollCycleResult {
  updatesReceived: number;
  updatesProcessed: number;
  nextOffset?: number;
}

const DEFAULT_POLLING_TIMEOUT_SECONDS = 25;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export class TelegramControlStartupError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TelegramControlStartupError';
  }
}

export class TelegramControlFatalPollingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TelegramControlFatalPollingError';
  }
}

export class TelegramControlPollingService {
  private nextOffset: number | undefined;
  private stopping = false;
  private currentBackoffMs = INITIAL_BACKOFF_MS;
  private readonly logger: TelegramControlPollingLogger;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly pollingTimeoutSeconds: number;
  private readonly maxBackoffMs: number;

  public constructor(
    private readonly config: TelegramControlPollingConfig,
    private readonly dependencies: TelegramControlPollingDependencies,
  ) {
    this.logger = dependencies.logger ?? console;
    this.sleep = dependencies.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.pollingTimeoutSeconds = config.pollingTimeoutSeconds ?? DEFAULT_POLLING_TIMEOUT_SECONDS;
    this.maxBackoffMs = config.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  }

  public async start(): Promise<void> {
    const startupState = await this.validateStartup();
    if (startupState === 'disabled') {
      return;
    }

    this.logger.log('Telegram Control Worker started.');

    while (!this.stopping) {
      await this.executePollCycleSafely();
    }

    this.logger.log('Telegram Control Worker stopped.');
  }

  public stop(): void {
    if (!this.stopping) {
      this.logger.log('Telegram Control Worker stopping...');
    }
    this.stopping = true;
  }

  public async validateStartup(): Promise<'disabled' | 'enabled'> {
    if (!this.config.enabled) {
      this.logger.log('Telegram Control Bot disabled.');
      return 'disabled';
    }

    if (!this.config.botToken.trim()) {
      throw new TelegramControlStartupError('TELEGRAM_CONTROL_BOT_TOKEN is required when TELEGRAM_CONTROL_ENABLED=true.');
    }

    if (this.config.allowedUserIds.length === 0) {
      this.logger.warn('Telegram Control Bot has no allowed users configured. All users will be denied.');
    }

    const webhookInfo = await this.dependencies.client.getWebhookInfo();
    if (webhookInfo.url.trim().length > 0) {
      throw new TelegramControlStartupError('Telegram Control Bot has active webhook. Long polling cannot start safely.');
    }

    return 'enabled';
  }

  public async pollOnce(): Promise<PollCycleResult> {
    if (!this.config.enabled || this.stopping) {
      return { updatesReceived: 0, updatesProcessed: 0, nextOffset: this.nextOffset };
    }

    const updates = await this.dependencies.client.getUpdates({
      offset: this.nextOffset,
      timeoutSeconds: this.pollingTimeoutSeconds,
    });
    let updatesProcessed = 0;
    let highestUpdateId = this.nextOffset !== undefined ? this.nextOffset - 1 : undefined;

    for (const rawUpdate of updates) {
      const rawUpdateId = rawUpdate.update_id;
      if (typeof rawUpdateId === 'number' && Number.isInteger(rawUpdateId)) {
        highestUpdateId = Math.max(highestUpdateId ?? rawUpdateId, rawUpdateId);
      }

      const mappedUpdate = this.dependencies.mapper.map(rawUpdate);
      if (!mappedUpdate) {
        this.logger.warn('[TelegramControl] unsupported update ignored');
        continue;
      }

      this.logReceivedUpdate(mappedUpdate);
      await this.processMappedUpdate(mappedUpdate);
      updatesProcessed += 1;
    }

    if (highestUpdateId !== undefined) {
      this.nextOffset = highestUpdateId + 1;
    }

    this.resetBackoff();

    return { updatesReceived: updates.length, updatesProcessed, nextOffset: this.nextOffset };
  }

  public getNextOffset(): number | undefined {
    return this.nextOffset;
  }

  public getCurrentBackoffMs(): number {
    return this.currentBackoffMs;
  }

  public async runPollingIteration(): Promise<void> {
    await this.executePollCycleSafely();
  }

  private async executePollCycleSafely(): Promise<void> {
    try {
      await this.pollOnce();
    } catch (error) {
      await this.handlePollingError(error);
    }
  }

  private async processMappedUpdate(update: TelegramControlMappedUpdate): Promise<void> {
    const callbackQueryId = update.callbackQueryId;

    if (!this.dependencies.authorizationService.isAuthorized(update.user)) {
      await this.dependencies.client.sendMessage({ chatId: update.chat?.id ?? '', text: 'Unauthorized.' });
      if (callbackQueryId) {
        await this.answerCallbackSafely(callbackQueryId, 'Unauthorized.');
      }
      return;
    }

    try {
      const response = this.dependencies.router.route(update);
      await this.sendControlResponse(update.chat?.id, response);
      if (callbackQueryId) {
        await this.answerCallbackSafely(callbackQueryId);
      }
    } catch (error) {
      this.logger.error(sanitizeTelegramControlError(error));
      if (callbackQueryId) {
        await this.answerCallbackSafely(callbackQueryId, 'Error.');
      }
    }
  }

  private async sendControlResponse(chatId: string | undefined, response: ControlResponse): Promise<void> {
    if (!chatId) {
      this.logger.warn('[TelegramControl] update ignored because chatId is missing');
      return;
    }

    await this.dependencies.client.sendMessage({
      chatId,
      text: response.text,
      keyboard: response.keyboard,
    });
  }

  private async answerCallbackSafely(callbackQueryId: string, text?: string): Promise<void> {
    try {
      await this.dependencies.client.answerCallbackQuery(callbackQueryId, text);
    } catch (error) {
      this.logger.error(sanitizeTelegramControlError(error));
    }
  }

  private async handlePollingError(error: unknown): Promise<void> {
    if (error instanceof TelegramControlApiError && error.status === 401) {
      throw new TelegramControlFatalPollingError('Telegram Control Bot unauthorized. Verify TELEGRAM_CONTROL_BOT_TOKEN.');
    }

    if (error instanceof TelegramControlApiError && error.status === 429 && error.retryAfterSeconds) {
      const retryAfterMs = error.retryAfterSeconds * 1000;
      this.logger.warn(`Telegram Control Bot rate limited. retryAfterSeconds=${error.retryAfterSeconds}`);
      await this.sleep(retryAfterMs);
      return;
    }

    const delay = this.currentBackoffMs;
    this.logger.error(sanitizeTelegramControlError(error));
    this.logger.warn(`Telegram Control Bot polling retry in ${delay}ms.`);
    await this.sleep(delay);
    this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
  }

  private resetBackoff(): void {
    this.currentBackoffMs = INITIAL_BACKOFF_MS;
  }

  private logReceivedUpdate(update: TelegramControlMappedUpdate): void {
    this.logger.log(
      `[TelegramControl] update received userId=${safeLogValue(update.user?.id)} chatId=${safeLogValue(update.chat?.id)} type=${update.updateType}`,
    );
  }
}

const safeLogValue = (value: string | undefined): string => value ?? 'n/a';

export const sanitizeTelegramControlError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'telegram-control-error';

  return message
    .replace(/\/bot[^/\s]+\//g, '/bot[redacted]/')
    .replace(/(token|api_key|apikey)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 220);
};

export const isTelegramControlAuthorized = (
  authorizationService: Pick<TelegramAuthorizationService, 'isAuthorized'>,
  user?: TelegramControlUser,
): boolean => authorizationService.isAuthorized(user);
