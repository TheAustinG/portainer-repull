export function tokenExpiresAt(_token: string): number | null {
  throw new Error('not implemented');
}

export async function getToken(_now: number = Date.now()): Promise<string | null> {
  throw new Error('not implemented');
}

export async function saveToken(_token: string): Promise<void> {
  throw new Error('not implemented');
}

export async function clearToken(): Promise<void> {
  throw new Error('not implemented');
}
