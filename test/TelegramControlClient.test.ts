import { TelegramControlApiError, TelegramControlClient } from '../src/clients/TelegramControlClient';

const jsonResponse = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('TelegramControlClient', () => {
  it('calls getUpdates with offset and long polling timeout', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        result: [],
      }),
    );
    const client = new TelegramControlClient('secret-token', fetchMock, 'https://telegram.test');

    await expect(client.getUpdates({ offset: 44, timeoutSeconds: 25 })).resolves.toEqual([]);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/botsecret-token/getUpdates');
    expect(url.searchParams.get('offset')).toBe('44');
    expect(url.searchParams.get('timeout')).toBe('25');
  });

  it('sends messages with inline keyboards using Telegram reply_markup', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        result: true,
      }),
    );
    const client = new TelegramControlClient('secret-token', fetchMock, 'https://telegram.test');

    await client.sendMessage({
      chatId: 'chat-1',
      text: 'ARGOS Control',
      keyboard: { rows: [[{ text: 'Menu', callbackData: 'argos:v1:menu:main' }]] },
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: 'chat-1',
      text: 'ARGOS Control',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: 'Menu', callback_data: 'argos:v1:menu:main' }]],
      },
    });
  });

  it('maps Telegram retry_after from 429 responses', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
      jsonResponse(429, {
        ok: false,
        description: 'Too Many Requests',
        parameters: { retry_after: 7 },
      }),
    );
    const client = new TelegramControlClient('secret-token', fetchMock, 'https://telegram.test');

    await expect(client.getUpdates({ timeoutSeconds: 25 })).rejects.toMatchObject({
      status: 429,
      endpoint: 'getUpdates',
      retryAfterSeconds: 7,
    });
  });

  it('does not expose the bot token in API error messages', async () => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
      jsonResponse(401, {
        ok: false,
        description: 'Unauthorized',
      }),
    );
    const client = new TelegramControlClient('super-secret-token', fetchMock, 'https://telegram.test');

    await expect(client.getWebhookInfo()).rejects.toThrow(TelegramControlApiError);
    await expect(client.getWebhookInfo()).rejects.not.toThrow('super-secret-token');
  });
});
