import type { TelegramControlUpdate } from '../src/models/TelegramControl';
import { TelegramAuthorizationService } from '../src/services/TelegramAuthorizationService';
import { TelegramCommandRouter } from '../src/services/TelegramCommandRouter';
import { TelegramConversationStateService } from '../src/services/TelegramConversationStateService';
import { CALLBACKS, TelegramControlPresenter } from '../src/services/TelegramControlPresenter';

const buildRouter = () => {
  const conversationState = new TelegramConversationStateService();
  const router = new TelegramCommandRouter(
    new TelegramAuthorizationService('123'),
    new TelegramControlPresenter(),
    conversationState,
  );

  return { router, conversationState };
};

const update = (overrides: Partial<TelegramControlUpdate>): TelegramControlUpdate => ({
  user: { id: '123' },
  chat: { id: 'chat-1', type: 'private' },
  ...overrides,
});

describe('TelegramCommandRouter', () => {
  it('rejects unauthorized updates before command routing', () => {
    const { router } = buildRouter();

    const response = router.route(update({ user: { id: '999' }, message: { text: '/menu' } }));

    expect(response).toEqual({ code: 'UNAUTHORIZED', text: 'No autorizado.' });
  });

  it.each(['/start', '/menu'])('routes %s to the main menu and clears state', (command) => {
    const { router, conversationState } = buildRouter();
    conversationState.set({ userId: '123', flow: 'costs', step: 'awaiting-capital' });

    const response = router.route(update({ message: { text: command } }));

    expect(response.code).toBe('OK');
    expect(response.text).toContain('ARGOS Control');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('routes /help to help', () => {
    const { router } = buildRouter();

    const response = router.route(update({ message: { text: '/help' } }));

    expect(response.code).toBe('HELP');
    expect(response.text).toContain('ARGOS Control Help');
  });

  it('routes /cancel to cancel and clears state', () => {
    const { router, conversationState } = buildRouter();
    conversationState.set({ userId: '123', flow: 'costs', step: 'awaiting-target' });

    const response = router.route(update({ message: { text: '/cancel' } }));

    expect(response.code).toBe('CANCELLED');
    expect(conversationState.get('123')).toBeUndefined();
  });

  it('returns unknown command for unsupported text', () => {
    const { router } = buildRouter();

    const response = router.route(update({ message: { text: 'hola argos' } }));

    expect(response.code).toBe('UNKNOWN_COMMAND');
  });

  it.each([
    [CALLBACKS.mainMenu, 'OK', 'ARGOS Control'],
    [CALLBACKS.researchMenu, 'OK', 'Research'],
    [CALLBACKS.marketMenu, 'OK', 'Market'],
    [CALLBACKS.costsMenu, 'OK', 'Costs'],
    [CALLBACKS.systemMenu, 'OK', 'System'],
    [CALLBACKS.researchSnapshot, 'NOT_IMPLEMENTED', 'Research Snapshot integration is not available yet.'],
    [CALLBACKS.researchProfiles, 'NOT_IMPLEMENTED', 'Strategy Profiles integration is not available yet.'],
    [CALLBACKS.researchPerformance, 'NOT_IMPLEMENTED', 'Forward Performance integration is not available yet.'],
    [CALLBACKS.marketScan, 'NOT_IMPLEMENTED', 'Market Scan integration is not available yet.'],
    [CALLBACKS.marketAnalyze, 'NOT_IMPLEMENTED', 'Analyze Symbol integration is not available yet.'],
    [CALLBACKS.costsBitsoMxn, 'NOT_IMPLEMENTED', 'Bitso MXN costs integration is not available yet.'],
    [CALLBACKS.costsBitsoUsdc, 'NOT_IMPLEMENTED', 'Bitso USDC costs integration is not available yet.'],
    [CALLBACKS.systemStatus, 'NOT_IMPLEMENTED', 'System Status integration is not available yet.'],
    [CALLBACKS.systemHelp, 'HELP', 'ARGOS Control Help'],
    [CALLBACKS.back, 'OK', 'ARGOS Control'],
  ])('routes callback %s', (callbackData, expectedCode, expectedText) => {
    const { router } = buildRouter();

    const response = router.route(update({ callback: { data: callbackData } }));

    expect(response.code).toBe(expectedCode);
    expect(response.text).toContain(expectedText);
  });

  it.each([
    ['', 'empty callback'],
    ['other:v1:menu:main', 'unknown namespace'],
    ['argos:v2:menu:main', 'unknown version'],
    ['argos:v1', 'malformed callback'],
    ['argos:v1:admin:restart', 'unknown domain'],
    ['argos:v1:menu:unknown', 'unknown action'],
    [`argos:v1:menu:${'x'.repeat(80)}`, 'callback too long'],
  ])('handles malformed callback %s', (callbackData, reason) => {
    const { router } = buildRouter();

    const response = router.route(update({ callback: { data: callbackData } }));

    expect(response.code).toBe('INVALID_CALLBACK');
    expect(response.text).toContain(reason);
  });
});
