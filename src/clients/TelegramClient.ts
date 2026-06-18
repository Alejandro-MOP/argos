export class TelegramClient {
  public constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  public async sendMessage(message: string): Promise<void> {
    void this.botToken;
    void this.chatId;
    console.log(`[Telegram mock] ${message}`);
  }
}
