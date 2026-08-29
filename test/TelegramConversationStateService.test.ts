import { TelegramConversationStateService } from '../src/services/TelegramConversationStateService';

describe('TelegramConversationStateService', () => {
  it('sets and gets conversation state', () => {
    const now = new Date('2026-08-28T12:00:00.000Z');
    const service = new TelegramConversationStateService(15 * 60 * 1000, () => now);

    const state = service.set({
      userId: '123',
      flow: 'costs:evaluate',
      step: 'awaiting-capital',
      data: { brokerProfileId: 'BITSO_CRYPTO_MXN' },
    });

    expect(service.get('123')).toBe(state);
    expect(state.expiresAt).toEqual(new Date('2026-08-28T12:15:00.000Z'));
  });

  it('clears conversation state', () => {
    const service = new TelegramConversationStateService();

    service.set({ userId: '123', flow: 'market', step: 'awaiting-symbol' });
    service.clear('123');

    expect(service.get('123')).toBeUndefined();
  });

  it('expires state after TTL', () => {
    let currentTime = new Date('2026-08-28T12:00:00.000Z');
    const service = new TelegramConversationStateService(1000, () => currentTime);

    service.set({ userId: '123', flow: 'market', step: 'awaiting-symbol' });
    currentTime = new Date('2026-08-28T12:00:01.000Z');

    expect(service.get('123')).toBeUndefined();
  });

  it('keeps users isolated', () => {
    const service = new TelegramConversationStateService();

    service.set({ userId: '123', flow: 'costs', step: 'one', data: { capital: 5000 } });
    service.set({ userId: '456', flow: 'market', step: 'two', data: { ticker: 'NVDA' } });

    expect(service.get('123')?.flow).toBe('costs');
    expect(service.get('456')?.flow).toBe('market');
  });
});
