import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { PortainerError } from '@/portainer/errors';
import { redeployStack } from '@/portainer/redeploy';
import { clearToken, getToken } from '@/portainer/session';
import type { Stack } from '@/portainer/types';
import { portainerUrl } from '@/settings';
import { handleRedeploy, isRedeployRequest } from './redeploy-handler';

vi.mock('@/portainer/client', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@/portainer/redeploy', () => ({ redeployStack: vi.fn() }));
vi.mock('@/portainer/session', () => ({ getToken: vi.fn(), clearToken: vi.fn() }));

const request = { type: 'redeploy', stackId: 41, stackName: 'repull-spike' } as const;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<Stack>((done) => {
    resolve = () => done({} as Stack);
  });
  return { promise, resolve };
}

let notify: ReturnType<typeof vi.fn>;
let platformInfo: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.mocked(redeployStack).mockReset().mockResolvedValue({} as Stack);
  vi.mocked(getToken).mockReset().mockResolvedValue('token');
  vi.mocked(clearToken).mockReset().mockResolvedValue();
  notify = vi.fn().mockResolvedValue('notification');
  platformInfo = vi.fn().mockResolvedValue({ os: 'mac', arch: 'aarch64' });
  fakeBrowser.notifications.create = notify as never;
  fakeBrowser.runtime.getPlatformInfo = platformInfo as never;
  await portainerUrl.setValue('https://10.0.0.2:9443');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isRedeployRequest', () => {
  it('accepts a redeploy message', () => {
    expect(isRedeployRequest(request)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isRedeployRequest(null)).toBe(false);
    expect(isRedeployRequest({ type: 'redeploy', stackId: '41', stackName: 'x' })).toBe(false);
    expect(isRedeployRequest({ type: 'other', stackId: 41, stackName: 'x' })).toBe(false);
  });
});

describe('handleRedeploy', () => {
  it('redeploys and reports success', async () => {
    await expect(handleRedeploy(request)).resolves.toEqual({ ok: true });
    expect(redeployStack).toHaveBeenCalledWith(expect.anything(), 41);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'basic', title: 'Redeployed repull-spike' }),
    );
  });

  it('asks for a login when there is no token', async () => {
    vi.mocked(getToken).mockResolvedValue(null);
    const response = await handleRedeploy(request);
    expect(response).toMatchObject({ ok: false, kind: 'unauthorized' });
    expect(redeployStack).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Your Portainer session expired. Open the add-on and log in again.' }),
    );
  });

  it('clears the token when Portainer rejects it', async () => {
    vi.mocked(redeployStack).mockRejectedValue(new PortainerError('unauthorized', 'Unauthorized', 401));
    await expect(handleRedeploy(request)).resolves.toMatchObject({ ok: false, kind: 'unauthorized' });
    expect(clearToken).toHaveBeenCalled();
  });

  it("shows Portainer's error text", async () => {
    const message = 'Failed to deploy a stack: image not found';
    vi.mocked(redeployStack).mockRejectedValue(new PortainerError('http', message, 500));
    await expect(handleRedeploy(request)).resolves.toEqual({ ok: false, kind: 'http', message });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not redeploy repull-spike', message }),
    );
    expect(clearToken).not.toHaveBeenCalled();
  });

  it('reports other errors as unknown', async () => {
    vi.mocked(redeployStack).mockRejectedValue(new Error('Kubernetes stacks cannot be redeployed'));
    await expect(handleRedeploy(request)).resolves.toEqual({
      ok: false,
      kind: 'unknown',
      message: 'Kubernetes stacks cannot be redeployed',
    });
  });

  it('refuses a second redeploy of the same stack while one is running', async () => {
    const pending = deferred();
    vi.mocked(redeployStack).mockReturnValueOnce(pending.promise);
    const first = handleRedeploy(request);
    await expect(handleRedeploy(request)).resolves.toMatchObject({ ok: false, kind: 'busy' });
    pending.resolve();
    await expect(first).resolves.toEqual({ ok: true });
    await expect(handleRedeploy(request)).resolves.toEqual({ ok: true });
  });

  it('keeps the background alive until the redeploy finishes', async () => {
    vi.useFakeTimers();
    const pending = deferred();
    vi.mocked(redeployStack).mockReturnValueOnce(pending.promise);
    const done = handleRedeploy(request);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(platformInfo).toHaveBeenCalledTimes(2);
    pending.resolve();
    await done;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(platformInfo).toHaveBeenCalledTimes(2);
  });
});
