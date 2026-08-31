import type { BrokerProductProfileId, CurrencyCode, ExecutionMode } from '../models/TransactionCost';
import type { ControlResponse, TelegramControlUpdate } from '../models/TelegramControl';
import type { AnalyzeSymbolService } from './AnalyzeSymbolService';
import { AnalyzeSymbolServiceError, normalizeAnalyzeSymbol, type AnalyzeSymbolTimeframe } from './AnalyzeSymbolService';
import type { TransactionCostService } from './TransactionCostService';
import type { TelegramAuthorizationService } from './TelegramAuthorizationService';
import type { TelegramConversationStateService } from './TelegramConversationStateService';
import { CALLBACKS } from './TelegramControlPresenter';
import type { TelegramControlPresenter } from './TelegramControlPresenter';
import type { TelegramControlReadOnlyQueryService } from './TelegramControlReadOnlyQueryService';

const MAX_CALLBACK_DATA_BYTES = 64;
const SUPPORTED_NAMESPACE = 'argos';
const SUPPORTED_VERSION = 'v1';
const COSTS_FLOW = 'costs:evaluate';
const ANALYZE_FLOW = 'analyze:symbol';
const WAITING_FOR_CAPITAL = 'awaiting-capital';
const WAITING_FOR_TARGET = 'awaiting-target';
const WAITING_FOR_EXECUTION = 'awaiting-execution';
const WAITING_FOR_SYMBOL = 'awaiting-symbol';
const WAITING_FOR_TIMEFRAME = 'awaiting-timeframe';

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
  | 'analyze-tf-1m'
  | 'analyze-tf-5m'
  | 'analyze-tf-15m'
  | 'analyze-tf-1d'
  | 'analyze-tf-1w'
  | 'analyze-cancel'
  | 'analyze-again'
  | 'costs-bitso-mxn'
  | 'costs-bitso-usdc'
  | 'costs-maker'
  | 'costs-taker'
  | 'costs-cancel'
  | 'costs-new'
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

interface CostProfileSelection {
  brokerProfileId: BrokerProductProfileId;
  currency: CurrencyCode;
  label: string;
}

const COST_PROFILES: Record<'costs-bitso-mxn' | 'costs-bitso-usdc', CostProfileSelection> = {
  'costs-bitso-mxn': {
    brokerProfileId: 'BITSO_CRYPTO_MXN',
    currency: 'MXN',
    label: 'BITSO MXN',
  },
  'costs-bitso-usdc': {
    brokerProfileId: 'BITSO_CRYPTO_USDC',
    currency: 'USDC',
    label: 'BITSO USDC',
  },
};

const ANALYZE_TIMEFRAMES: Record<
  'analyze-tf-1m' | 'analyze-tf-5m' | 'analyze-tf-15m' | 'analyze-tf-1d' | 'analyze-tf-1w',
  AnalyzeSymbolTimeframe
