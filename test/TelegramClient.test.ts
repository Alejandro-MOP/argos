import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { TelegramClient } from '../src/clients/TelegramClient';

const buildHttpClient = (): AxiosInstance => {
  return {
    post: jest.fn().mockResolvedValue({ data: { ok: true } }),
  } as unknown as AxiosInstance;
};

describe('TelegramClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not send when credentials are missing', async () => {
    const httpClient = buildHttpClient();
    const client = new TelegramClient('', '', true, httpClient);

    const sent = await client.sendMessage('hola');

    expect(sent).toBe(false);
    expect(httpClient.post).not.toHaveBeenCalled();
  });

  it('builds the Telegram sendMessage payload without logging the token', async () => {
    const httpClient = buildHttpClient();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const client = new TelegramClient('secret-token', '12345', true, httpClient);

    const sent = await client.sendMessage('mensaje de prueba');

    expect(sent).toBe(true);
    expect(httpClient.post).toHaveBeenCalledWith('/botsecret-token/sendMessage', {
      chat_id: '12345',
      text: 'mensaje de prueba',
      disable_web_page_preview: true,
    });
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret-token'));
  });

  it('logs sanitized Axios errors without the token or full URL', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new AxiosError(
      'Request failed https://api.telegram.org/botsecret-token/sendMessage',
    );
    Object.defineProperty(error, 'response', {
      value: {
        status: 401,
        statusText: 'Unauthorized',
      },
    });
    const httpClient = {
      post: jest.fn().mockRejectedValue(error),
    } as unknown as AxiosInstance;
    const client = new TelegramClient('secret-token', '12345', true, httpClient);

    const sent = await client.sendMessage('mensaje de prueba');

    expect(sent).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Error enviando mensaje a Telegram status=401 statusText=Unauthorized message=Request failed https://api.telegram.org/bot[redacted]/sendMessage',
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret-token'));
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('/botsecret-token'));
  });
});
