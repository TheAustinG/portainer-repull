export type PortainerErrorKind = 'unauthorized' | 'network' | 'timeout' | 'http' | 'invalid-response';

export class PortainerError extends Error {
  override readonly name = 'PortainerError';
  readonly kind: PortainerErrorKind;
  readonly status: number | undefined;

  constructor(kind: PortainerErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export function isPortainerError(error: unknown): error is PortainerError {
  return error instanceof PortainerError;
}
