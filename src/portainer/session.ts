import { storage } from 'wxt/utils/storage';

const EXPIRY_SKEW_MS = 30_000;

const tokenItem = storage.defineItem<string>('session:portainerToken');

export function tokenExpiresAt(token: string): number | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (parts.length !== 3 || !payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    if (typeof claims === 'object' && claims !== null && 'exp' in claims) {
      const { exp } = claims;
      if (typeof exp === 'number' && Number.isFinite(exp)) {
        return exp * 1000;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function getToken(now: number = Date.now()): Promise<string | null> {
  const token = await tokenItem.getValue();
  if (!token) {
    return null;
  }
  const expiresAt = tokenExpiresAt(token);
  if (expiresAt !== null && now >= expiresAt - EXPIRY_SKEW_MS) {
    await tokenItem.removeValue();
    return null;
  }
  return token;
}

export async function saveToken(token: string): Promise<void> {
  await tokenItem.setValue(token);
}

export async function clearToken(): Promise<void> {
  await tokenItem.removeValue();
}
