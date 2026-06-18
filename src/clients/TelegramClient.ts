import axios, { AxiosError, type AxiosInstance } from 'axios';

export class TelegramClient {
  private readonly httpClient: AxiosInstance;

  public constructor(
    private readonly botToken: string,
    private readonly chatId: string,
    private readonly enabled: boolean,
    httpClient?: AxiosInstance,
  ) {
    this.httpClient =
      httpClient ??
      axios.create({
        baseURL: 'https://api.telegram.org',
        timeout: 10_000,
      });
  }

  public async sendMessage(message: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      await this.httpClient.post(`/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        disable_web_page_preview: true,
      });

      return true;
    } catch (error) {
      this.logSafeAxiosError(error);

      return false;
    }
  }

  private isConfigured(): boolean {
    return this.enabled && this.botToken.trim().length > 0 && this.chatId.trim().length > 0;
  }

  private logSafeAxiosError(error: unknown): void {
    if (error instanceof AxiosError) {
      console.error(
        [
          'Error enviando mensaje a Telegram',
          `status=${error.response?.status ?? 'n/a'}`,
          `statusText=${error.response?.statusText ?? 'n/a'}`,
          `message=${this.sanitizeErrorMessage(error.message)}`,
        ].join(' '),
      );
      return;
    }

    console.error(
      `Error enviando mensaje a Telegram message=${
        error instanceof Error ? this.sanitizeErrorMessage(error.message) : 'desconocido'
      }`,
    );
  }

  private sanitizeErrorMessage(message: string): string {
    return message
      .replaceAll(this.botToken, '[redacted]')
      .replace(/\/bot[^/\s]+\/sendMessage/g, '/bot[redacted]/sendMessage')
      .slice(0, 180);
  }
}
