export const StackType = { Swarm: 1, Compose: 2, Kubernetes: 3 } as const;
export type StackType = (typeof StackType)[keyof typeof StackType];

export const StackStatus = { Active: 1, Inactive: 2, Deploying: 3, Error: 4 } as const;
export type StackStatus = (typeof StackStatus)[keyof typeof StackStatus];

export interface Pair {
  name: string;
  value: string;
}

export interface GitConfig {
  URL: string;
  ReferenceName: string;
  ConfigFilePath: string;
}

export interface StackOption {
  Prune: boolean;
}

export interface Stack {
  Id: number;
  Name: string;
  Type: StackType;
  EndpointId: number;
  Status: StackStatus;
  Env: Pair[] | null;
  GitConfig: GitConfig | null;
  Option: StackOption | null;
}

export interface Endpoint {
  Id: number;
  Name: string;
}

export interface StackGroup {
  environment: Endpoint;
  stacks: Stack[];
}

export interface ComposeRedeployBody {
  StackFileContent: string;
  Env: Pair[];
  Prune: boolean;
  RepullImageAndRedeploy: true;
  PullImage: true;
}

export interface GitRedeployBody {
  RepullImageAndRedeploy: true;
  PullImage: true;
}
