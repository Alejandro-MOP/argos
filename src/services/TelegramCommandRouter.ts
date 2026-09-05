import type { BrokerProductProfileId, CurrencyCode, ExecutionMode } from '../models/TransactionCost';
import type { ControlResponse, TelegramControlResponseSender, TelegramControlUpdate } from '../models/TelegramControl';
import type { AssetType, MarketSymbol, MarketUniverseSnapshot } from '../models/MarketSymbol';
import type { AnalyzeSymbolService } from './AnalyzeSymbolService';
import type { MarketScanExecutor, MarketScanLogger } from './MarketScanExecutor';
import type { MarketUniverseService } from './MarketUniverseService';
import type { PaperTradeService } from './PaperTradeService';
import { AnalyzeSymbolServiceError, normalizeAnalyzeSymbol, type AnalyzeSymbolTimeframe } from './AnalyzeSymbolService';
import type { TransactionCostService } from './TransactionCostService';
import type { TelegramAuthorizationService } from './TelegramAuthorizationService';
import type { TelegramConversationStateService } from './TelegramConversationStateService';
import { CALLBACKS } from './TelegramControlPresenter';
import type { TelegramControlPresenter } from './TelegramControlPresenter';
import type { TelegramControlReadOnlyQueryService } from './TelegramControlReadOnlyQueryService';
import { TelegramMarketScanExecutionGuard } from './TelegramMarketScanExecutionGuard';

const MAX_CALLBACK_DATA_BYTES = 64;
const SUPPORTED_NAMESPACE = 'argos';
const SUPPORTED_VERSION = 'v1';
const COSTS_FLOW = 'costs:evaluate';
const ANALYZE_FLOW = 'analyze:symbol';
const PAPER_FLOW = 'paper:trade';
const WAITING_FOR_CAPITAL = 'awaiting-capital';
const WAITING_FOR_TARGET = 'awaiting-target';
const WAITING_FOR_EXECUTION = 'awaiting-execution';
const WAITING_FOR_SYMBOL = 'awaiting-symbol';
const WAITING_FOR_TIMEFRAME = 'awaiting-timeframe';
const WAITING_FOR_ANALYZE_CHOICE = 'awaiting-analyze-choice';
const WAITING_FOR_PAPER_SYMBOL = 'awaiting-paper-symbol';
const WAITING_FOR_PAPER_ENTRY_CHOICE = 'awaiting-paper-entry-choice';
const WAITING_FOR_PAPER_MANUAL_ENTRY = 'awaiting-paper-manual-entry';
const BROWSING_SECTORS = 'browsing-sectors';
const BROWSING_INDUSTRIES = 'browsing-industries';
const BROWSING_SYMBOLS = 'browsing-symbols';
const ANALYZE_PAGE_SIZE = 8;
const ANALYZE_MIN_USEFUL_LAST_PAGE_SIZE = 3;
const ANALYZE_MAX_PAGE_SIZE = ANALYZE_PAGE_SIZE + ANALYZE_MIN_USEFUL_LAST_PAGE_SIZE - 1;

type CallbackDestination =
  | 'main-menu'
  | 'research-menu'
  | 'market-menu'
  | 'costs-menu'
  | 'paper-menu'
  | 'system-menu'
  | 'research-snapshot'
  | 'research-profiles'
  | 'research-performance'
  | 'market-scan'
  | 'market-scan-confirm'
  | 'market-scan-cancel'
  | 'market-analyze'
  | 'analyze-type-stock'
  | 'analyze-type-etf'
  | 'analyze-type-crypto'
  | 'analyze-manual'
  | 'analyze-item'
  | 'analyze-page-previous'
  | 'analyze-page-next'
  | 'analyze-all'
  | 'analyze-back'
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
  | 'paper-open'
  | 'paper-register'
  | 'paper-use-current'
  | 'paper-manual'
  | 'paper-cancel'
  | 'paper-close'
  | 'paper-continue'
  | 'system-status'
  | 'system-help'
  | 'back'
  | 'back-research'
  | 'back-system';

