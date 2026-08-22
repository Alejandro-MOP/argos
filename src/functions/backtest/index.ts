import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { backtestEngine } from '../../config/container';
import { env } from '../../config/env';
import { parseBody, parseTickers } from '../../utils/parse.utils';

interface BacktestHttpBody {
  tickers?: string[] | string;
  timeframe?: string;
  from?: string;
  to?: string;
  minimumScore?: number | string;
  stopLossPercent?: number | string;
  takeProfitMinPercent?: number | string;
  takeProfitMaxPercent?: number | string;
  includeTrades?: boolean | string;
}

export async function backtest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method !== 'POST') {
    return {
      status: 405,
      jsonBody: {
        ok: false,
        error: 'method-not-allowed',
        message: 'Use POST /api/backtest',
      },
    };
  }

  const body = (await parseBody(request)) as BacktestHttpBody;
  const tickers = parseTickers(body.tickers);

  if (!tickers || tickers.length === 0) {
    return badRequest('tickers is required');
  }

  const timeframe = body.timeframe ?? env.marketScanTimeframe;
  const from = parseDate(body.from);
  const to = parseDate(body.to);

  if (!from || !to) {
    return badRequest('from and to are required as valid dates');
  }

  const minimumScore = parseNumber(body.minimumScore, env.scoring.telegramNotificationMinScore);
  const stopLossPercent = parseNumber(body.stopLossPercent, env.tradePlan.stopLossPercent);
  const takeProfitMinPercent = parseNumber(body.takeProfitMinPercent, env.tradePlan.targetMinPercent);
  const takeProfitMaxPercent = parseNumber(body.takeProfitMaxPercent, env.tradePlan.targetMaxPercent);
  const includeTrades = parseBoolean(body.includeTrades, false);

  context.log(
    `Backtest solicitado tickers=${tickers.join(',')} timeframe=${timeframe} from=${from.toISOString()} to=${to.toISOString()} minimumScore=${minimumScore}`,
  );

  try {
    const result = await backtestEngine.run({
      tickers,
      timeframe,
      from,
      to,
      minimumScore,
      stopLossPercent,
      takeProfitMinPercent,
      takeProfitMaxPercent,
      includeTrades,
    });

    return {
      status: 200,
      jsonBody: result,
    };
  } catch (error) {
    return {
      status: 400,
      jsonBody: {
        ok: false,
        error: 'invalid-backtest-request',
        message: error instanceof Error ? error.message : 'Backtest request failed',
      },
    };
  }
}

app.http('backtest', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'backtest',
  handler: backtest,
});

const badRequest = (message: string): HttpResponseInit => ({
  status: 400,
  jsonBody: {
    ok: false,
    error: 'invalid-backtest-request',
    message,
  },
});

const parseDate = (value: string | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
};

const parseNumber = (value: number | string | undefined, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const parseBoolean = (value: boolean | string | undefined, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.trim().toLowerCase() === 'true';
  }

  return fallback;
};
