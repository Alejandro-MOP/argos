import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { marketScanExecutor } from '../../config/container';
import {
  parseBody,
  parseCapital,
  parseLimit,
  parseNotify,
  parseScoreThreshold,
  parseTickers,
  parseTimeframes,
  parseTickersFromMessage,
  parseWhatsAppText,
} from '../../utils/parse.utils';
import { getOpportunityTypeFromTimeframe } from '../../utils/timeframe.utils';
import { calculateTradePlan } from '../../utils/tradeSizing.utils';

export async function marketScanHttp(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = request.method === 'POST' ? await parseBody(request) : {};
  const whatsAppText = parseWhatsAppText(body);
  const tickers =
    parseTickers(body.tickers) ??
    parseTickers(request.query.get('tickers')) ??
    parseTickersFromMessage(whatsAppText) ??
    undefined;
  const explicitTimeframes =
    parseTimeframes(body.timeframes) ??
    parseTimeframes(request.query.get('timeframes'));
  const explicitSingleTimeframe = parseTimeframes(body.timeframe ?? request.query.get('timeframe'));
  const timeframes = explicitTimeframes ?? explicitSingleTimeframe;
  const timeframe = timeframes?.[0];
  const rawLimit = body.limit ?? request.query.get('limit');
  const candleLimit = rawLimit === undefined || rawLimit === null ? undefined : parseLimit(rawLimit);
  const notify = parseNotify(body.notify ?? request.query.get('notify'));
  const capital = parseCapital(
    body.capital ??
      body.tradingCapital ??
      request.query.get('capital') ??
      request.query.get('tradingCapital'),
  );
  const opportunityMinScore = parseScoreThreshold(
    body.opportunityMinScore ??
      body.OPPORTUNITY_MIN_SCORE ??
      request.query.get('opportunityMinScore') ??
      request.query.get('OPPORTUNITY_MIN_SCORE'),
  );
  const telegramNotificationMinScore = parseScoreThreshold(
    body.telegramNotificationMinScore ??
      body.TELEGRAM_NOTIFICATION_MIN_SCORE ??
      request.query.get('telegramNotificationMinScore') ??
      request.query.get('TELEGRAM_NOTIFICATION_MIN_SCORE'),
  );

  context.log(
    whatsAppText
      ? `Escaneo manual solicitado desde mensaje: ${whatsAppText}`
      : 'Escaneo manual solicitado',
  );

  const result = await marketScanExecutor.run(
    {
      tickers,
      timeframe,
      timeframes,
      candleLimit,
      notify,
      capital,
      opportunityMinScore,
      telegramNotificationMinScore,
    },
    context,
  );

  const signalByOpportunity = new Map(
    result.opportunitySignals.map((signal) => [
      buildSignalKey(signal.ticker, signal.timeframe),
      signal,
    ]),
  );

  return {
    status: 200,
    jsonBody: {
      ok: true,
      mode: 'manual',
      scannedTickers: result.scannedTickers,
      scanned: result.scanned,
      timeframes: timeframes ?? [...new Set(result.scanned.map((item) => item.timeframe))],
      capital,
      thresholds: {
        opportunityMinScore: opportunityMinScore ?? result.runtimeConfig.scoring.opportunityMinScore,
        telegramNotificationMinScore:
          telegramNotificationMinScore ?? result.runtimeConfig.scoring.telegramNotificationMinScore,
        telegramNotificationTimeframes: result.runtimeConfig.telegramNotificationTimeframes,
      },
      opportunities: result.opportunities.map((opportunity) => {
        const signal = signalByOpportunity.get(
          buildSignalKey(opportunity.ticker, opportunity.timeframe),
        );

        return {
          ticker: opportunity.ticker,
          timeframe: opportunity.timeframe,
          opportunityType: getOpportunityTypeFromTimeframe(opportunity.timeframe),
          score: opportunity.score,
          trendScore: opportunity.trendScore,
          volumeScore: opportunity.volumeScore,
          momentumScore: opportunity.momentumScore,
          structureScore: opportunity.structureScore,
          reasons: opportunity.reasons,
          detectedAt: opportunity.detectedAt,
          tradePlan: signal ? calculateTradePlan(signal, result.runtimeConfig.tradePlan, capital) : undefined,
        };
      }),
      notifiedSignals: result.notifiedSignals.map((signal) => ({
        ...signal,
        opportunityType: getOpportunityTypeFromTimeframe(signal.timeframe),
        tradePlan: calculateTradePlan(signal, result.runtimeConfig.tradePlan, capital),
      })),
      skipped: result.skipped,
      errors: result.errors,
      metrics: result.metrics,
    },
  };
}

app.http('marketScanHttp', {
  methods: ['GET', 'POST'],
  authLevel: 'function',
  route: 'market-scan',
  handler: marketScanHttp,
});

const buildSignalKey = (ticker: string, timeframe: string): string => `${ticker}:${timeframe}`;