interface ParsedCallback {
  destination: CallbackDestination;
  itemIndex?: number;
  paperTradeId?: string;
  paperLevelId?: string;
}

export interface TelegramCommandRouterLogger {
  log?(message: string): void;
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
  [CALLBACKS.paperMenu]: 'paper-menu',
  [CALLBACKS.systemMenu]: 'system-menu',
  [CALLBACKS.researchSnapshot]: 'research-snapshot',
  [CALLBACKS.researchProfiles]: 'research-profiles',
  [CALLBACKS.researchPerformance]: 'research-performance',
  [CALLBACKS.marketScan]: 'market-scan',
  [CALLBACKS.marketScanConfirm]: 'market-scan-confirm',
  [CALLBACKS.marketScanCancel]: 'market-scan-cancel',
  [CALLBACKS.marketAnalyze]: 'market-analyze',
  [CALLBACKS.analyzeTypeStock]: 'analyze-type-stock',
  [CALLBACKS.analyzeTypeEtf]: 'analyze-type-etf',
  [CALLBACKS.analyzeTypeCrypto]: 'analyze-type-crypto',
  [CALLBACKS.analyzeManual]: 'analyze-manual',
  [CALLBACKS.analyzePagePrevious]: 'analyze-page-previous',
  [CALLBACKS.analyzePageNext]: 'analyze-page-next',
  [CALLBACKS.analyzeAll]: 'analyze-all',
  [CALLBACKS.analyzeBack]: 'analyze-back',
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
  [CALLBACKS.paperOpen]: 'paper-open',
  [CALLBACKS.paperRegister]: 'paper-register',
  [CALLBACKS.paperUseCurrent]: 'paper-use-current',
  [CALLBACKS.paperManual]: 'paper-manual',
  [CALLBACKS.paperCancel]: 'paper-cancel',
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
    private readonly marketScanExecutor?: Pick<MarketScanExecutor, 'run'>,
    private readonly marketScanExecutionGuard = new TelegramMarketScanExecutionGuard(),
    private readonly logger: TelegramCommandRouterLogger = console,
    private readonly marketUniverseService?: Pick<
      MarketUniverseService,
      'loadSnapshot' | 'listAssetTypes' | 'listSectors' | 'listIndustries' | 'listSymbols'
    >,
    private readonly paperTradeService?: Pick<
      PaperTradeService,
      'isEligible' | 'getCurrentPrice' | 'createOpenTrade' | 'listOpenTrades' | 'closeTradeWithCurrentPrice' | 'continueFromLevel'
    >,
  ) {}

  public async route(update: TelegramControlUpdate): Promise<ControlResponse> {
    if (!this.authorizationService.isAuthorized(update.user)) {
      return this.presenter.unauthorized();
    }

    const userId = update.user?.id;

    if (update.callback) {
      return this.routeCallback(update.callback.data, userId, update.chat?.id);
    }

    return this.routeMessage(update.message?.text, userId);
  }

  private async routeMessage(text: string | undefined, userId: string | undefined): Promise<ControlResponse> {
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
      if (this.marketScanExecutionGuard.isRunning()) {
        return this.presenter.marketScanCannotCancelRunning();
      }
      if (state?.flow === ANALYZE_FLOW) {
        return this.presenter.analyzeCancelled();
      }
      if (state?.flow === PAPER_FLOW) {
        return this.presenter.paperCancelled();
      }
      return this.presenter.costsCancelled();
    }

    if (userId) {
      const expiredState = this.conversationStateService.consumeExpiredState(userId);
      if (expiredState) {
        if (expiredState.flow === ANALYZE_FLOW) {
          return this.presenter.analyzeExpired();
        }
        if (expiredState.flow === PAPER_FLOW) {
          return this.presenter.paperError();
        }
        return this.presenter.costsExpired();
      }

      const state = this.conversationStateService.get(userId);

      if (state?.flow === COSTS_FLOW) {
        return this.routeCostMessage(text, userId, state);
      }

      if (state?.flow === ANALYZE_FLOW) {
        return this.routeAnalyzeMessage(text, userId, state);
      }

      if (state?.flow === PAPER_FLOW) {
        return this.routePaperMessage(text, userId, state);
      }
    }

    return this.presenter.unknownCommand();
  }

  private async routeCallback(callbackData: string | undefined, userId: string | undefined, chatId: string | undefined): Promise<ControlResponse> {
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
      case 'paper-menu':
        this.clearConversation(userId);
        return this.presenter.paperMenu();
      case 'paper-open':
        return this.showOpenPaperTrades();
      case 'paper-register':
        return this.startPaperTradeFlow(userId);
      case 'paper-use-current':
        return this.createPaperTradeFromCurrentPrice(userId);
      case 'paper-manual':
        return this.askPaperManualEntry(userId);
      case 'paper-cancel':
        this.clearConversation(userId);
        return this.presenter.paperCancelled();
      case 'paper-close':
        return this.closePaperTrade(parsed.paperTradeId);
      case 'paper-continue':
        return this.continuePaperTrade(parsed.paperLevelId);
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
        this.clearConversation(userId);
        return this.presenter.marketScanConfirmation();
      case 'market-scan-confirm':
        return this.confirmMarketScan(userId, chatId);
      case 'market-scan-cancel':
        this.clearConversation(userId);
        return this.presenter.marketScanCancelled();
      case 'market-analyze':
      case 'analyze-again':
        return this.startAnalyzeFlow(userId);
      case 'analyze-type-stock':
        return this.startGuidedAnalyzeAssetType('STOCK', userId);
      case 'analyze-type-etf':
        return this.startGuidedAnalyzeAssetType('ETF', userId);
      case 'analyze-type-crypto':
        return this.startGuidedAnalyzeAssetType('CRYPTO', userId);
      case 'analyze-manual':
        return this.startManualAnalyzeFlow(userId);
      case 'analyze-item':
        return this.selectAnalyzeItem(parsed.itemIndex, userId);
      case 'analyze-page-previous':
        return this.changeAnalyzePage(-1, userId);
      case 'analyze-page-next':
        return this.changeAnalyzePage(1, userId);
      case 'analyze-all':
        return this.showAnalyzeSymbols(userId, { useAllIndustries: true });
      case 'analyze-back':
        return this.backAnalyzeFlow(userId);
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

  private confirmMarketScan(userId: string | undefined, chatId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.marketScanFailed('Usuario no disponible para ejecutar el escaneo.');
    }

    const marketScanExecutor = this.marketScanExecutor;

    if (!marketScanExecutor) {
      return this.presenter.marketScanFailed('Market Scan no está disponible en este entorno.');
    }

    const release = this.marketScanExecutionGuard.tryAcquire();

    if (!release) {
      return this.presenter.marketScanAlreadyRunning();
    }

    const startedAt = new Date();
    this.logger.log?.(
      `[TelegramControl] market scan requested userId=${safeLogValue(userId)} chatId=${safeLogValue(chatId)} startedAt=${startedAt.toISOString()}`,
    );

    return {
      ...this.presenter.marketScanStarted(),
      backgroundTasks: [
        async (sender: TelegramControlResponseSender) => {
          try {
            const result = await marketScanExecutor.run({ notify: true }, this.buildMarketScanLogger(userId, chatId));
            this.logger.log?.(
              `[TelegramControl] market scan completed userId=${safeLogValue(userId)} chatId=${safeLogValue(chatId)} durationMs=${result.metrics.durationMs} status=completed`,
            );
            await sender.send(this.presenter.marketScanCompleted(result));
          } catch (error) {
            this.logger.error(sanitizeControlRouterError(error));
            this.logger.log?.(
              `[TelegramControl] market scan completed userId=${safeLogValue(userId)} chatId=${safeLogValue(chatId)} status=failed`,
            );
            await sender.send(this.presenter.marketScanFailed());
          } finally {
            release();
          }
        },
      ],
    };
  }

  private buildMarketScanLogger(userId: string, chatId: string | undefined): MarketScanLogger {
    return {
      log: (message) => this.logger.log?.(`[TelegramControl][MarketScan] userId=${safeLogValue(userId)} chatId=${safeLogValue(chatId)} ${sanitizeControlRouterError(message)}`),
      error: (message, error) => this.logger.error(`[TelegramControl][MarketScan] ${sanitizeControlRouterError(message)} ${sanitizeControlRouterError(error)}`),
    };
  }

  private startAnalyzeFlow(userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    this.conversationStateService.set({
      userId,
      flow: ANALYZE_FLOW,
      step: WAITING_FOR_ANALYZE_CHOICE,
      data: {},
    });

    return this.presenter.analyzeSymbolPrompt();
  }

  private startManualAnalyzeFlow(userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    this.conversationStateService.set({
      userId,
      flow: ANALYZE_FLOW,
      step: WAITING_FOR_SYMBOL,
      data: { entryMode: 'manual' },
    });

    return this.presenter.analyzeManualSymbolPrompt();
  }

  private async startGuidedAnalyzeAssetType(assetType: AssetType, userId: string | undefined): Promise<ControlResponse> {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    if (!this.marketUniverseService) {
      return this.presenter.analyzeUniverseError();
    }

    try {
      const snapshot = await this.marketUniverseService.loadSnapshot();
      const activeAssetTypes = this.marketUniverseService.listAssetTypes(snapshot);

      if (!activeAssetTypes.includes(assetType)) {
        this.setAnalyzeListState(userId, BROWSING_SYMBOLS, { assetType, items: [], page: 0 });
        return this.presenter.analyzeEmptyNavigation(this.getAnalyzeTitle(assetType));
      }

      if (assetType === 'CRYPTO') {
        return this.showAnalyzeSymbols(userId, { assetType, snapshot });
      }

      const sectors = this.marketUniverseService.listSectors(snapshot, assetType);

      if (assetType === 'ETF' && sectors.length <= 1) {
        return this.showAnalyzeSymbols(userId, { assetType, sector: sectors[0], snapshot });
      }

      return this.showAnalyzeList({
        userId,
        step: BROWSING_SECTORS,
        title: this.getAnalyzeTitle(assetType),
        subtitle: 'Selecciona un sector:',
        items: sectors,
        data: { assetType },
      });
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.analyzeUniverseError();
    }
  }


  private async routePaperMessage(text: string | undefined, userId: string, state: ReturnType<TelegramConversationStateService['get']>): Promise<ControlResponse> {
    if (!state) {
      return this.presenter.paperError();
    }

    if (state.step === WAITING_FOR_PAPER_SYMBOL) {
      let symbol: string;
      try {
        symbol = normalizeAnalyzeSymbol(text ?? '');
      } catch {
        return this.presenter.invalidAnalyzeSymbol();
      }

      if (!this.paperTradeService?.isEligible({
        ticker: symbol,
        assetType: 'STOCK',
        timeframe: '5m',
        score: 100,
        strategyVersion: 'v1',
        signalType: 'LONG',
      })) {
        return this.presenter.paperNotEligible();
      }

      let currentPrice: number | undefined;
      try {
        currentPrice = await this.paperTradeService.getCurrentPrice(symbol);
      } catch (error) {
        this.logger.error(sanitizeControlRouterError(error));
      }

      this.conversationStateService.set({
        userId,
        flow: PAPER_FLOW,
        step: WAITING_FOR_PAPER_ENTRY_CHOICE,
        data: { symbol, currentPrice },
      });

      return this.presenter.paperEntryPrompt(symbol, currentPrice);
    }

    if (state.step === WAITING_FOR_PAPER_MANUAL_ENTRY) {
      const symbol = parseStringState(state.data.symbol);
      const entryPrice = parseFriendlyPositiveNumber(text);

      if (!symbol) {
        this.clearConversation(userId);
        return this.presenter.paperError();
      }

      if (entryPrice === undefined) {
        return this.presenter.invalidPaperEntry();
      }

      return this.createPaperTrade(userId, symbol, entryPrice);
    }

    return this.presenter.paperEntryPrompt(parseStringState(state.data.symbol) ?? 'STOCK');
  }

  private startPaperTradeFlow(userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.paperError();
    }

    if (!this.paperTradeService) {
      return this.presenter.paperError();
    }

    this.conversationStateService.set({
      userId,
      flow: PAPER_FLOW,
      step: WAITING_FOR_PAPER_SYMBOL,
      data: {},
    });

    return this.presenter.paperRegisterPrompt();
  }

  private async showOpenPaperTrades(): Promise<ControlResponse> {
    if (!this.paperTradeService) {
      return this.presenter.paperError();
    }

    try {
      return this.presenter.paperOpenTrades(await this.paperTradeService.listOpenTrades());
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.paperError();
    }
  }

  private askPaperManualEntry(userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.paperError();
    }

    const state = this.conversationStateService.get(userId);
    const symbol = parseStringState(state?.data.symbol);

    if (!state || state.flow !== PAPER_FLOW || state.step !== WAITING_FOR_PAPER_ENTRY_CHOICE || !symbol) {
      return this.presenter.paperError();
    }

    this.conversationStateService.set({
      userId,
      flow: PAPER_FLOW,
      step: WAITING_FOR_PAPER_MANUAL_ENTRY,
      data: { ...state.data },
    });

    return this.presenter.paperManualEntryPrompt(symbol);
  }

  private async createPaperTradeFromCurrentPrice(userId: string | undefined): Promise<ControlResponse> {
    if (!userId) {
      return this.presenter.paperError();
    }

    const state = this.conversationStateService.get(userId);
    const symbol = parseStringState(state?.data.symbol);
    const currentPrice = parseStoredNumber(state?.data.currentPrice);

    if (!state || state.flow !== PAPER_FLOW || state.step !== WAITING_FOR_PAPER_ENTRY_CHOICE || !symbol || currentPrice === undefined) {
      return this.presenter.paperError();
    }

    return this.createPaperTrade(userId, symbol, currentPrice);
  }

  private async createPaperTrade(userId: string, symbol: string, entryPrice: number): Promise<ControlResponse> {
    if (!this.paperTradeService) {
      this.clearConversation(userId);
      return this.presenter.paperError();
    }

    try {
      const trade = await this.paperTradeService.createOpenTrade({
        ticker: symbol,
        assetType: 'STOCK',
        timeframe: '5m',
        score: 100,
        strategyVersion: 'v1',
        entryPrice,
        entryAt: new Date(),
      });

      this.clearConversation(userId);
      return this.presenter.paperCreated(trade);
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      this.clearConversation(userId);
      return this.presenter.paperError();
    }
  }

  private async closePaperTrade(paperTradeId: string | undefined): Promise<ControlResponse> {
    if (!paperTradeId || !this.paperTradeService) {
      return this.presenter.paperError();
    }

    try {
      return this.presenter.paperClosed(await this.paperTradeService.closeTradeWithCurrentPrice(paperTradeId));
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.paperError();
    }
  }

  private async continuePaperTrade(paperLevelId: string | undefined): Promise<ControlResponse> {
    if (!paperLevelId || !this.paperTradeService) {
      return this.presenter.paperError();
    }

    try {
      await this.paperTradeService.continueFromLevel(paperLevelId);
      return this.presenter.paperContinued();
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.paperError();
    }
  }

  private routeAnalyzeMessage(text: string | undefined, userId: string, state: ReturnType<TelegramConversationStateService['get']>): ControlResponse {
    if (!state) {
      return this.presenter.analyzeExpired();
    }

    if (state.step !== WAITING_FOR_SYMBOL && state.step !== WAITING_FOR_ANALYZE_CHOICE) {
      return this.presenter.analyzeTimeframePrompt(parseAnalyzeSymbolState(state.data));
    }

    try {
      const symbol = normalizeAnalyzeSymbol(text ?? '');
      this.conversationStateService.set({
        userId,
        flow: ANALYZE_FLOW,
        step: WAITING_FOR_TIMEFRAME,
        data: { ...state.data, symbol, entryMode: state.data.entryMode ?? 'manual' },
      });

      return this.presenter.analyzeTimeframePrompt(symbol);
    } catch {
      return this.presenter.invalidAnalyzeSymbol();
    }
  }

  private async selectAnalyzeItem(itemIndex: number | undefined, userId: string | undefined): Promise<ControlResponse> {
    if (!userId || itemIndex === undefined) {
      return this.presenter.analyzeExpired();
    }

    const state = this.conversationStateService.get(userId);
    if (!state || state.flow !== ANALYZE_FLOW) {
      return this.presenter.analyzeExpired();
    }

    const items = parseStringListState(state.data.items);
    const selected = items[itemIndex];
    const assetType = parseAssetTypeState(state.data.assetType);

    if (!selected || !assetType) {
      return this.presenter.analyzeExpired();
    }

    if (state.step === BROWSING_SECTORS) {
      if (assetType === 'ETF') {
        return this.showAnalyzeSymbols(userId, { assetType, sector: selected });
      }

      return this.showAnalyzeIndustries(userId, assetType, selected);
    }

    if (state.step === BROWSING_INDUSTRIES) {
      return this.showAnalyzeSymbols(userId, {
        assetType,
        sector: parseStringState(state.data.sector),
        industry: selected,
      });
    }

    if (state.step === BROWSING_SYMBOLS) {
      this.conversationStateService.set({
        userId,
        flow: ANALYZE_FLOW,
        step: WAITING_FOR_TIMEFRAME,
        data: { ...state.data, symbol: selected, entryMode: 'guided' },
      });

      return this.presenter.analyzeTimeframePrompt(selected);
    }

    return this.presenter.analyzeExpired();
  }

  private async showAnalyzeIndustries(userId: string, assetType: AssetType, sector: string): Promise<ControlResponse> {
    if (!this.marketUniverseService) {
      return this.presenter.analyzeUniverseError();
    }

    try {
      const snapshot = await this.marketUniverseService.loadSnapshot();
      const industries = this.marketUniverseService.listIndustries(snapshot, assetType, sector);

      if (industries.length <= 1) {
        return this.showAnalyzeSymbols(userId, { assetType, sector, industry: industries[0], snapshot });
      }

      return this.showAnalyzeList({
        userId,
        step: BROWSING_INDUSTRIES,
        title: `SECTOR: ${sector}`,
        subtitle: 'Selecciona industria:',
        items: industries,
        data: { assetType, sector },
        includeAll: true,
      });
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.analyzeUniverseError();
    }
  }

  private async showAnalyzeSymbols(
    userId: string | undefined,
    options: { assetType?: AssetType; sector?: string; industry?: string; snapshot?: MarketUniverseSnapshot; useAllIndustries?: boolean },
  ): Promise<ControlResponse> {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    if (!this.marketUniverseService) {
      return this.presenter.analyzeUniverseError();
    }

    const currentState = this.conversationStateService.get(userId);
    const assetType = options.assetType ?? parseAssetTypeState(currentState?.data.assetType);
    const sector = options.sector ?? parseStringState(currentState?.data.sector);
    const industry = options.useAllIndustries ? undefined : options.industry ?? parseStringState(currentState?.data.industry);

    if (!assetType) {
      return this.presenter.analyzeExpired();
    }

    try {
      const snapshot = options.snapshot ?? await this.marketUniverseService.loadSnapshot();
      const symbols = this.marketUniverseService.listSymbols(snapshot, { assetType, sector, industry });
      const title = this.getSymbolsTitle(assetType, sector, industry);

      return this.showAnalyzeList({
        userId,
        step: BROWSING_SYMBOLS,
        title,
        subtitle: 'Selecciona un símbolo:',
        items: symbols.map((symbol) => symbol.symbol),
        data: { assetType, sector, industry },
        symbolItems: symbols,
      });
    } catch (error) {
      this.logger.error(sanitizeControlRouterError(error));
      return this.presenter.analyzeUniverseError();
    }
  }

  private changeAnalyzePage(direction: -1 | 1, userId: string | undefined): ControlResponse {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    const state = this.conversationStateService.get(userId);
    if (!state || state.flow !== ANALYZE_FLOW) {
      return this.presenter.analyzeExpired();
    }

    const items = parseStringListState(state.data.items);
    const pageLayout = buildAnalyzePageLayout(items.length);
    const pageCount = pageLayout.length;
    const currentPage = parseStoredPage(state.data.page);
    const page = Math.min(Math.max(currentPage + direction, 0), pageCount - 1);

    this.conversationStateService.set({
      userId,
      flow: ANALYZE_FLOW,
      step: state.step,
      data: { ...state.data, page },
    });

    return this.renderAnalyzeListState(userId, { ...state.data, page }, state.step);
  }

  private async backAnalyzeFlow(userId: string | undefined): Promise<ControlResponse> {
    if (!userId) {
      return this.presenter.analyzeExpired();
    }

    const state = this.conversationStateService.get(userId);
    if (!state || state.flow !== ANALYZE_FLOW) {
      return this.startAnalyzeFlow(userId);
    }

    const assetType = parseAssetTypeState(state.data.assetType);

    if (state.step === WAITING_FOR_SYMBOL || state.step === BROWSING_SECTORS || state.step === WAITING_FOR_ANALYZE_CHOICE) {
      return this.startAnalyzeFlow(userId);
    }

    if (state.step === WAITING_FOR_TIMEFRAME) {
      if (state.data.entryMode === 'manual') {
        return this.startManualAnalyzeFlow(userId);
      }
      return this.renderAnalyzeListState(userId, state.data, BROWSING_SYMBOLS);
    }

    if (state.step === BROWSING_SYMBOLS) {
      if (assetType === 'CRYPTO') {
        return this.startAnalyzeFlow(userId);
      }
      const sector = parseStringState(state.data.sector);
      const industry = parseStringState(state.data.industry);
      if (assetType === 'STOCK' && sector && industry) {
        return this.showAnalyzeIndustries(userId, assetType, sector);
      }
      if (assetType) {
        return this.startGuidedAnalyzeAssetType(assetType, userId);
      }
    }

    if (state.step === BROWSING_INDUSTRIES && assetType) {
      return this.startGuidedAnalyzeAssetType(assetType, userId);
    }

    return this.startAnalyzeFlow(userId);
  }

  private showAnalyzeList(params: {
    userId: string;
    step: string;
    title: string;
    subtitle?: string;
    items: string[];
    data: Record<string, unknown>;
    includeAll?: boolean;
    symbolItems?: MarketSymbol[];
  }): ControlResponse {
    this.setAnalyzeListState(params.userId, params.step, {
      ...params.data,
      items: params.items,
      page: 0,
      title: params.title,
      subtitle: params.subtitle,
      includeAll: params.includeAll ?? false,
      symbolLabels: params.symbolItems?.map(formatMarketSymbolLabel),
    });

    if (params.items.length === 0) {
      return this.presenter.analyzeEmptyNavigation(params.title);
    }

    return this.renderAnalyzeListState(params.userId, {
      ...params.data,
      items: params.items,
      page: 0,
      title: params.title,
      subtitle: params.subtitle,
      includeAll: params.includeAll ?? false,
      symbolLabels: params.symbolItems?.map(formatMarketSymbolLabel),
    }, params.step);
  }

  private setAnalyzeListState(userId: string, step: string, data: Record<string, unknown>): void {
    this.conversationStateService.set({ userId, flow: ANALYZE_FLOW, step, data });
  }

  private renderAnalyzeListState(userId: string, data: Record<string, unknown>, step: string): ControlResponse {
    const items = parseStringListState(data.items);
    const labels = parseStringListState(data.symbolLabels);
    const pageLayout = buildAnalyzePageLayout(items.length);
    const pageCount = pageLayout.length;
    const requestedPage = parseStoredPage(data.page);
    const page = Math.min(requestedPage, pageCount - 1);
    const pageBounds = pageLayout[page] ?? { start: 0, end: items.length };
    const visibleItems = items.slice(pageBounds.start, pageBounds.end);
    const visibleLabels = labels.length === items.length
      ? labels.slice(pageBounds.start, pageBounds.end)
      : visibleItems;

    this.conversationStateService.set({ userId, flow: ANALYZE_FLOW, step, data: { ...data, page } });

    return this.presenter.analyzeNavigationPage({
      title: parseStringState(data.title) ?? '🔎 ANALIZAR SÍMBOLO',
      subtitle: parseStringState(data.subtitle),
      items: visibleItems.map((_, index) => ({
        label: visibleLabels[index] ?? visibleItems[index],
        callbackData: CALLBACKS.analyzeItem(pageBounds.start + index),
      })),
      page,
      pageCount,
      includeAll: Boolean(data.includeAll),
    });
  }

  private getAnalyzeTitle(assetType: AssetType): string {
    const labels: Record<string, string> = {
      STOCK: '🏢 ACCIONES',
      ETF: '📦 ETFs',
      CRYPTO: '🪙 CRYPTO',
    };

    return labels[assetType] ?? assetType;
  }

  private getSymbolsTitle(assetType: AssetType, sector?: string, industry?: string): string {
    if (assetType === 'CRYPTO') {
      return '🪙 CRYPTO';
    }

    return [this.getAnalyzeTitle(assetType), sector, industry].filter(Boolean).join(' · ');
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

    if (!['menu', 'research', 'market', 'costs', 'system', 'navigation', 'analyze', 'paper'].includes(domain)) {
      return { error: 'unknown domain' };
    }

    const destination = CALLBACK_DESTINATIONS[trimmed];

    if (destination) {
      return { destination };
    }

    const itemMatch = /^argos:v1:analyze:item_(\d+)$/.exec(trimmed);
    if (itemMatch) {
      return { destination: 'analyze-item', itemIndex: Number(itemMatch[1]) };
    }

    const closeMatch = /^argos:v1:paper:close_(.+)$/.exec(trimmed);
    if (closeMatch) {
      return { destination: 'paper-close', paperTradeId: closeMatch[1] };
    }

    const continueMatch = /^argos:v1:paper:cont_(.+)$/.exec(trimmed);
    if (continueMatch) {
      return { destination: 'paper-continue', paperLevelId: continueMatch[1] };
    }

    return { error: 'unknown action' };
  }

  private clearConversation(userId: string | undefined): void {
    if (userId) {
      this.conversationStateService.clear(userId);
    }
  }
}

