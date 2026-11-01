import type { Endpoint, Stack, StackGroup } from './types';

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

export function groupStacksByEnvironment(stacks: Stack[], endpoints: Endpoint[]): StackGroup[] {
  const endpointsById = new Map(endpoints.map((endpoint) => [endpoint.Id, endpoint]));
  const groups = new Map<number, StackGroup>();
  for (const stack of stacks) {
    let group = groups.get(stack.EndpointId);
    if (!group) {
      const endpoint = endpointsById.get(stack.EndpointId);
      group = {
        environment: endpoint
          ? { Id: endpoint.Id, Name: endpoint.Name }
          : { Id: stack.EndpointId, Name: `Environment ${stack.EndpointId}` },
        stacks: [],
      };
      groups.set(stack.EndpointId, group);
    }
    group.stacks.push(stack);
  }

  const sorted = [...groups.values()];
  for (const group of sorted) {
    group.stacks.sort((a, b) => compareNames(a.Name, b.Name) || a.Id - b.Id);
  }
  return sorted.sort(
    (a, b) => compareNames(a.environment.Name, b.environment.Name) || a.environment.Id - b.environment.Id,
  );
}
