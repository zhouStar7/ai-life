import { modelEndpoint } from '../../../shared/modelEndpoint.js';

export type ModelConfig = { baseUrl: string; apiKey: string; model: string };

export type ChatContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export async function complete(config: ModelConfig, messages: { role: string; content: ChatContent }[]) {
  const { apiBase } = modelEndpoint(config.baseUrl);
  const response = await fetch(`${apiBase}/chat/completions`, {
    redirect: 'error',
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model || 'local', temperature: 0.2, messages }),
  });
  if (!response.ok) throw new Error('model_unavailable');
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('model_unavailable');
  return content;
}

export async function discoverModels(config: ModelConfig) {
  const { ollama, origin, apiBase } = modelEndpoint(config.baseUrl);
  const options = { redirect: 'error' as const, signal: AbortSignal.timeout(10_000), headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : undefined };
  if (ollama) {
    const response = await fetch(`${origin}/api/tags`, options);
    if (response.ok) {
      const { models } = await response.json();
      return modelNames(models, 'name');
    }
    if (response.status !== 404) throw new Error('model_unavailable');
  }
  const response = await fetch(`${apiBase}/models`, options);
  if (!response.ok) throw new Error('model_unavailable');
  const { data } = await response.json();
  return modelNames(data, 'id');
}

function modelNames(rows: unknown, key: string): string[] {
  if (!Array.isArray(rows)) throw new Error('model_unavailable');
  const names = rows.map(row => row?.[key]);
  if (names.some(name => typeof name !== 'string' || !name.trim())) throw new Error('model_unavailable');
  return [...new Set<string>(names)].sort();
}

// A generated 64 × 64 red RGB PNG. The question deliberately omits the expected color.
const probeImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC';

export async function checkCapability(config: ModelConfig, capability: 'text' | 'image') {
  const content: ChatContent = capability === 'image' ? [
    { type: 'text', text: 'What color fills this image? Answer with one English color word.' },
    { type: 'image_url', image_url: { url: probeImage } },
  ] : 'Reply with the single word OK.';
  const answer = await complete(config, [{ role: 'user', content }]);
  const expected = capability === 'image' ? 'red' : 'ok';
  if (answer.trim().toLowerCase().replace(/[.!]$/, '') !== expected) throw new Error('unexpected_probe_answer');
}
