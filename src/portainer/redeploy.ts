import type { PortainerClient } from './client';
import { StackType, type ComposeRedeployBody, type GitRedeployBody, type Stack } from './types';

export function isRedeployable(stack: Stack): boolean {
  return stack.Type === StackType.Swarm || stack.Type === StackType.Compose;
}

export function buildComposeRedeployBody(stack: Stack, stackFileContent: string): ComposeRedeployBody {
  return {
    StackFileContent: stackFileContent,
    Env: stack.Env ?? [],
    // Portainer saves this as the stack's prune option, so a fixed value would overwrite the user's choice.
    Prune: stack.Option?.Prune ?? false,
    RepullImageAndRedeploy: true,
    PullImage: true,
  };
}

// Portainer keeps the stack's Env, git ref and prune option only when those fields are left out.
export function buildGitRedeployBody(): GitRedeployBody {
  return { RepullImageAndRedeploy: true, PullImage: true };
}

export async function redeployStack(client: PortainerClient, stackId: number): Promise<Stack> {
  const stack = await client.getStack(stackId);
  if (!isRedeployable(stack)) {
    throw new Error(
      stack.Type === StackType.Kubernetes
        ? 'Kubernetes stacks cannot be redeployed from this add-on.'
        : 'This kind of stack cannot be redeployed from this add-on.',
    );
  }
  if (stack.GitConfig) {
    return client.redeployGitStack(stack, buildGitRedeployBody());
  }
  const stackFileContent = await client.getStackFile(stack.Id);
  return client.updateStack(stack, buildComposeRedeployBody(stack, stackFileContent));
}
