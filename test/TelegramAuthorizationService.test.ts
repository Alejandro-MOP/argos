import { parseTelegramAllowedUserIds } from '../src/config/env';
import { TelegramAuthorizationService, parseAllowedUserIds } from '../src/services/TelegramAuthorizationService';

describe('TelegramAuthorizationService', () => {
  it('authorizes allowed users by Telegram user id', () => {
    const service = new TelegramAuthorizationService('123,456');

    expect(service.isAuthorized({ id: '123' })).toBe(true);
    expect(service.isAuthorized({ id: '456' })).toBe(true);
  });

  it('rejects unauthorized users', () => {
    const service = new TelegramAuthorizationService('123');

    expect(service.isAuthorized({ id: '999' })).toBe(false);
  });

  it('rejects missing user ids', () => {
    const service = new TelegramAuthorizationService('123');

    expect(service.isAuthorized()).toBe(false);
    expect(service.isAuthorized({})).toBe(false);
  });

  it('supports multiple ids with whitespace', () => {
    const service = new TelegramAuthorizationService(' 123 , , 456 , 789 ');

    expect(service.getAllowedUserIds()).toEqual(['123', '456', '789']);
    expect(service.isAuthorized({ id: '789' })).toBe(true);
  });

  it('ignores invalid config entries safely', () => {
    expect(parseAllowedUserIds('123,abc,45x,,456')).toEqual(['123', '456']);
    expect(parseTelegramAllowedUserIds(' 1, nope, 2 ')).toEqual(['1', '2']);
  });
});
