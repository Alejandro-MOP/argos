import type { TelegramRawUpdate } from '../src/clients/TelegramControlClient';
import { TelegramControlUpdateMapper } from '../src/services/TelegramControlUpdateMapper';

describe('TelegramControlUpdateMapper', () => {
  const mapper = new TelegramControlUpdateMapper();

  it('maps text messages into control updates', () => {
    const rawUpdate: TelegramRawUpdate = {
      update_id: 10,
      message: {
        from: { id: 123, username: 'luis', first_name: 'Luis' },
        chat: { id: 456, type: 'private' },
        text: '/menu',
      },
    };

    expect(mapper.map(rawUpdate)).toEqual({
      updateId: 10,
      updateType: 'message',
      user: { id: '123', username: 'luis', firstName: 'Luis' },
      chat: { id: '456', type: 'private' },
      message: { text: '/menu' },
    });
  });

  it('maps callback queries into control updates', () => {
    const rawUpdate: TelegramRawUpdate = {
      update_id: 11,
      callback_query: {
        id: 'callback-1',
        from: { id: 123, username: 'luis' },
        message: { chat: { id: 456, type: 'private' } },
        data: 'argos:v1:menu:main',
      },
    };

    expect(mapper.map(rawUpdate)).toEqual({
      updateId: 11,
      updateType: 'callback_query',
      callbackQueryId: 'callback-1',
      user: { id: '123', username: 'luis', firstName: undefined },
      chat: { id: '456', type: 'private' },
      callback: { id: 'callback-1', data: 'argos:v1:menu:main' },
    });
  });

  it('ignores unsupported updates safely', () => {
    expect(mapper.map({ update_id: 12 })).toBeUndefined();
    expect(mapper.map({ message: { text: '/start' } })).toBeUndefined();
  });
});
