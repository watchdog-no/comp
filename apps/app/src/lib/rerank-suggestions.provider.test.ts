import { afterEach, describe, expect, it, vi } from 'vitest';
import { rerankSuggestions } from './rerank-suggestions';

const input = {
  source: { kind: 'risk' as const, title: 'Data loss', description: 'Lost devices' },
  candidates: [{ id: 'tsk_1', title: 'Encrypt devices', description: '', cosineScore: 0.8 }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('direct Gemini ranking requests', () => {
  it('uses Google credentials and JSON output without a gateway key', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-google-key');
    vi.stubEnv('AI_GATEWAY_API_KEY', undefined);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: JSON.stringify({ scores: [{ id: 'tsk_1', score: 9 }] }) }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await rerankSuggestions(input);

    expect(result[0].rerankScore).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-google-key');
    expect(typeof init?.body).toBe('string');
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.scores.type).toBe('array');
  });

  it('does not fall back to gateway credentials when the Google key is missing', async () => {
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', undefined);
    vi.stubEnv('AI_GATEWAY_API_KEY', 'unused-gateway-key');
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(rerankSuggestions(input)).rejects.toThrow('GOOGLE_GENERATIVE_AI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