> = {
  'analyze-tf-1m': '1m',
  'analyze-tf-5m': '5m',
  'analyze-tf-15m': '15m',
  'analyze-tf-1d': '1d',
  'analyze-tf-1w': '1w',
};

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
  [CALLBACKS.analyzeTf1m]: 'analyze-tf-1m',
  [CALLBACKS.analyzeTf5m]: 'analyze-tf-5m',
  [CALLBACKS.analyzeTf15m]: 'analyze-tf-15m',
  [CALLBACKS.analyzeTf1d]: 'analyze-tf-1d',
  [CALLBACKS.analyzeTf1w]: 'analyze-tf-1w',
  [CALLBACKS.analyzeCancel]: 'analyze-cancel',
  [CALLBACKS.analyzeAgain]: 'analyze-again',
  [CALLBACKS.costsBitsoMxn]: 'costs-bitso-mxn',
  [CALLBACKS.costsBitsoUsdc]: 'costs-bitso-usdc',
  [CALLBACKS.costsMaker]: 'costs-maker',
  [CALLBACKS.costsTaker]: 'costs-taker',
  [CALLBACKS.costsCancel]: 'costs-cancel',
  [CALLBACKS.costsNew]: 'costs-new',
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
    private readonly conversationStateService: Pick<TelegramConversationStateService, 'get' | 'set' | 'clear' | 'consumeExpired' | 'consumeExpiredState'>,
    private readonly readOnlyQueries?: Pick<
      TelegramControlReadOnlyQueryService,
      'getResearchSnapshot' | 'getStrategyProfiles' | 'getForwardPerformance' | 'getSystemStatus'
    >,
    private readonly transactionCostService?: Pick<TransactionCostService, 'evaluate'>,
    private readonly analyzeSymbolService?: Pick<AnalyzeSymbolService, 'analyze'>,
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
      const state = userId ? this.conversationStateService.get(userId) : undefined;
      this.clearConversation(userId);
      return state?.flow === ANALYZE_FLOW ? this.presenter.analyzeCancelled() : this.presenter.costsCancelled();
    }

    if (userId) {
      const expiredState = this.conversationStateService.consumeExpiredState(userId);
      if (expiredState) {
        return expiredState.flow === ANALYZE_FLOW ? this.presenter.analyzeExpired() : this.presenter.costsExpired();
      }

      const state = this.conversationStateService.get(userId);

      if (state?.flow === COSTS_FLOW) {
        return this.routeCostMessage(text, userId, state);
      }

      if (state?.flow === ANALYZE_FLOW) {
        return this.routeAnalyzeMessage(text, userId, state);
      }
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
        this.clearConversation(userId);
        return this.presenter.mainMenu();
      case 'back-research':
      case 'research-menu':
        return this.presenter.researchMenu();
      case 'market-menu':
        this.clearConversation(userId);
        return this.presenter.marketMenu();
      case 'costs-menu':
      case 'costs-new':
        this.clearConversation(userId);
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
      case 'analyze-again':
        return this.startAnalyzeFlow(userId);
      case 'analyze-tf-1m':
      case 'analyze-tf-5m':
      case 'analyze-tf-15m':
      case 'analyze-tf-1d':
      case 'analyze-tf-1w':
        return this.completeAnalyzeFlow(ANALYZE_TIMEFRAMES[parsed.destination], userId);
      case 'analyze-cancel':
        this.clearConversation(userId);
        return this.presenter.analyzeCancelled();
      case 'costs-bitso-mxn':
      case 'costs-bitso-usdc':
        return this.startCostFlow(parsed.destination, userId);
      case 'costs-maker':
        return this.completeCostFlow('MAKER', userId);
      case 'costs-taker':
        return this.completeCostFlow('TAKER', userId);
      case 'costs-cancel':
        this.clearConversation(userId);
        return this.presenter.costsCancelled();
      case 'system-status':
        return this.querySystemStatus();
    }
  }

  private startAnalyzeFlow(userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    this.conversationStateService.set({
      userId,
      flow: ANALYZE_FLOW,
      step: WAITING_FOR_SYMBOL,
      data: {},
    });

    return this.presenter.analyzeSymbolPrompt();
  }

  private routeAnalyzeMessage(text: string | undefined, userId: string, state: ReturnType<TelegramConversationStateService['get']>): ControlResponse {
    if (!state || state.step !== WAITING_FOR_SYMBOL) {
      return this.presenter.analyzeTimeframePrompt(parseAnalyzeSymbolState(state?.data));
    }

    try {
      const symbol = normalizeAnalyzeSymbol(text ?? '');
      this.conversationStateService.set({
        userId,
        flow: ANALYZE_FLOW,
        step: WAITING_FOR_TIMEFRAME,
        data: { symbol },
      });

      return this.presenter.analyzeTimeframePrompt(symbol);
    } catch {
      return this.presenter.invalidAnalyzeSymbol();
    }
  }

  private async completeAnalyzeFlow(timeframe: AnalyzeSymbolTimeframe, userId: string | undefined): Promise<ControlResponse> {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    const expiredState = this.conversationStateService.consumeExpiredState(userId);
    if (expiredState) {
      return this.presenter.analyzeExpired();
    }

    const state = this.conversationStateService.get(userId);
    const symbol = parseAnalyzeSymbolState(state?.data);

    if (!state || state.flow !== ANALYZE_FLOW || state.step !== WAITING_FOR_TIMEFRAME || !symbol) {
      return this.presenter.analyzeExpired();
    }

    if (!this.analyzeSymbolService) {
      this.clearConversation(userId);
      return this.presenter.analyzeError('analysis-failed', symbol);
    }

    try {
      const result = await this.analyzeSymbolService.analyze({ symbol, timeframe });
      this.clearConversation(userId);
      return this.presenter.analyzeSymbolResult(result);
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      this.clearConversation(userId);
      return this.presenter.analyzeError(error instanceof AnalyzeSymbolServiceError ? error.code : 'analysis-failed', symbol);
    }
  }

  private startCostFlow(destination: 'costs-bitso-mxn' | 'costs-bitso-usdc', userId: string | undefined): ControlResponse {
    const profile = COST_PROFILES[destination];

    if (!userId) {
      return this.presenter.costsExpired();
    }

    this.conversationStateService.set({
      userId,
      flow: COSTS_FLOW,
      step: WAITING_FOR_CAPITAL,
      data: { ...profile },
    });

    return this.presenter.costsCapitalPrompt(profile.label);
  }

  private routeCostMessage(text: string | undefined, userId: string, state: ReturnType<TelegramConversationStateService['get']>): ControlResponse {
    if (!state) {
      return this.presenter.costsExpired();
    }

    const profile = parseCostProfileState(state.data);

    if (!profile) {
      this.clearConversation(userId);
      return this.presenter.costsExpired();
    }

    if (state.step === WAITING_FOR_CAPITAL) {
      const capital = parseFriendlyPositiveNumber(text);

      if (capital === undefined) {
        return this.presenter.invalidCostCapital(profile.label);
      }

      this.conversationStateService.set({
        userId,
        flow: COSTS_FLOW,
        step: WAITING_FOR_TARGET,
        data: { ...state.data, capital },
      });

      return this.presenter.costsTargetPrompt(profile.label, capital, profile.currency);
    }

    if (state.step === WAITING_FOR_TARGET) {
      const grossTargetPercent = parseFriendlyPositiveNumber(text);

      if (grossTargetPercent === undefined) {
        return this.presenter.invalidCostTarget(profile.label);
      }

      this.conversationStateService.set({
        userId,
        flow: COSTS_FLOW,
        step: WAITING_FOR_EXECUTION,
        data: { ...state.data, grossTargetPercent },
      });

      return this.presenter.costsExecutionPrompt(profile.label);
    }

    if (state.step === WAITING_FOR_EXECUTION) {
      return this.presenter.costsExecutionPrompt(profile.label);
    }

    this.clearConversation(userId);
    return this.presenter.costsExpired();
  }

  private completeCostFlow(executionMode: ExecutionMode, userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.costsExpired();
    }

    const expiredState = this.conversationStateService.consumeExpiredState(userId);
    if (expiredState) {
      return this.presenter.costsExpired();
    }

    const state = this.conversationStateService.get(userId);

    if (!state || state.flow !== COSTS_FLOW || state.step !== WAITING_FOR_EXECUTION) {
      return this.presenter.costsExpired();
    }

    const profile = parseCostProfileState(state.data);
    const capital = parseStoredNumber(state.data.capital);
    const grossTargetPercent = parseStoredNumber(state.data.grossTargetPercent);

    if (!profile || capital === undefined || grossTargetPercent === undefined || !this.transactionCostService) {
      this.clearConversation(userId);
      return this.presenter.costsCalculationError();
    }

    try {
      const evaluation = this.transactionCostService.evaluate({
        brokerProfileId: profile.brokerProfileId,
        entryNotional: {
          amount: capital,
          currency: profile.currency,
        },
        grossTargetPercent,
        buyExecution: executionMode,
        sellExecution: executionMode,
      });

      this.clearConversation(userId);
      return this.presenter.transactionCostResult(evaluation, profile.label);
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      this.clearConversation(userId);
      return this.presenter.costsCalculationError();
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

    if (!['menu', 'research', 'market', 'costs', 'system', 'navigation', 'analyze'].includes(domain)) {
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

const parseAnalyzeSymbolState = (data: Record<string, unknown> | undefined): string | undefined => {
  const symbol = data?.symbol;

  return typeof symbol === 'string' && symbol.length > 0 ? symbol : undefined;
};

const parseCostProfileState = (data: Record<string, unknown>): CostProfileSelection | undefined => {
  const brokerProfileId = data.brokerProfileId;
  const currency = data.currency;
  const label = data.label;

  if (
    (brokerProfileId === 'BITSO_CRYPTO_MXN' || brokerProfileId === 'BITSO_CRYPTO_USDC') &&
    (currency === 'MXN' || currency === 'USDC') &&
    typeof label === 'string' &&
    label.length > 0
  ) {
    return { brokerProfileId, currency, label };
  }

  return undefined;
};

const parseStoredNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const parseFriendlyPositiveNumber = (text: string | undefined): number | undefined => {
  if (!text) {
    return undefined;
  }

  const normalized = normalizeFriendlyNumber(text);
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
};

const normalizeFriendlyNumber = (text: string): string => {
  const compact = text.trim().replace(/\s/g, '');

  if (compact.includes(',') && compact.includes('.')) {
    return compact.replace(/,/g, '');
  }

  if (compact.includes(',')) {
    const commaParts = compact.split(',');
    const lastPart = commaParts[commaParts.length - 1];

    if (commaParts.length === 2 && lastPart.length > 0 && lastPart.length <= 2) {
      return compact.replace(',', '.');
    }

    return compact.replace(/,/g, '');
  }

  return compact;
};

export const sanitizeControlRouterError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'telegram-control-router-error';

  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\/bot[^/\s]+\//g, '/bot[redacted]/')
    .replace(/(token|api_key|apikey|password)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 220);
};
