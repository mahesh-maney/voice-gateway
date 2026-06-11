/**
 * Domain model.
 *
 *   User ──< Site ──< Scene ──< Appliance
 *
 * A User owns one or more Sites (e.g. "My Home", "Office").
 * A Site contains Scenes — a Scene is an area/room within the site
 *   (e.g. "Master Bedroom", "Living Room").
 * A Scene contains Appliances — any household item (AC, light, fan, TV...).
 */

export type ApplianceType =
  | 'air_conditioner'
  | 'light'
  | 'fan'
  | 'exhaust_fan'
  | 'television'
  | 'water_heater'
  | 'refrigerator'
  | 'washing_machine'
  | 'microwave'
  | 'oven'
  | 'curtain'
  | 'door_lock'
  | 'water_pump'
  | 'heater'
  | 'air_purifier'
  | 'speaker'
  | 'thermostat'
  | 'projector';

export type Capability =
  | 'power'
  | 'temperature'
  | 'brightness'
  | 'fan_speed'
  | 'level'
  | 'mode'
  | 'open_close';

export interface ApplianceState {
  power?: 'on' | 'off';
  temperature?: { value: number; unit: 'C' | 'F' };
  brightness?: number;
  fanSpeed?: number;
  level?: number;
  mode?: string;
  openClose?: 'open' | 'close';
  [key: string]: unknown;
}

export interface Appliance {
  id: string;
  name: string;              // human name, e.g. "Air Conditioner"
  type: ApplianceType;
  sceneId: string;
  capabilities: Capability[];
  state: ApplianceState;
}

export interface Scene {
  id: string;
  name: string;              // "Master Bedroom"
  siteId: string;
}

export interface Site {
  id: string;
  name: string;              // "My Home"
  userId: string;
  isDefault: boolean;        // used when the user doesn't name a site
}

export interface User {
  id: string;                // OUR internal id, e.g. "user_42"
  name: string;
  accessToken: string;       // demo account-linking token
  platformUserIds: Partial<Record<'alexa' | 'google' | 'siri', string>>;
}
