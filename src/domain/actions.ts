/**
 * The canonical action vocabulary.
 *
 * Every voice assistant's intents are mapped onto ONE of these verbs.
 * Keep this list small and STABLE — it is the contract the IoT core depends on.
 * Adding an action is a deliberate, reviewed change.
 */
export const CANONICAL_ACTIONS = [
  'appliance.set_power',       // on / off
  'appliance.set_temperature', // AC, water heater, thermostat...
  'appliance.set_brightness',  // lights (0–100)
  'appliance.set_fan_speed',   // fans (1–5)
  'appliance.set_level',       // generic 0–100 (e.g. curtain open %)
  'appliance.set_mode',        // mode strings (cool/heat/auto...)
  'appliance.open_close',      // curtains, locks, garage
  'appliance.query_state',     // read current state
] as const;

export type CanonicalAction = (typeof CANONICAL_ACTIONS)[number];
