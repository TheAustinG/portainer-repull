import { describe, expect, it } from 'vitest';
import { groupStacksByEnvironment } from './group';
import { StackStatus, StackType, type Stack } from './types';

function stack(Id: number, Name: string, EndpointId: number): Stack {
  return {
    Id,
    Name,
    Type: StackType.Compose,
    EndpointId,
    Status: StackStatus.Active,
    Env: null,
    GitConfig: null,
    Option: null,
  };
}

describe('groupStacksByEnvironment', () => {
  it('groups by environment and sorts groups and stacks by name', () => {
    const stacks = [
      stack(1, 'web10', 2),
      stack(2, 'Media', 1),
      stack(3, 'web2', 2),
      stack(4, 'arr', 1),
      stack(5, 'Web1', 2),
    ];
    const endpoints = [
      { Id: 1, Name: 'tower' },
      { Id: 2, Name: 'Edge' },
      { Id: 9, Name: 'empty' },
    ];

    const groups = groupStacksByEnvironment(stacks, endpoints);

    expect(groups.map((group) => group.environment)).toStrictEqual([
      { Id: 2, Name: 'Edge' },
      { Id: 1, Name: 'tower' },
    ]);
    expect(groups.map((group) => group.stacks.map((s) => s.Name))).toStrictEqual([
      ['Web1', 'web2', 'web10'],
      ['arr', 'Media'],
    ]);
  });

  it('labels a stack whose environment is missing by its id', () => {
    const groups = groupStacksByEnvironment(
      [stack(1, 'orphan', 42), stack(2, 'app', 1)],
      [{ Id: 1, Name: 'Production' }],
    );

    expect(groups).toStrictEqual([
      { environment: { Id: 42, Name: 'Environment 42' }, stacks: [stack(1, 'orphan', 42)] },
      { environment: { Id: 1, Name: 'Production' }, stacks: [stack(2, 'app', 1)] },
    ]);
  });

  it('returns no groups for no stacks', () => {
    expect(groupStacksByEnvironment([], [{ Id: 1, Name: 'local' }])).toStrictEqual([]);
    expect(groupStacksByEnvironment([], [])).toStrictEqual([]);
  });

  it('does not reorder the input array', () => {
    const stacks = [stack(1, 'b', 1), stack(2, 'a', 1)];

    groupStacksByEnvironment(stacks, []);

    expect(stacks.map((s) => s.Name)).toStrictEqual(['b', 'a']);
  });
});
