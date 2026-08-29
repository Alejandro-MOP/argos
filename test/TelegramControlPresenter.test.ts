import { CALLBACKS, TelegramControlPresenter } from '../src/services/TelegramControlPresenter';

describe('TelegramControlPresenter', () => {
  const presenter = new TelegramControlPresenter();

  it('renders main menu with stable callback data', () => {
    expect(presenter.mainMenu()).toEqual({
      code: 'OK',
      text: 'ARGOS Control\n\nSelecciona una opción:',
      keyboard: {
        rows: [
          [
            { text: '📊 Research', callbackData: CALLBACKS.researchMenu },
            { text: '🔎 Market', callbackData: CALLBACKS.marketMenu },
          ],
          [
            { text: '💰 Costs', callbackData: CALLBACKS.costsMenu },
            { text: '⚙️ System', callbackData: CALLBACKS.systemMenu },
          ],
        ],
      },
    });
  });

  it('renders research menu', () => {
    const response = presenter.researchMenu();

    expect(response.text).toContain('Research');
    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '📊 Snapshot', callbackData: CALLBACKS.researchSnapshot },
      { text: '📈 Strategy Profiles', callbackData: CALLBACKS.researchProfiles },
      { text: '🧪 Forward Performance', callbackData: CALLBACKS.researchPerformance },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders market menu', () => {
    const response = presenter.marketMenu();

    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '🔎 Analyze Symbol', callbackData: CALLBACKS.marketAnalyze },
      { text: '🚀 Run Market Scan', callbackData: CALLBACKS.marketScan },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders costs menu', () => {
    const response = presenter.costsMenu();

    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '🇲🇽 Bitso MXN', callbackData: CALLBACKS.costsBitsoMxn },
      { text: '💵 Bitso USDC', callbackData: CALLBACKS.costsBitsoUsdc },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders system menu', () => {
    const response = presenter.systemMenu();

    expect(response.keyboard?.rows.flat()).toEqual([
      { text: '❤️ Status', callbackData: CALLBACKS.systemStatus },
      { text: '❓ Help', callbackData: CALLBACKS.systemHelp },
      { text: '⬅️ Back', callbackData: CALLBACKS.back },
    ]);
  });

  it('renders back navigation on helper responses', () => {
    expect(presenter.help().keyboard?.rows).toEqual([[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]]);
    expect(presenter.invalidCallback('bad').keyboard?.rows).toEqual([[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]]);
    expect(presenter.notImplemented('Research Snapshot').keyboard?.rows).toEqual([[{ text: '⬅️ Back', callbackData: CALLBACKS.back }]]);
  });
});
