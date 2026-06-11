import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/repository/in-memory.repository.js';
import { TargetResolver } from '../src/core/resolver.js';
import type { CanonicalCommand } from '../src/domain/canonical-command.js';

function command(spokenScene: string, spokenAppliance: string): CanonicalCommand {
  return {
    version: '1.0', commandId: 'c1', correlationId: 'r1', receivedAt: '2026-06-11T09:00:00Z',
    kind: 'control', action: 'appliance.set_power',
    source: { platform: 'alexa', locale: 'en-IN', requestId: 'r1' },
    actor: { userId: 'user_42' },
    target: { spokenScene, spokenAppliance, applianceIds: [] },
    parameters: { power: 'on' },
  };
}

describe('TargetResolver', () => {
  const resolver = new TargetResolver(new InMemoryRepository());

  it('resolves scene + appliance to ids on the default site', async () => {
    const cmd = command('master bedroom', 'AC');
    await resolver.resolve(cmd);
    expect(cmd.target.siteName).toBe('My Home');
    expect(cmd.target.sceneName).toBe('Master Bedroom');
    expect(cmd.target.applianceIds).toEqual(['ac_mbr']);
  });

  it('matches all lights in a scene', async () => {
    const cmd = command('kitchen', 'light');
    await resolver.resolve(cmd);
    expect(cmd.target.applianceIds).toContain('light_kitchen');
  });

  it('throws when the scene does not exist', async () => {
    await expect(resolver.resolve(command('garage', 'light'))).rejects.toThrowError();
  });
});
