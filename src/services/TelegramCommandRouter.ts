import type { ControlResponse, TelegramControlUpdate } from '../models/TelegramControl';
import type { TelegramAuthorizationService } from './TelegramAuthorizationService';
import type { TelegramConversationStateService } from './TelegramConversationStateService';
import { CALLBACKS } from './TelegramControlPresenter';
import type { TelegramControlPresenter } from './TelegramControlPresenter';

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
  | 'back';

interface ParsedCallback {
  destination: CallbackDestination;
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
};

export class TelegramCommandRouter {
  public constructor(
    private readonly authorizationService: Pick<TelegramAuthorizationService, 'isAuthorized'>,
    private readonly presenter: TelegramControlPresenter,
    private readonly conversationStateService: Pick<TelegramConversationStateService, 'clear'>,
  ) {}

  public route(update: TelegramControlUpdate): ControlResponse {
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

  private routeCallback(callbackData: string | undefined, userId: string | undefined): ControlResponse {
    const parsed = this.parseCallback(callbackData);

    if ('error' in parsed) {
      return this.presenter.invalidCallback(parsed.error);
    }

    switch (parsed.destination) {
      case 'main-menu':
      case 'back':
        return this.presenter.mainMenu();
      case 'research-menu':
        return this.presenter.researchMenu();
      case 'market-menu':
        return this.presenter.marketMenu();
      case 'costs-menu':
        return this.presenter.costsMenu();
      case 'system-menu':
        return this.presenter.systemMenu();
      case 'system-help':
        return this.presenter.help();
      case 'research-snapshot':
        return this.presenter.notImplemented('Research Snapshot');
      case 'research-profiles':
        return this.presenter.notImplemented('Strategy Profiles');
      case 'research-performance':
        return this.presenter.notImplemented('Forward Performance');
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
        return this.presenter.notImplemented('System Status');
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
