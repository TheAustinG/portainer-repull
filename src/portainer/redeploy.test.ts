import { describe, expect, it, vi } from 'vitest';
import type { PortainerClient } from './client';
import { buildComposeRedeployBody, buildGitRedeployBody, isRedeployable, redeployStack } from './redeploy';
import { StackStatus, StackType, type GitConfig, type Stack } from './types';

const gitConfig: GitConfig = {
  URL: 'https://git.example.com/app.git',
  ReferenceName: 'refs/heads/main',
  ConfigFilePath: 'compose.yml',
};

function makeStack(overrides: Partial<Stack> = {}): Stack {
  return {
    Id: 7,
    Name: 'media',
    Type: StackType.Compose,
    EndpointId: 3,
    Status: StackStatus.Active,
    Env: [{ name: 'TZ', value: 'UTC' }],
    GitConfig: null,
    Option: { Prune: false },
    ...overrides,
  };
}

function fakeClient(stack: Stack, stackFileContent = 'services: {}\n') {
  const updated = { ...stack, Status: StackStatus.Active };
  return {
    updated,
    client: {
      login: vi.fn<PortainerClient['login']>(),
      listEndpoints: vi.fn<PortainerClient['listEndpoints']>(),
      listStacks: vi.fn<PortainerClient['listStacks']>(),
      getStack: vi.fn<PortainerClient['getStack']>(async () => stack),
      getStackFile: vi.fn<PortainerClient['getStackFile']>(async () => stackFileContent),
      updateStack: vi.fn<PortainerClient['updateStack']>(async () => updated),
      redeployGitStack: vi.fn<PortainerClient['redeployGitStack']>(async () => updated),
    },
  };
}

describe('isRedeployable', () => {
  it('allows swarm and compose stacks only', () => {
    expect(isRedeployable(makeStack({ Type: StackType.Swarm }))).toBe(true);
    expect(isRedeployable(makeStack({ Type: StackType.Compose }))).toBe(true);
    expect(isRedeployable(makeStack({ Type: StackType.Kubernetes }))).toBe(false);
  });
});

describe('buildComposeRedeployBody', () => {
  it('sends the stack file and env unchanged with both pull flags', () => {
    const env = [
      { name: 'ADMIN_HASH', value: '$$2y$$10$$abc/def.ghi' },
      { name: 'PADDED', value: '  spaced  ' },
      { name: 'EMPTY', value: '' },
    ];

    const body = buildComposeRedeployBody(makeStack({ Env: env }), 'services:\n  web: {}\n');

    expect(body).toStrictEqual({
      StackFileContent: 'services:\n  web: {}\n',
      Env: [
        { name: 'ADMIN_HASH', value: '$$2y$$10$$abc/def.ghi' },
        { name: 'PADDED', value: '  spaced  ' },
        { name: 'EMPTY', value: '' },
      ],
      Prune: false,
      RepullImageAndRedeploy: true,
      PullImage: true,
    });
    expect(JSON.parse(JSON.stringify(body)).Env).toStrictEqual(env);
  });

  it.each([
    [{ Prune: true }, true],
    [{ Prune: false }, false],
    [null, false],
  ])('takes Prune from the stack option %o', (Option, Prune) => {
    expect(buildComposeRedeployBody(makeStack({ Option }), '').Prune).toBe(Prune);
  });

  it('sends an empty env when the stack has none', () => {
    expect(buildComposeRedeployBody(makeStack({ Env: null }), '').Env).toStrictEqual([]);
  });
});

describe('buildGitRedeployBody', () => {
  it('sends only the pull flags', () => {
    expect(buildGitRedeployBody()).toStrictEqual({ RepullImageAndRedeploy: true, PullImage: true });
  });
});

describe('redeployStack', () => {
  it('redeploys a git stack without reading its file', async () => {
    const stack = makeStack({
      Option: { Prune: true },
      GitConfig: gitConfig,
    });
    const { client, updated } = fakeClient(stack);

    await expect(redeployStack(client, 7)).resolves.toBe(updated);

    expect(client.getStack).toHaveBeenCalledWith(7);
    expect(client.redeployGitStack).toHaveBeenCalledTimes(1);
    expect(client.redeployGitStack).toHaveBeenCalledWith(stack, {
      RepullImageAndRedeploy: true,
      PullImage: true,
    });
    expect(client.getStackFile).not.toHaveBeenCalled();
    expect(client.updateStack).not.toHaveBeenCalled();
  });

  it('redeploys a compose stack with its current file', async () => {
    const stack = makeStack({ Type: StackType.Swarm, Option: { Prune: true } });
    const { client, updated } = fakeClient(stack, 'services:\n  app: {}\n');

    await expect(redeployStack(client, 7)).resolves.toBe(updated);

    expect(client.getStackFile).toHaveBeenCalledWith(7);
    expect(client.updateStack).toHaveBeenCalledTimes(1);
    expect(client.updateStack).toHaveBeenCalledWith(stack, {
      StackFileContent: 'services:\n  app: {}\n',
      Env: [{ name: 'TZ', value: 'UTC' }],
      Prune: true,
      RepullImageAndRedeploy: true,
      PullImage: true,
    });
    expect(client.redeployGitStack).not.toHaveBeenCalled();
  });

  it('refuses a Kubernetes stack', async () => {
    const { client } = fakeClient(makeStack({ Type: StackType.Kubernetes }));

    await expect(redeployStack(client, 7)).rejects.toThrow('Kubernetes stacks cannot be redeployed');

    expect(client.getStackFile).not.toHaveBeenCalled();
    expect(client.updateStack).not.toHaveBeenCalled();
    expect(client.redeployGitStack).not.toHaveBeenCalled();
  });

  it('uses the stack as Portainer returns it now', async () => {
    const fresh = makeStack({
      EndpointId: 5,
      Env: [{ name: 'TZ', value: 'Europe/London' }],
      Option: { Prune: true },
    });
    const { client } = fakeClient(fresh);

    await redeployStack(client, 7);

    expect(client.updateStack).toHaveBeenCalledWith(
      fresh,
      expect.objectContaining({ Env: [{ name: 'TZ', value: 'Europe/London' }], Prune: true }),
    );
  });

  it('switches to the git path when the fresh stack has become git-based', async () => {
    const fresh = makeStack({ GitConfig: gitConfig });
    const { client } = fakeClient(fresh);

    await redeployStack(client, 7);

    expect(client.redeployGitStack).toHaveBeenCalledWith(fresh, buildGitRedeployBody());
    expect(client.updateStack).not.toHaveBeenCalled();
  });
});
