import type { InlineKeyboard } from '../models/TelegramControl';

export interface TelegramRawUser {
  id?: number;
  username?: string;
  first_name?: string;
}

export interface TelegramRawChat {
  id?: number;
  type?: string;
}

export interface TelegramRawMessage {
  message_id?: number;
  from?: TelegramRawUser;
  chat?: TelegramRawChat;
  text?: string;
}

export interface TelegramRawCallbackQuery {
  id?: string;
  from?: TelegramRawUser;
  message?: TelegramRawMessage;
  data?: string;
}

export interface TelegramRawUpdate {
  update_id?: number;
  message?: TelegramRawMessage;
  callback_query?: TelegramRawCallbackQuery;
}

export interface TelegramWebhookInfo {
  url: string;
  pending_update_count?: number;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: {
    retry_after?: number;
  };
}

export interface SendControlMessageInput {
  chatId: string;
  text: string;
  keyboard?: InlineKeyboard;
}

export class TelegramControlApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'TelegramControlApiError';
  }
}

type FetchLike = typeof fetch;

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 35_000;

export class TelegramControlClient {
  public constructor(
    private readonly botToken: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = TELEGRAM_API_BASE_URL,
  ) {}

  public async getUpdates(params: { offset?: number; timeoutSeconds: number }): Promise<TelegramRawUpdate[]> {
    const query = new URLSearchParams({ timeout: String(params.timeoutSeconds) });

    if (params.offset !== undefined) {
      query.set('offset', String(params.offset));
    }

    return this.request<TelegramRawUpdate[]>('getUpdates', {
      method: 'GET',
      query,
      timeoutMs: (params.timeoutSeconds + 10) * 1000,
    });
  }

  public async sendMessage(input: SendControlMessageInput): Promise<void> {
    await this.request('sendMessage', {
      method: 'POST',
      body: {
        chat_id: input.chatId,
        text: input.text,
        disable_web_page_preview: true,
        ...(input.keyboard ? { reply_markup: mapInlineKeyboard(input.keyboard) } : {}),
      },
    });
  }

  public async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.request('answerCallbackQuery', {
      method: 'POST',
      body: {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      },
    });
  }

  public async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    return this.request<TelegramWebhookInfo>('getWebhookInfo', { method: 'GET' });
  }

  private async request<T>(
    endpoint: string,
    options: {
      method: 'GET' | 'POST';
      query?: URLSearchParams;
      body?: Record<string, unknown>;
      timeoutMs?: number;
    },
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    const url = this.buildUrl(endpoint, options.query);

    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers: options.body ? { 'content-type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const payload = await parseTelegramResponse<T>(response);

      if (!response.ok || !payload.ok) {
        throw new TelegramControlApiError(
          buildTelegramErrorMessage(endpoint, response.status, payload),
          response.status || payload.error_code || 0,
          endpoint,
          payload.parameters?.retry_after,
        );
      }

      return payload.result as T;
    } catch (error) {
      if (error instanceof TelegramControlApiError) {
        throw error;
      }

      throw new TelegramControlApiError(
        `Telegram Control Bot request failed at ${endpoint}.`,
        0,
        endpoint,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(endpoint: string, query?: URLSearchParams): string {
    const suffix = query && query.toString().length > 0 ? `?${query.toString()}` : '';

    return `${this.baseUrl}/bot${this.botToken}/${endpoint}${suffix}`;
  }
}

const mapInlineKeyboard = (keyboard: InlineKeyboard): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } => ({
  inline_keyboard: keyboard.rows.map((row) => row.map((button) => ({ text: button.text, callback_data: button.callbackData }))),
});

const parseTelegramResponse = async <T>(response: Response): Promise<TelegramApiResponse<T>> => {
  try {
    return (await response.json()) as TelegramApiResponse<T>;
  } catch {
    return { ok: false, description: 'Invalid Telegram API response.' };
  }
};

const buildTelegramErrorMessage = <T>(
  endpoint: string,
  status: number,
  payload: TelegramApiResponse<T>,
): string => {
  const description = payload.description ? ` ${payload.description}` : '';

  return `Telegram Control Bot API error at ${endpoint}. status=${status || payload.error_code || 'n/a'}.${description}`.slice(0, 220);
};
