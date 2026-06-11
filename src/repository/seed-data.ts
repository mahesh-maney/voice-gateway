import type { User, Site, Scene, Appliance } from '../domain/entities.js';

/**
 * Sample data for the demo.
 *
 * User "Ravi" (user_42)
 *  ├── Site "My Home"  (default)
 *  │     ├── Master Bedroom : AC, Light, Fan, TV, Water Heater
 *  │     ├── Living Room    : AC, Lights, TV, Curtains, Speaker
 *  │     └── Kitchen        : Light, Exhaust Fan, Microwave, Refrigerator
 *  └── Site "Office"
 *        ├── Cabin           : AC, Light
 *        └── Conference Hall : AC, Lights, Projector
 */

export const users: User[] = [
  {
    id: 'user_42',
    name: 'Ravi',
    accessToken: 'demo-token-ravi',
    platformUserIds: { alexa: 'amzn1.ask.account.RAVI' },
  },
];

export const sites: Site[] = [
  { id: 'site_home', name: 'My Home', userId: 'user_42', isDefault: true },
  { id: 'site_office', name: 'Office', userId: 'user_42', isDefault: false },
];

export const scenes: Scene[] = [
  { id: 'scene_mbr', name: 'Master Bedroom', siteId: 'site_home' },
  { id: 'scene_living', name: 'Living Room', siteId: 'site_home' },
  { id: 'scene_kitchen', name: 'Kitchen', siteId: 'site_home' },
  { id: 'scene_cabin', name: 'Cabin', siteId: 'site_office' },
  { id: 'scene_hall', name: 'Conference Hall', siteId: 'site_office' },
];

const a = (
  id: string,
  name: string,
  type: Appliance['type'],
  sceneId: string,
  capabilities: Appliance['capabilities'],
  state: Appliance['state'],
): Appliance => ({ id, name, type, sceneId, capabilities, state });

export const appliances: Appliance[] = [
  // Master Bedroom
  a('ac_mbr', 'Air Conditioner', 'air_conditioner', 'scene_mbr', ['power', 'temperature', 'mode'], { power: 'off', temperature: { value: 24, unit: 'C' }, mode: 'cool' }),
  a('light_mbr', 'Light', 'light', 'scene_mbr', ['power', 'brightness'], { power: 'off', brightness: 80 }),
  a('fan_mbr', 'Fan', 'fan', 'scene_mbr', ['power', 'fan_speed'], { power: 'off', fanSpeed: 3 }),
  a('tv_mbr', 'TV', 'television', 'scene_mbr', ['power'], { power: 'off' }),
  a('geyser_mbr', 'Water Heater', 'water_heater', 'scene_mbr', ['power', 'temperature'], { power: 'off', temperature: { value: 45, unit: 'C' } }),

  // Living Room
  a('ac_living', 'Air Conditioner', 'air_conditioner', 'scene_living', ['power', 'temperature', 'mode'], { power: 'off', temperature: { value: 25, unit: 'C' }, mode: 'cool' }),
  a('light_living', 'Lights', 'light', 'scene_living', ['power', 'brightness'], { power: 'off', brightness: 100 }),
  a('tv_living', 'TV', 'television', 'scene_living', ['power'], { power: 'off' }),
  a('curtain_living', 'Curtains', 'curtain', 'scene_living', ['open_close', 'level'], { openClose: 'close', level: 0 }),
  a('speaker_living', 'Speaker', 'speaker', 'scene_living', ['power'], { power: 'off' }),

  // Kitchen
  a('light_kitchen', 'Light', 'light', 'scene_kitchen', ['power', 'brightness'], { power: 'off', brightness: 90 }),
  a('exhaust_kitchen', 'Exhaust Fan', 'exhaust_fan', 'scene_kitchen', ['power'], { power: 'off' }),
  a('micro_kitchen', 'Microwave', 'microwave', 'scene_kitchen', ['power'], { power: 'off' }),
  a('fridge_kitchen', 'Refrigerator', 'refrigerator', 'scene_kitchen', ['power'], { power: 'on' }),

  // Office - Cabin
  a('ac_cabin', 'Air Conditioner', 'air_conditioner', 'scene_cabin', ['power', 'temperature'], { power: 'off', temperature: { value: 23, unit: 'C' } }),
  a('light_cabin', 'Light', 'light', 'scene_cabin', ['power'], { power: 'off' }),

  // Office - Conference Hall
  a('ac_hall', 'Air Conditioner', 'air_conditioner', 'scene_hall', ['power', 'temperature'], { power: 'off', temperature: { value: 22, unit: 'C' } }),
  a('light_hall', 'Lights', 'light', 'scene_hall', ['power'], { power: 'off' }),
  a('proj_hall', 'Projector', 'projector', 'scene_hall', ['power'], { power: 'off' }),
];
