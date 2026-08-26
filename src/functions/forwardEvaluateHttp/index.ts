import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { forwardSignalEvaluator } from '../../config/container';
import { parseBody } from '../../utils/parse.utils';

interface ForwardEvaluateHttpBody {
  signalId?: string;
  ticker?: string;
  limit?: number | string;
}

export async function forwardEvaluateHttp(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method !== 'POST') {
    return {
      status: 405,
      jsonBody: {
        ok: false,
        error: 'method-not-allowed',
        message: 'Use POST /api/forward-evaluate',
      },
    };
  }

  const body = (await parseBody(request)) as ForwardEvaluateHttpBody;
  const signalId = body.signalId ?? request.query.get('signalId') ?? undefined;
  const ticker = body.ticker ?? request.query.get('ticker') ?? undefined;
  const limit = parseLimit(body.limit ?? request.query.get('limit'));

  const result = await forwardSignalEvaluator.execute(
    {
      signalId,
      ticker,
      limit,
    },
    context,
  );

  return {
    status: 200,
    jsonBody: result,
  };
}

app.http('forwardEvaluateHttp', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'forward-evaluate',
  handler: forwardEvaluateHttp,
});

const parseLimit = (value: number | string | null | undefined): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
};
