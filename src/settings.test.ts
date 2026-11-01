import { describe, expect, it } from 'vitest';
import { hostPermissionPattern, normalizePortainerUrl } from './settings';

describe('normalizePortainerUrl', () => {
  it('drops trailing slashes, query and hash', () => {
    expect(normalizePortainerUrl(' https://10.0.0.2:9443/?x=1#/home ')).toBe('https://10.0.0.2:9443');
  });

  it('keeps a sub-path', () => {
    expect(normalizePortainerUrl('https://example.com/portainer/')).toBe('https://example.com/portainer');
  });

  it('rejects input that is not a URL', () => {
    expect(() => normalizePortainerUrl('10.0.0.2:9443')).toThrow(/full Portainer address/);
  });

  it('rejects other schemes', () => {
    expect(() => normalizePortainerUrl('ftp://example.com')).toThrow(/https:\/\/ or http:\/\//);
  });
});

describe('hostPermissionPattern', () => {
  it('leaves out the port and path', () => {
    expect(hostPermissionPattern('https://10.0.0.2:9443/portainer')).toBe('https://10.0.0.2/*');
  });
});
