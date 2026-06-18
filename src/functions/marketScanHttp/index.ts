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
  parseLimit,
  parseNotify,
  parseTickers,
  parseTickersFromMessage,
  parseWhatsAppText,
} from '../../utils/parse.utils';

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

  context.log(
    whatsAppText
      ? `Manual market scan requested from message: ${whatsAppText}`
      : 'Manual market scan requested',
  );

  const result = await marketScanExecutor.run(
    {
      tickers,
      timeframe,
      candleLimit,
      notify,
    },
    context,
  );

  return {
    status: 200,
    jsonBody: {
      ok: true,
      mode: 'manual',
      scannedTickers: result.scannedTickers,
      opportunities: result.opportunities.map((opportunity) => ({
        ticker: opportunity.ticker,
        timeframe: opportunity.timeframe,
        score: opportunity.score,
        trendScore: opportunity.trendScore,
        volumeScore: opportunity.volumeScore,
        momentumScore: opportunity.momentumScore,
        structureScore: opportunity.structureScore,
        reasons: opportunity.reasons,
        detectedAt: opportunity.detectedAt,
      })),
      notifiedSignals: result.notifiedSignals,
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
