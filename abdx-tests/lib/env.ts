import fs from 'fs';
import path from 'path';

export const BASE_URL = process.env.ABDX_BASE_URL ?? 'https://abdx.vercel.app';
export const PASS = process.env.ABDX_PASS ?? 'Test@123';
export const STATE_DIR = path.join(__dirname, '..', '.state');

/** Username resolved by global-setup (MASHREQCORP, falling back to demo after a reseed). */
export function USER(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'user.json'), 'utf8')).username;
  } catch {
    return process.env.ABDX_USER ?? 'MASHREQCORP';
  }
}

export const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
export const CBP_REF = /^CBP\d{10}$/;
export const IBG_REF = /^IBG\d{10}$/;

/** Honour a corporate/sandbox HTTPS proxy when one is configured (no effect otherwise). */
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
export const PROXY = proxyServer ? { server: proxyServer, bypass: process.env.NO_PROXY || process.env.no_proxy } : undefined;
