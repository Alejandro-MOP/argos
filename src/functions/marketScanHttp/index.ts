import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { marketScanExecutor } from '../../config/container';
import { env } from '../../config/env';
import {
  parseBody,
  parseCapital,
  parseLimit,
  parseNotify,
  parseTickers,
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
  const timeframe = body.timeframe ?? request.query.get('timeframe') ?? env.marketScanTimeframe;
  const candleLimit = parseLimit(body.limit ?? request.query.get('limit'));
  const notify = parseNotify(body.notify ?? request.query.get('notify'));
  const capital = parseCapital(
    body.capital ??
      body.tradingCapital ??
      request.query.get('capital') ??
      request.query.get('tradingCapital'),
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
      candleLimit,
      notify,
      capital,
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
      capital,
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
          tradePlan: signal ? calculateTradePlan(signal, env.tradePlan, capital) : undefined,
        };
      }),
      notifiedSignals: result.notifiedSignals.map((signal) => ({
        ...signal,
        opportunityType: getOpportunityTypeFromTimeframe(signal.timeframe),
        tradePlan: calculateTradePlan(signal, env.tradePlan, capital),
      })),
      skipped: result.skipped,
      errors: result.errors,
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
