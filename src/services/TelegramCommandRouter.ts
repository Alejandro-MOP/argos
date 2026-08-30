import type { ControlResponse, TelegramControlUpdate } from '../models/TelegramControl';
import type { TelegramAuthorizationService } from './TelegramAuthorizationService';
import type { TelegramConversationStateService } from './TelegramConversationStateService';
import { CALLBACKS } from './TelegramControlPresenter';
import type { TelegramControlPresenter } from './TelegramControlPresenter';
import type { TelegramControlReadOnlyQueryService } from './TelegramControlReadOnlyQueryService';

const MAX_CALLBACK_DATA_BYTES = 64;
const SUPPORTED_NAMESPACE = 'argos';
const SUPPORTED_VERSION = 'v1';

type CallbackDestination =
  | 'main-menu'
  | 'research-menu'
  | 'market-menu'
  | 'costs-menu'
  | 'system-menu'
  | 'research-snapshot'
  | 'research-profiles'
  | 'research-performance'
  | 'market-scan'
  | 'market-analyze'
  | 'costs-bitso-mxn'
  | 'costs-bitso-usdc'
  | 'system-status'
  | 'system-help'
  | 'back'
  | 'back-research'
  | 'back-system';

interface ParsedCallback {
  destination: CallbackDestination;
}

export interface TelegramCommandRouterLogger {
  error(message: string): void;
}

const CALLBACK_DESTINATIONS: Record<string, CallbackDestination> = {
  [CALLBACKS.mainMenu]: 'main-menu',
  [CALLBACKS.researchMenu]: 'research-menu',
  [CALLBACKS.marketMenu]: 'market-menu',
  [CALLBACKS.costsMenu]: 'costs-menu',
  [CALLBACKS.systemMenu]: 'system-menu',
  [CALLBACKS.researchSnapshot]: 'research-snapshot',
  [CALLBACKS.researchProfiles]: 'research-profiles',
  [CALLBACKS.researchPerformance]: 'research-performance',
  [CALLBACKS.marketScan]: 'market-scan',
  [CALLBACKS.marketAnalyze]: 'market-analyze',
  [CALLBACKS.costsBitsoMxn]: 'costs-bitso-mxn',
  [CALLBACKS.costsBitsoUsdc]: 'costs-bitso-usdc',
  [CALLBACKS.systemStatus]: 'system-status',
  [CALLBACKS.systemHelp]: 'system-help',
  [CALLBACKS.back]: 'back',
  [CALLBACKS.backResearch]: 'back-research',
  [CALLBACKS.backSystem]: 'back-system',
};

export class TelegramCommandRouter {
  public constructor(
    private readonly authorizationService: Pick<TelegramAuthorizationService, 'isAuthorized'>,
    private readonly presenter: TelegramControlPresenter,
    private readonly conversationStateService: Pick<TelegramConversationStateService, 'clear'>,
    private readonly readOnlyQueries?: Pick<
      TelegramControlReadOnlyQueryService,
      'getResearchSnapshot' | 'getStrategyProfiles' | 'getForwardPerformance' | 'getSystemStatus'
    >,
    private readonly logger: TelegramCommandRouterLogger = console,
  ) {}

  public async route(update: TelegramControlUpdate): Promise<ControlResponse> {
    if (!this.authorizationService.isAuthorized(update.user)) {
      return this.presenter.unauthorized();
    }

    const userId = update.user?.id;

    if (update.callback) {
      return this.routeCallback(update.callback.data, userId);
    }

    return this.routeMessage(update.message?.text, userId);
  }

  private routeMessage(text: string | undefined, userId: string | undefined): ControlResponse {
    const normalizedText = text?.trim().toLowerCase();

    if (normalizedText === '/start' || normalizedText === '/menu') {
      this.clearConversation(userId);
      return this.presenter.mainMenu();
    }

    if (normalizedText === '/help') {
      return this.presenter.help();
    }

    if (normalizedText === '/cancel') {
      this.clearConversation(userId);
      return this.presenter.cancelled();
    }

    return this.presenter.unknownCommand();
  }

