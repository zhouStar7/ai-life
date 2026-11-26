export async function sessionCookie(base: string, username = 'xingyu', password = 'life-local') {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const listed = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie') ?? ''];
  const raw = listed.find((item) => item.startsWith('ailife=')) ?? '';
  return raw.split(';')[0];
}
