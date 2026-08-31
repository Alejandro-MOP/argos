import type { TelegramRawUpdate, TelegramWebhookInfo } from '../src/clients/TelegramControlClient';
import { TelegramControlApiError } from '../src/clients/TelegramControlClient';
import type { ControlResponse } from '../src/models/TelegramControl';
import { CALLBACKS } from '../src/services/TelegramControlPresenter';
import {
  sanitizeTelegramControlError,
  TelegramControlFatalPollingError,
  TelegramControlPollingService,
  TelegramControlStartupError,
  type TelegramControlPollingLogger,
} from '../src/services/TelegramControlPollingService';
import { TelegramControlUpdateMapper } from '../src/services/TelegramControlUpdateMapper';

const messageUpdate = (updateId = 1, userId = 123, chatId = 456, text = '/menu'): TelegramRawUpdate => ({
  update_id: updateId,
  message: {
    from: { id: userId, username: 'safe-user' },
    chat: { id: chatId, type: 'private' },
    text,
  },
});

const callbackUpdate = (updateId = 1, userId = 123, chatId = 456): TelegramRawUpdate => ({
  update_id: updateId,
  callback_query: {
    id: `callback-${updateId}`,
    from: { id: userId, username: 'safe-user' },
    message: { chat: { id: chatId, type: 'private' } },
    data: CALLBACKS.mainMenu,
  },
});

const response = (text = 'ok'): ControlResponse => ({ code: 'OK', text });

const buildService = (options?: {
  enabled?: boolean;
  token?: string;
  allowedUserIds?: string[];
  updates?: TelegramRawUpdate[];
  webhookInfo?: TelegramWebhookInfo;
  authorized?: boolean;
  routeResponse?: ControlResponse;
  pollingError?: unknown;
}) => {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const logger: TelegramControlPollingLogger = {
    log: (message) => logs.push(message),
    warn: (message) => warnings.push(message),
    error: (message) => errors.push(message),
  };
  const sleep = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
  const getUpdates = jest.fn<Promise<TelegramRawUpdate[]>, [{ offset?: number; timeoutSeconds: number }]>();

  if (options?.pollingError) {
    getUpdates.mockRejectedValue(options.pollingError);
  } else {
    getUpdates.mockResolvedValue(options?.updates ?? []);
  }

  const client = {
    getUpdates,
    sendMessage: jest.fn<Promise<void>, [{ chatId: string; text: string; keyboard?: ControlResponse['keyboard'] }]>().mockResolvedValue(
      undefined,
    ),
    answerCallbackQuery: jest.fn<Promise<void>, [string, string?]>().mockResolvedValue(undefined),
    getWebhookInfo: jest.fn<Promise<TelegramWebhookInfo>, []>().mockResolvedValue(options?.webhookInfo ?? { url: '' }),
  };
  const authorizationService = {
    isAuthorized: jest.fn().mockReturnValue(options?.authorized ?? true),
  };
  const router = {
    route: jest.fn().mockReturnValue(options?.routeResponse ?? response()),
  };
  const service = new TelegramControlPollingService(
    {
      enabled: options?.enabled ?? true,
      botToken: options?.token ?? 'control-token',
      allowedUserIds: options?.allowedUserIds ?? ['123'],
      pollingTimeoutSeconds: 25,
      maxBackoffMs: 4_000,
    },
    {
      client,
      mapper: new TelegramControlUpdateMapper(),
      authorizationService,
      router,
      logger,
      sleep,
    },
  );

  return { service, client, authorizationService, router, sleep, logs, warnings, errors };
};