  private async routeCallback(callbackData: string | undefined, userId: string | undefined): Promise<ControlResponse> {
    const parsed = this.parseCallback(callbackData);

    if ('error' in parsed) {
      return this.presenter.invalidCallback(parsed.error);
    }

    switch (parsed.destination) {
      case 'main-menu':
      case 'back':
        return this.presenter.mainMenu();
      case 'back-research':
      case 'research-menu':
        return this.presenter.researchMenu();
      case 'market-menu':
        return this.presenter.marketMenu();
      case 'costs-menu':
        return this.presenter.costsMenu();
      case 'back-system':
      case 'system-menu':
        return this.presenter.systemMenu();
      case 'system-help':
        return this.presenter.help();
      case 'research-snapshot':
        return this.queryResearchSnapshot();
      case 'research-profiles':
        return this.queryStrategyProfiles();
      case 'research-performance':
        return this.queryForwardPerformance();
      case 'market-scan':
        return this.presenter.notImplemented('Market Scan');
      case 'market-analyze':
        return this.presenter.notImplemented('Analyze Symbol');
      case 'costs-bitso-mxn':
        this.clearConversation(userId);
        return this.presenter.notImplemented('Bitso MXN costs');
      case 'costs-bitso-usdc':
        this.clearConversation(userId);
        return this.presenter.notImplemented('Bitso USDC costs');
      case 'system-status':
        return this.querySystemStatus();
    }
  }

  private async queryResearchSnapshot(): Promise<ControlResponse> {
    if (!this.readOnlyQueries) {
      return this.presenter.queryError('Research Snapshot');
    }

    try {
      return this.presenter.researchSnapshot(await this.readOnlyQueries.getResearchSnapshot());
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.queryError('Research Snapshot');
    }
  }

  private async queryStrategyProfiles(): Promise<ControlResponse> {
    if (!this.readOnlyQueries) {
      return this.presenter.queryError('Strategy Profiles');
    }

    try {
      return this.presenter.strategyProfiles(await this.readOnlyQueries.getStrategyProfiles());
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.queryError('Strategy Profiles');
    }
  }

  private async queryForwardPerformance(): Promise<ControlResponse> {
    if (!this.readOnlyQueries) {
      return this.presenter.queryError('Forward Performance');
    }

    try {
      return this.presenter.forwardPerformance(await this.readOnlyQueries.getForwardPerformance());
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.queryError('Forward Performance');
    }
  }

  private async querySystemStatus(): Promise<ControlResponse> {
    if (!this.readOnlyQueries) {
      return this.presenter.queryError('System Status');
    }

    try {
      return this.presenter.systemStatus(await this.readOnlyQueries.getSystemStatus());
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.queryError('System Status');
    }
  }

  private parseCallback(callbackData: string | undefined): ParsedCallback | { error: string } {
    if (!callbackData || callbackData.trim().length === 0) {
      return { error: 'empty callback' };
    }

    const trimmed = callbackData.trim();

    if (Buffer.byteLength(trimmed, 'utf8') > MAX_CALLBACK_DATA_BYTES) {
      return { error: 'callback too long' };
    }

    const parts = trimmed.split(':');

    if (parts.length !== 4) {
      return { error: 'malformed callback' };
    }

    const [namespace, version, domain] = parts;

    if (namespace !== SUPPORTED_NAMESPACE) {
      return { error: 'unknown namespace' };
    }

    if (version !== SUPPORTED_VERSION) {
      return { error: 'unknown version' };
    }

    if (!['menu', 'research', 'market', 'costs', 'system', 'navigation'].includes(domain)) {
      return { error: 'unknown domain' };
    }

    const destination = CALLBACK_DESTINATIONS[trimmed];

    if (!destination) {
      return { error: 'unknown action' };
    }

    return { destination };
  }

  private clearConversation(userId: string | undefined): void {
    if (userId) {
      this.conversationStateService.clear(userId);
    }
  }
}

export const sanitizeControlRouterError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'telegram-control-router-error';

  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\/bot[^/\s]+\//g, '/bot[redacted]/')
    .replace(/(token|api_key|apikey|password)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 220);
};
