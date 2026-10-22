import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject: generateObjectMock,
}));
vi.mock('@db/server', () => ({ db: {} }));
vi.mock('@trigger.dev/sdk', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  metadata: {},
  tasks: {},
}));
vi.mock('./update-policy', () => ({ updatePolicy: {} }));

import { extractRisksFromContext, extractVendorsFromContext } from './onboard-organization-helpers';

beforeEach(() => generateObjectMock.mockReset());

describe('direct Gemini onboarding', () => {
  it('extracts vendors with the direct Google model and preserves its output', async () => {
    generateObjectMock.mockResolvedValue({ object: { vendors: [] } });
    expect(await extractVendorsFromContext([])).toEqual([]);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          provider: 'google.generative-ai',
          modelId: 'gemini-3.8-flash',
        }),
      }),
    );
  });

  it('extracts risks with the direct Google model and preserves its output', async () => {
    generateObjectMock.mockResolvedValue({ object: { risks: [] } });
    expect(await extractRisksFromContext([], 'Example', [])).toEqual([]);
    expect(generateObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          provider: 'google.generative-ai',
          modelId: 'gemini-3.8-flash',
        }),
      }),
    );
  });
});
