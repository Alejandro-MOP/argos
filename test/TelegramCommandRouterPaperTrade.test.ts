import type { TelegramControlUpdate } from '../src/models/TelegramControl';
import { TelegramAuthorizationService } from '../src/services/TelegramAuthorizationService';
import { TelegramCommandRouter } from '../src/services/TelegramCommandRouter';
import { TelegramConversationStateService } from '../src/services/TelegramConversationStateService';
import { CALLBACKS, TelegramControlPresenter } from '../src/services/TelegramControlPresenter';

const update = (overrides: Partial<TelegramControlUpdate>): TelegramControlUpdate => ({
  user: { id: '123' },
  chat: { id: 'chat-1', type: 'private' },
  ...overrides,
});

describe('TelegramCommandRouter paper trading flow', () => {
  const buildRouter = () => {
    const state = new TelegramConversationStateService();
    const paperTradeService = {
      isEligible: jest.fn().mockReturnValue(true),
      getCurrentPrice: jest.fn().mockResolvedValue(182.55),
      createOpenTrade: jest.fn().mockResolvedValue({
        id: 'paper-1',
        ticker: 'NVDA',
        assetType: 'STOCK',
        timeframe: '5m',
        score: 100,
        entryPrice: 182.55,
        entryAt: new Date('2026-09-05T15:00:00.000Z'),
        status: 'OPEN',
        strategyVersion: 'v1',
        paperStrategyVersion: 'paper-v0.1',
        referenceSnapshotDate: '2026-09-05',
        mfeReferencePct: 0.89,
        maeReferencePct: -1.05,
        currentMfePct: 0,
        currentMaePct: 0,
        highestPriceSeen: 182.55,
        lowestPriceSeen: 182.55,
        levels: [],
      }),
      listOpenTrades: jest.fn().mockResolvedValue([]),
      closeTradeWithCurrentPrice: jest.fn(),
      continueFromLevel: jest.fn(),
    };
    const router = new TelegramCommandRouter(
      new TelegramAuthorizationService('123'),
      new TelegramControlPresenter(),
      state,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      console,
      undefined,
      paperTradeService,
    );

    return { router, state, paperTradeService };
  };

  it('registers a paper trade using the current 5m price', async () => {
    const { router, paperTradeService } = buildRouter();

    const start = await router.route(update({ callback: { data: CALLBACKS.paperRegister } }));
    const symbol = await router.route(update({ message: { text: 'nvda' } }));
    const created = await router.route(update({ callback: { data: CALLBACKS.paperUseCurrent } }));

    expect(start.text).toContain('REGISTRAR PAPER TRADE');
    expect(symbol.text).toContain('Precio actual');
    expect(paperTradeService.getCurrentPrice).toHaveBeenCalledWith('NVDA');
    expect(paperTradeService.createOpenTrade).toHaveBeenCalledWith(expect.objectContaining({
      ticker: 'NVDA',
      assetType: 'STOCK',
      timeframe: '5m',
      score: 100,
      strategyVersion: 'v1',
      entryPrice: 182.55,
    }));
    expect(created.text).toContain('PAPER TRADE REGISTRADO');
  });

  it('routes open paper trades without writing market/evidence data', async () => {
    const { router, paperTradeService } = buildRouter();

    const response = await router.route(update({ callback: { data: CALLBACKS.paperOpen } }));

    expect(response.text).toContain('No hay paper trades abiertos');
    expect(paperTradeService.listOpenTrades).toHaveBeenCalledTimes(1);
  });

  it('supports manual entry registration', async () => {
    const { router, paperTradeService } = buildRouter();

    await router.route(update({ callback: { data: CALLBACKS.paperRegister } }));
    await router.route(update({ message: { text: 'NVDA' } }));
    const manualPrompt = await router.route(update({ callback: { data: CALLBACKS.paperManual } }));
    const created = await router.route(update({ message: { text: '180.25' } }));

    expect(manualPrompt.text).toContain('Escribe el precio de entrada');
    expect(paperTradeService.createOpenTrade).toHaveBeenLastCalledWith(expect.objectContaining({ entryPrice: 180.25 }));
    expect(created.code).toBe('OK');
  });
});
