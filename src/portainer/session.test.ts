import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearToken, getToken, saveToken, tokenExpiresAt } from './session';

const expSeconds = 1_800_000_000;
const expMs = expSeconds * 1000;

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function jwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  return `${header}.${base64url(JSON.stringify(payload))}.sig`;
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('tokenExpiresAt', () => {
  it('reads exp from a base64url payload without padding', () => {
    const payload = base64url(JSON.stringify({ id: 1, username: 'adm?n', exp: expSeconds }));
    expect(payload).toMatch(/_/);
    expect(payload.length % 4).not.toBe(0);

    expect(tokenExpiresAt(`header.${payload}.sig`)).toBe(expMs);
  });

  it.each([
    ['not a jwt', 'not-a-jwt'],
    ['a payload that is not base64', 'a.!!!.c'],
    ['a payload that is not JSON', `a.${base64url('nope')}.c`],
    ['no exp', jwt({ id: 1 })],
    ['a string exp', jwt({ exp: String(expSeconds) })],
    ['too many parts', `${jwt({ exp: expSeconds })}.extra`],
  ])('returns null for %s', (_name, token) => {
    expect(tokenExpiresAt(token)).toBeNull();
  });
});

describe('session token', () => {
  it('returns null when nothing is saved', async () => {
    await expect(getToken()).resolves.toBeNull();
  });

  it('saves the token to session storage only', async () => {
    const token = jwt({ exp: expSeconds });

    await saveToken(token);

    await expect(getToken(expMs - 60_000)).resolves.toBe(token);
    await expect(fakeBrowser.storage.session.get(null)).resolves.toStrictEqual({ portainerToken: token });
    await expect(fakeBrowser.storage.local.get(null)).resolves.toStrictEqual({});
  });

  it('clears an expired token', async () => {
    await saveToken(jwt({ exp: expSeconds }));

    await expect(getToken(expMs + 1)).resolves.toBeNull();
    await expect(fakeBrowser.storage.session.get(null)).resolves.toStrictEqual({});
  });

  it('treats a token within 30 seconds of expiry as expired', async () => {
    const token = jwt({ exp: expSeconds });
    await saveToken(token);

    await expect(getToken(expMs - 30_001)).resolves.toBe(token);
    await expect(getToken(expMs - 30_000)).resolves.toBeNull();
    await expect(getToken(expMs - 60_000)).resolves.toBeNull();
  });

  it('returns a token with an unknown expiry as it is', async () => {
    await saveToken('opaque-token');

    expect(tokenExpiresAt('opaque-token')).toBeNull();
    await expect(getToken()).resolves.toBe('opaque-token');
  });

  it('clears the token', async () => {
    await saveToken(jwt({ exp: expSeconds }));

    await clearToken();

    await expect(getToken(0)).resolves.toBeNull();
  });
});
