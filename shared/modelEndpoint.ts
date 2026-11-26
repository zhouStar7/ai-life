export const localOllamaBase = 'http://127.0.0.1:11434/v1';

export function modelEndpoint(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_model_address');
  }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/.test(url.hostname);
  const path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const ollama = loopback && url.port === '11434' && (!path || path === '/v1');
  return { origin: url.origin, loopback, ollama, apiBase: url.origin + (ollama ? '/v1' : path) };
}

export function modelDestination(baseUrl: string) {
  if (!baseUrl.trim()) return '未配置模型，仅在应用本机处理';
  try {
    const { origin, loopback } = modelEndpoint(baseUrl);
    return `${loopback ? '本机模型' : '远程模型'}（${origin}）`;
  } catch { return '接口地址无效，请在设置中更正'; }
}
