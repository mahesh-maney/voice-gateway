import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dispatcher } from '../src/core/dispatcher.js';
import { InMemoryCommandLog } from '../src/repository/command-log.js';
import type { IotCoreClient } from '../src/iot/iot-core.interface.js';
import type { CanonicalCommand } from '../src/domain/canonical-command.js';
import type { CanonicalResult } from '../src/domain/canonical-result.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCommand(commandId = 'cmd-1'): CanonicalCommand {
  return {
    version: '1.0',
    commandId,
    correlationId: 'corr-1',
    receivedAt: new Date().toISOString(),
    kind: 'control',
    action: 'appliance.set_power',
    source: { platform: 'alexa', locale: 'en-IN', requestId: 'req-1' },
    actor: { userId: 'user_42' },
    target: { applianceIds: ['ac_mbr'] },
    parameters: { power: 'on' },
  };
}

const successResult: CanonicalResult = {
  commandId: 'cmd-1',
  action: 'appliance.set_power',
  status: 'success',
  summary: 'Turned on the air conditioner in the master bedroom.',
  outcomes: [{ applianceId: 'ac_mbr', applianceName: 'Air Conditioner', state: { power: 'on' } }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dispatcher', () => {
  let iot: IotCoreClient;
  let dispatcher: Dispatcher;

  beforeEach(() => {
    iot = { execute: vi.fn().mockResolvedValue(successResult) };
    dispatcher = new Dispatcher(iot, new InMemoryCommandLog());
  });

  it('dispatches to the IoT client and returns the result', async () => {
    const result = await dispatcher.dispatch(makeCommand());
    expect(result).toEqual(successResult);
    expect(iot.execute).toHaveBeenCalledTimes(1);
  });

  it('records the result so a second call with the same commandId returns the cache', async () => {
    const cmd = makeCommand('cmd-idempotent');
    const first = await dispatcher.dispatch(cmd);
    const second = await dispatcher.dispatch(cmd);

    // IoT called only once — second dispatch hits the cache
    expect(iot.execute).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('calls IoT again for a different commandId', async () => {
    await dispatcher.dispatch(makeCommand('cmd-A'));
    await dispatcher.dispatch(makeCommand('cmd-B'));

    expect(iot.execute).toHaveBeenCalledTimes(2);
  });

  it('returns the ORIGINAL result from the cache even when IoT would return something different', async () => {
    const cmd = makeCommand('cmd-x');
    const firstResult: CanonicalResult = { ...successResult, summary: 'First execution.' };
    const secondResult: CanonicalResult = { ...successResult, summary: 'This should not be seen.' };

    vi.mocked(iot.execute)
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(secondResult);

    await dispatcher.dispatch(cmd);
    const cached = await dispatcher.dispatch(cmd);

    expect(cached.summary).toBe('First execution.');
  });
});