const safeLogValue = (value: string | undefined): string => value ?? 'n/a';



interface AnalyzePageBounds {
  start: number;
  end: number;
}

const buildAnalyzePageLayout = (itemCount: number): AnalyzePageBounds[] => {
  if (itemCount <= 0) {
    return [{ start: 0, end: 0 }];
  }

  let pageCount = Math.ceil(itemCount / ANALYZE_PAGE_SIZE);
  const lastPageSize = itemCount % ANALYZE_PAGE_SIZE;

  if (
    pageCount > 1 &&
    lastPageSize > 0 &&
    lastPageSize < ANALYZE_MIN_USEFUL_LAST_PAGE_SIZE &&
    itemCount <= (pageCount - 1) * ANALYZE_MAX_PAGE_SIZE
  ) {
    pageCount -= 1;
  }

  const basePageSize = Math.floor(itemCount / pageCount);
  const pagesWithExtraItem = itemCount % pageCount;
  const pages: AnalyzePageBounds[] = [];
  let start = 0;

  for (let page = 0; page < pageCount; page += 1) {
    const size = basePageSize + (page < pagesWithExtraItem ? 1 : 0);
    pages.push({ start, end: start + size });
    start += size;
  }

  return pages;
};

const parseStringState = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const parseStringListState = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];

const parseAssetTypeState = (value: unknown): AssetType | undefined => {
  if (value === 'STOCK' || value === 'ETF' || value === 'CRYPTO') {
    return value;
  }

  return undefined;
};

const parseStoredPage = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

const MAX_SYMBOL_LABEL_LENGTH = 48;

const formatMarketSymbolLabel = (symbol: MarketSymbol): string => {
  const displayName = symbol.displayName?.trim();
  const label = displayName ? `${symbol.symbol} — ${displayName}` : symbol.symbol;

  return truncateVisualLabel(label, MAX_SYMBOL_LABEL_LENGTH);
};

const truncateVisualLabel = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
};

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
