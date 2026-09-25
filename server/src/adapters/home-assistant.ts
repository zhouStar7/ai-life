export const DEFAULT_HA_BASE = 'http://192.168.0.111:8123';

const SCENE_NAMES = ['回家', '离家', '睡眠', '影院'];
const ROOMS = ['客厅', '卧室', '厨房', '阳台', '玄关'];

const KINDS = {
  light: '灯',
  climate: '空调',
  media_player: '电视',
  cover: '窗帘',
} as const;

export type HaEntity = {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
};

export type MappedDevice = {
  id: string;
  name: string;
  room: string;
  kind: string;
  on: boolean;
  paramLabel: string | null;
  paramValue: string | null;
  offline: boolean;
  source: 'ha';
};

export function mapDevices(states: HaEntity[]): MappedDevice[] {
  return states.flatMap((entity) => {
    const domain = entity.entity_id.split('.')[0] as keyof typeof KINDS;
    const kind = KINDS[domain];
    if (!kind || !entity.entity_id.includes('.')) return [];
    const name = text(entity.attributes?.friendly_name) || entity.entity_id;
    const room = ROOMS.find((item) => name.includes(item)) ?? '未分区';
    const offline = entity.state === 'unavailable';
    const param = parameter(domain, entity);
    return [{
      id: entity.entity_id,
      name,
      room,
      kind,
      on: !offline && isOn(domain, entity.state),
      paramLabel: param.label,
      paramValue: param.value,
      offline,
      source: 'ha',
    }];
  });
}

export function mapScenes(states: HaEntity[]) {
  const scenes: Record<string, string> = {};
  for (const entity of states) {
    if (!entity.entity_id.startsWith('scene.')) continue;
    const name = text(entity.attributes?.friendly_name);
    if (SCENE_NAMES.includes(name)) scenes[name] = entity.entity_id;
  }
  return scenes;
}

export function serviceFor(domain: string, turnOn: boolean) {
  if (domain === 'cover') return turnOn ? 'open_cover' : 'close_cover';
  return turnOn ? 'turn_on' : 'turn_off';
}

export async function fetchStates(base: string, token: string) {
  const response = await fetch(`${root(base)}/api/states`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error('home_unavailable');
  const body = await response.json() as unknown;
  if (!Array.isArray(body)) throw new Error('home_unavailable');
  return body as HaEntity[];
}

export async function callService(base: string, token: string, domain: string, service: string, entityId: string) {
  const response = await fetch(`${root(base)}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ entity_id: entityId }),
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error('home_unavailable');
}

function root(base: string) {
  return (base || DEFAULT_HA_BASE).replace(/\/$/, '');
}

function isOn(domain: string, state: string) {
  if (domain === 'cover') return state === 'open' || state === 'opening';
  if (domain === 'climate') return state !== 'off';
  if (domain === 'media_player') return state !== 'off' && state !== 'standby' && state !== 'idle';
  return state === 'on';
}

function parameter(domain: string, entity: HaEntity) {
  const attributes = entity.attributes ?? {};
  if (domain === 'light' && typeof attributes.brightness === 'number') {
    return { label: '亮度', value: `${Math.round((attributes.brightness / 255) * 100)}%` };
  }
  if (domain === 'climate' && typeof attributes.current_temperature === 'number') {
    return { label: '温度', value: `${attributes.current_temperature}°C` };
  }
  if (domain === 'cover' && typeof attributes.current_position === 'number') {
    return { label: '开合', value: `${attributes.current_position}%` };
  }
  if (domain === 'media_player') return { label: '状态', value: entity.state };
  return { label: null, value: null };
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
