import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { transactionCostService } from '../../config/container';
import {
  TransactionCostServiceError,
  type TransactionCostEvaluationRequest,
} from '../../services/TransactionCostService';

export async function transactionCostsEvaluate(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  if (request.method !== 'POST') {
    return {
      status: 405,
      jsonBody: {
        ok: false,
        error: 'method-not-allowed',
        message: 'Use POST /api/transaction-costs/evaluate',
      },
    };
  }

  let body: TransactionCostEvaluationRequest;
  try {
    body = await parseJsonObjectBody(request);
  } catch (error) {
    return toErrorResponse(error);
  }

  try {
    const evaluation = transactionCostService.evaluate(body);

    return {
      status: 200,
      jsonBody: {
        ok: true,
        ...evaluation,
      },
    };
  } catch (error) {
    if (!(error instanceof TransactionCostServiceError)) {
      const message = error instanceof Error ? error.message : 'transaction-cost-evaluation-failed';
      context.error('Transaction cost evaluation failed', { message });
    }

    return toErrorResponse(error);
  }
}

app.http('transactionCostsEvaluate', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'transaction-costs/evaluate',
  handler: transactionCostsEvaluate,
});

const parseJsonObjectBody = async (request: HttpRequest): Promise<TransactionCostEvaluationRequest> => {
  try {
    const body = await request.json();

    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return body as TransactionCostEvaluationRequest;
    }
  } catch {
    throw new TransactionCostServiceError('invalid-request-body', 'Request body must be valid JSON.', 400);
  }

  throw new TransactionCostServiceError('invalid-request-body', 'Request body must be a JSON object.', 400);
};

const toErrorResponse = (error: unknown): HttpResponseInit => {
  if (error instanceof TransactionCostServiceError) {
    return {
      status: error.statusCode,
      jsonBody: {
        ok: false,
        error: error.code,
        message: error.message,
      },
    };
  }

  return {
    status: 500,
    jsonBody: {
      ok: false,
      error: 'transaction-cost-evaluation-failed',
      message: error instanceof Error ? error.message : 'Transaction cost evaluation failed.',
    },
  };
};