describe('TelegramControlPollingService', () => {
  it('does not poll when the Control Bot is disabled', async () => {
    const { service, client, logs } = buildService({ enabled: false });

    await service.start();

    expect(client.getWebhookInfo).not.toHaveBeenCalled();
    expect(client.getUpdates).not.toHaveBeenCalled();
    expect(logs).toContain('Telegram Control Bot disabled.');
  });

  it('fails startup when enabled without bot token', async () => {
    const { service, client } = buildService({ token: '   ' });

    await expect(service.validateStartup()).rejects.toThrow(TelegramControlStartupError);
    expect(client.getWebhookInfo).not.toHaveBeenCalled();
  });

  it('warns when no allowed users are configured and denies updates before routing', async () => {
    const { service, client, authorizationService, router, warnings } = buildService({
      allowedUserIds: [],
      authorized: false,
      updates: [messageUpdate()],
    });

    await service.validateStartup();
    await service.pollOnce();

    expect(warnings).toContain('Telegram Control Bot has no allowed users configured. All users will be denied.');
    expect(authorizationService.isAuthorized).toHaveBeenCalledWith(expect.objectContaining({ id: '123' }));
    expect(router.route).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith({ chatId: '456', text: 'Unauthorized.' });
  });

  it('blocks startup when the bot has an active webhook', async () => {
    const { service } = buildService({ webhookInfo: { url: 'https://example.com/webhook' } });

    await expect(service.validateStartup()).rejects.toThrow(
      'Telegram Control Bot has active webhook. Long polling cannot start safely.',
    );
  });

  it('routes authorized text messages and sends the presenter response to the incoming chat', async () => {
    const { service, client, router } = buildService({
      updates: [messageUpdate(7, 123, 999, '/start')],
      routeResponse: { code: 'OK', text: 'ARGOS Control', keyboard: { rows: [[{ text: 'Back', callbackData: CALLBACKS.back }]] } },
    });

    await service.pollOnce();

    expect(router.route).toHaveBeenCalledWith(expect.objectContaining({ message: { text: '/start' } }));
    expect(client.sendMessage).toHaveBeenCalledWith({
      chatId: '999',
      text: 'ARGOS Control',
      keyboard: { rows: [[{ text: 'Back', callbackData: CALLBACKS.back }]] },
    });
  });

  it('routes authorized callback queries and answers the callback query', async () => {
    const { service, client, router } = buildService({ updates: [callbackUpdate(8)] });

    await service.pollOnce();

    expect(router.route).toHaveBeenCalledWith(expect.objectContaining({ callback: { id: 'callback-8', data: CALLBACKS.mainMenu } }));
    expect(client.answerCallbackQuery).toHaveBeenCalledWith('callback-8', undefined);
  });

  it('answers callback queries even when routing fails', async () => {
    const { service, client, router, errors } = buildService({ updates: [callbackUpdate(9)] });
    router.route.mockImplementation(() => {
      throw new Error('router exploded');
    });

    await service.pollOnce();

    expect(client.answerCallbackQuery).toHaveBeenCalledWith('callback-9', 'Error.');
    expect(errors).toEqual(['router exploded']);
  });


  it('sends the immediate response and starts background tasks without awaiting completion', async () => {
    let finishBackground!: () => void;
    const backgroundStarted = jest.fn();
    const backgroundFinished = jest.fn();
    const backgroundTask = jest.fn(async (sender) => {
      backgroundStarted();
      await new Promise<void>((resolve) => { finishBackground = resolve; });
      await sender.send({ code: 'OK', text: 'MARKET SCAN COMPLETED' });
      backgroundFinished();
    });
    const { service, client } = buildService({
      updates: [callbackUpdate(77)],
      routeResponse: { code: 'OK', text: 'Market Scan iniciado', backgroundTasks: [backgroundTask] },
    });

    await service.pollOnce();

    expect(client.sendMessage).toHaveBeenCalledWith({ chatId: '456', text: 'Market Scan iniciado', keyboard: undefined });
    expect(client.answerCallbackQuery).toHaveBeenCalledWith('callback-77', undefined);
    expect(backgroundStarted).toHaveBeenCalledTimes(1);
    expect(backgroundFinished).not.toHaveBeenCalled();

    finishBackground();
    await new Promise((resolve) => setImmediate(resolve));

    expect(client.sendMessage).toHaveBeenCalledWith({ chatId: '456', text: 'MARKET SCAN COMPLETED', keyboard: undefined });
    expect(backgroundFinished).toHaveBeenCalledTimes(1);
  });

  it('logs safe background task failures without breaking polling', async () => {
    const { service, errors } = buildService({
      updates: [callbackUpdate(78)],
      routeResponse: {
        code: 'OK',
        text: 'Market Scan iniciado',
        backgroundTasks: [async () => { throw new Error('token=super-secret failed'); }],
      },
    });

    await service.pollOnce();
    await new Promise((resolve) => setImmediate(resolve));

    expect(errors).toEqual([expect.not.stringContaining('super-secret')]);
  });

  it('advances the in-memory offset after the highest received update id', async () => {
    const { service, client } = buildService({
      updates: [messageUpdate(100), { update_id: 101 }, messageUpdate(102)],
    });

    const result = await service.pollOnce();

    expect(result).toEqual({ updatesReceived: 3, updatesProcessed: 2, nextOffset: 103 });
    expect(service.getNextOffset()).toBe(103);
    await service.pollOnce();
    expect(client.getUpdates).toHaveBeenLastCalledWith({ offset: 103, timeoutSeconds: 25 });
  });

  it('handles empty update responses without side effects', async () => {
    const { service, client, router } = buildService({ updates: [] });

    await expect(service.pollOnce()).resolves.toEqual({ updatesReceived: 0, updatesProcessed: 0, nextOffset: undefined });

    expect(router.route).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('uses Telegram retry_after for 429 responses', async () => {
    const { service, sleep, warnings } = buildService({
      pollingError: new TelegramControlApiError('rate limited', 429, 'getUpdates', 6),
    });

    await service.runPollingIteration();

    expect(sleep).toHaveBeenCalledWith(6_000);
    expect(warnings).toContain('Telegram Control Bot rate limited. retryAfterSeconds=6');
  });

  it('treats 401 as a fatal polling error', async () => {
    const { service } = buildService({ pollingError: new TelegramControlApiError('Unauthorized', 401, 'getUpdates') });

    await expect(service.runPollingIteration()).rejects.toThrow(TelegramControlFatalPollingError);
  });

  it('backs off for 5xx and network errors, then resets after a successful poll', async () => {
    const { service, client, sleep } = buildService();
    client.getUpdates
      .mockRejectedValueOnce(new TelegramControlApiError('server error', 500, 'getUpdates'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([]);

    await service.runPollingIteration();
    expect(sleep).toHaveBeenLastCalledWith(1_000);
    expect(service.getCurrentBackoffMs()).toBe(2_000);

    await service.runPollingIteration();
    expect(sleep).toHaveBeenLastCalledWith(2_000);
    expect(service.getCurrentBackoffMs()).toBe(4_000);

    await service.runPollingIteration();
    expect(service.getCurrentBackoffMs()).toBe(1_000);
  });

  it('stops gracefully after a shutdown signal is requested', async () => {
    const { service, client, logs } = buildService({ updates: [] });
    client.getUpdates.mockImplementation(async () => {
      service.stop();
      return [];
    });

    await service.start();

    expect(client.getUpdates).toHaveBeenCalledTimes(1);
    expect(logs).toContain('Telegram Control Worker stopping...');
    expect(logs).toContain('Telegram Control Worker stopped.');
  });

  it('sanitizes tokens before logging polling errors', async () => {
    const sanitized = sanitizeTelegramControlError(
      new Error('failed https://api.telegram.org/botsuper-secret-token/getUpdates?token=super-secret-token'),
    );

    expect(sanitized).toContain('/bot[redacted]/');
    expect(sanitized).toContain('token=[redacted]');
    expect(sanitized).not.toContain('super-secret-token');
  });
});
