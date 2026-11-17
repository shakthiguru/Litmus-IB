import fs from 'fs';
import path from 'path';
import { request } from '@playwright/test';
import { BASE_URL, PASS, STATE_DIR, PROXY } from './lib/env';

// Logs in once through the API and stores the session so tests start already signed in.
// Tries MASHREQCORP first, then demo (the brief says a reset may reseed the user as DEMO).
export default async function globalSetup() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const ctx = await request.newContext({ baseURL: BASE_URL, proxy: PROXY });
  const health = await ctx.get('/api/health'); // also warms the serverless functions
  if (!health.ok()) throw new Error(`ABDX health check failed: ${health.status()}`);
  const candidates = [process.env.ABDX_USER, 'MASHREQCORP', 'demo'].filter(Boolean) as string[];
  let session: any;
  for (const username of candidates) {
    const res = await ctx.post('/api/auth/login', { data: { username, password: PASS } });
    if (res.ok()) { session = await res.json(); break; }
  }
  if (!session) throw new Error(`Login failed for ${candidates.join(', ')}`);
  fs.writeFileSync(path.join(STATE_DIR, 'user.json'), JSON.stringify({ username: session.username }));
  fs.writeFileSync(path.join(STATE_DIR, 'auth.json'), JSON.stringify({
    cookies: [],
    origins: [{ origin: new URL(BASE_URL).origin, localStorage: [{ name: 'abdx_session', value: JSON.stringify(session) }] }],
  }));
  await ctx.dispose();
}
