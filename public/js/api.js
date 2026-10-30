/**
 * Thin wrapper around fetch() for OUR server's REST API.
 * (The browser never calls the Banana API directly. Our server does, so the puzzle answer
 * stays secret. See services/bananaClient.js.)
 *
 * VIRTUAL IDENTITY: the login cookie is httpOnly, so this code can't see it. The browser just
 * attaches it automatically to same-origin requests (credentials: 'same-origin').
 */
async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin'
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  avatars: () => request('GET', '/api/auth/avatars'),
  me: () => request('GET', '/api/auth/me'),
  register: (b) => request('POST', '/api/auth/register', b),
  login: (b) => request('POST', '/api/auth/login', b),
  logout: () => request('POST', '/api/auth/logout'),
  leaderboard: () => request('GET', '/api/leaderboard'),
  startGame: () => request('POST', '/api/game/start', {}),
  answer: (b) => request('POST', '/api/game/answer', b),
  cashout: (b) => request('POST', '/api/game/cashout', b),
  next: (b) => request('POST', '/api/game/next', b),
  quit: (b) => request('POST', '/api/game/quit', b)
};
