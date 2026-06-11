import type { ApplianceType } from '../domain/entities.js';

/**
 * Maps what people SAY to an appliance type. People rarely say the exact
 * catalog name ("air_conditioner") — they say "AC", "a c", "air con".
 * Resolution uses this so the spoken word finds the right device.
 */
export const APPLIANCE_SYNONYMS: Record<string, ApplianceType> = {
  'ac': 'air_conditioner',
  'a c': 'air_conditioner',
  'air con': 'air_conditioner',
  'air conditioner': 'air_conditioner',
  'air conditioning': 'air_conditioner',
  'cooler': 'air_conditioner',

  'light': 'light',
  'lights': 'light',
  'lamp': 'light',
  'bulb': 'light',

  'fan': 'fan',
  'ceiling fan': 'fan',
  'exhaust fan': 'exhaust_fan',
  'exhaust': 'exhaust_fan',

  'tv': 'television',
  'television': 'television',
  'telly': 'television',

  'geyser': 'water_heater',
  'water heater': 'water_heater',
  'heater': 'heater',
  'room heater': 'heater',

  'fridge': 'refrigerator',
  'refrigerator': 'refrigerator',

  'washing machine': 'washing_machine',
  'washer': 'washing_machine',

  'microwave': 'microwave',
  'oven': 'oven',

  'curtain': 'curtain',
  'curtains': 'curtain',
  'blinds': 'curtain',

  'lock': 'door_lock',
  'door': 'door_lock',
  'door lock': 'door_lock',

  'motor': 'water_pump',
  'water pump': 'water_pump',
  'pump': 'water_pump',

  'purifier': 'air_purifier',
  'air purifier': 'air_purifier',

  'speaker': 'speaker',
  'thermostat': 'thermostat',
  'projector': 'projector',
};

/** Resolve a normalized spoken word to an appliance type, or undefined. */
export function applianceTypeFor(normalizedWord: string): ApplianceType | undefined {
  return APPLIANCE_SYNONYMS[normalizedWord];
}
