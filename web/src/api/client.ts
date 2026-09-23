export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}

export function arrange(text: string) {
  return api<{ key: string; title: string; lines: string[]; href: string; actions: unknown[]; adopted: boolean }>('/api/agent/arrange', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}
