import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { researchSnapshotService } from '../../config/container';

export async function researchSnapshot(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  void context;

  if (request.method !== 'GET') {
    return {
      status: 405,
      jsonBody: {
        ok: false,
        error: 'method-not-allowed',
        message: 'Use GET /api/research-snapshot',
      },
    };
  }

  if (!researchSnapshotService) {
    return {
      status: 503,
      jsonBody: {
        ok: false,
        error: 'research-snapshot-unavailable',
        message: 'DATABASE_URL is required to query the research snapshot.',
      },
    };
  }

  const snapshot = await researchSnapshotService.generate();

  return {
    status: 200,
    jsonBody: {
      ok: true,
      ...snapshot,
    },
  };
}

app.http('researchSnapshot', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'research-snapshot',
  handler: researchSnapshot,
});
