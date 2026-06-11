import type { CanonicalAction } from '../../domain/actions.js';

/**
 * The Alexa-side "normalizer": maps this skill's intent names onto the shared
 * canonical actions. Google and Siri have their OWN maps — that is the whole
 * point. The core only knows the canonical action on the right.
 */
export const INTENT_TO_ACTION: Record<string, CanonicalAction> = {
  TurnOnIntent: 'appliance.set_power',
  TurnOffIntent: 'appliance.set_power',
  SetTemperatureIntent: 'appliance.set_temperature',
  SetBrightnessIntent: 'appliance.set_brightness',
  SetFanSpeedIntent: 'appliance.set_fan_speed',
  OpenIntent: 'appliance.open_close',
  CloseIntent: 'appliance.open_close',
  QueryStateIntent: 'appliance.query_state',
};
