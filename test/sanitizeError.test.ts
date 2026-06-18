import { sanitizeError } from '../src/utils/sanitizeError';

describe('sanitizeError', () => {
  it('removes apiKey from config, path, responseUrl and message', () => {
    const error = {
      isAxiosError: true,
      message: 'Request failed for /v2/aggs/ticker/SPY?apiKey=super-secret&adjusted=true',
      config: {
        url: '/v2/aggs/ticker/SPY?apiKey=super-secret&adjusted=true',
        params: {
          apiKey: 'super-secret',
        },
      },
      request: {
        path: '/v2/aggs/ticker/SPY?apiKey=super-secret&adjusted=true',
        responseUrl: 'https://api.polygon.io/v2/aggs/ticker/SPY?apiKey=super-secret&adjusted=true',
        _header: 'GET /v2/aggs/ticker/SPY?apiKey=super-secret HTTP/1.1',
      },
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'x-request-id': 'request-123',
        },
      },
    };

    const sanitized = sanitizeError(error, {
      provider: 'polygon',
      ticker: 'SPY',
    });
    const serialized = JSON.stringify(sanitized);

    expect(sanitized).toEqual({
      status: 429,
      statusText: 'Too Many Requests',
      provider: 'polygon',
      endpoint: '/v2/aggs/ticker/SPY',
      ticker: 'SPY',
      requestId: 'request-123',
      message: 'Request failed for /v2/aggs/ticker/SPY?apiKey=[redacted]&adjusted=true',
    });
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('_header');
    expect(serialized).not.toContain('responseUrl');
  });
});
