export type ModelConfig = { baseUrl: string; apiKey: string; model: string };

export type ChatContent =
  | string
  | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

export async function complete(config: ModelConfig, messages: { role: string; content: ChatContent }[]) {
  const root = config.baseUrl.replace(/\/$/, '');
  const url = root.endsWith('/chat/completions') ? root : `${root}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model || 'local', temperature: 0.2, messages }),
  });
  if (!response.ok) throw new Error('model_unavailable');
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('model_unavailable');
  return content;
}
