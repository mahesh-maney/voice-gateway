import type { Repository } from '../repository/repository.js';
import type { CanonicalCommand } from '../domain/canonical-command.js';
import type { CanonicalResult, ApplianceOutcome } from '../domain/canonical-result.js';
import type { ApplianceState } from '../domain/entities.js';
import { joinSpoken } from '../util/text.js';

/**
 * Stand-in for the real IoT core / device cloud. In production this would call
 * your existing service over HTTP/gRPC/MQTT. Here it just updates the in-memory
 * state and builds a spoken summary.
 *
 * The point: the core only ever sees a CanonicalCommand — never an Alexa request.
 */
import type { IotCoreClient } from './iot-core.interface.js';

export class MockIotCoreClient implements IotCoreClient {
  constructor(private readonly repo: Repository) {}

  async execute(cmd: CanonicalCommand): Promise<CanonicalResult> {
    const outcomes: ApplianceOutcome[] = [];

    for (const id of cmd.target.applianceIds) {
      const ap = await this.repo.getAppliance(id);
      if (!ap) {
        outcomes.push({ applianceId: id, applianceName: id, error: { code: 'NOT_FOUND', message: 'Appliance vanished' } });
        continue;
      }
      const patch = this.patchFor(cmd);
      const updated = (await this.repo.updateApplianceState(id, patch)) ?? ap;
      outcomes.push({ applianceId: id, applianceName: updated.name, state: updated.state });
    }

    const failed = outcomes.filter((o) => o.error).length;
    const status: CanonicalResult['status'] =
      failed === 0 ? 'success' : failed === outcomes.length ? 'failure' : 'partial';

    return {
      commandId: cmd.commandId,
      action: cmd.action,
      status,
      summary: this.summarize(cmd, outcomes),
      outcomes,
    };
  }

  /** Translate a canonical action + parameters into a state patch. */
  private patchFor(cmd: CanonicalCommand): Partial<ApplianceState> {
    const p = cmd.parameters;
    switch (cmd.action) {
      case 'appliance.set_power': return { power: p.power };
      case 'appliance.set_temperature': return { power: 'on', temperature: p.temperature };
      case 'appliance.set_brightness': return { power: 'on', brightness: p.brightness };
      case 'appliance.set_fan_speed': return { power: 'on', fanSpeed: p.fanSpeed };
      case 'appliance.set_level': return { level: p.level };
      case 'appliance.set_mode': return { mode: p.mode };
      case 'appliance.open_close': return { openClose: p.openClose };
      case 'appliance.query_state': return {};
      default: return {};
    }
  }

  /** A natural sentence the response formatter will speak. */
  private summarize(cmd: CanonicalCommand, outcomes: ApplianceOutcome[]): string {
    const names = joinSpoken([...new Set(outcomes.map((o) => o.applianceName.toLowerCase()))]);
    const where = cmd.target.sceneName ? ` in the ${cmd.target.sceneName.toLowerCase()}` : '';
    const p = cmd.parameters;

    switch (cmd.action) {
      case 'appliance.set_power':
        return `Turned ${p.power} the ${names}${where}.`;
      case 'appliance.set_temperature':
        return `Set the ${names}${where} to ${p.temperature?.value} degrees.`;
      case 'appliance.set_brightness':
        return `Set the ${names}${where} to ${p.brightness} percent brightness.`;
      case 'appliance.set_fan_speed':
        return `Set the ${names}${where} to speed ${p.fanSpeed}.`;
      case 'appliance.open_close':
        return `${p.openClose === 'open' ? 'Opened' : 'Closed'} the ${names}${where}.`;
      case 'appliance.query_state': {
        const first = outcomes[0];
        const power = first?.state?.power ?? 'unknown';
        return `The ${names}${where} is currently ${power}.`;
      }
      default:
        return `Done.`;
    }
  }
}
