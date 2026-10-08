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

export function mapDevices(states: HaEntity[], areas?: Record<string, string> | null): MappedDevice[] {
  return states.flatMap((entity) => {
    const domain = entity.entity_id.split('.')[0] as keyof typeof KINDS;
    const kind = KINDS[domain];
    if (!kind || !entity.entity_id.includes('.')) return [];
    const name = text(entity.attributes?.friendly_name) || entity.entity_id;
    const room = roomFor(name, entity.entity_id, areas);
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

export function listSceneCatalog(states: HaEntity[]) {
  return states.flatMap((entity) => {
    if (!entity.entity_id.startsWith('scene.')) return [];
    return [{ id: entity.entity_id, name: text(entity.attributes?.friendly_name) || entity.entity_id }];
  });
}

export type DerivedAlert = {
  id: string;
  level: string;
  title: string;
  detail: string;
  handled: boolean;
};

export function deriveAlerts(states: HaEntity[], devices: MappedDevice[]): DerivedAlert[] {
  const alerts: DerivedAlert[] = [];
  for (const device of devices) {
    if (!device.offline) continue;
    alerts.push({
      id: `ha-offline-${device.id}`,
      level: '高',
      title: `${device.name}离线`,
      detail: '已保留最后状态，恢复在线后再控制。',
      handled: false,
    });
  }
  for (const entity of states) {
    const name = text(entity.attributes?.friendly_name) || entity.entity_id;
    const battery = batteryPercent(entity);
    if (battery !== null && battery <= 20) {
      alerts.push({
        id: `ha-battery-${entity.entity_id}`,
        level: battery <= 10 ? '高' : '低',
        title: `${name}电量 ${battery}%`,
        detail: '电量偏低，记得充电或更换电池。',
        handled: false,
      });
    }
    const consumable = consumablePercent(entity);
    if (consumable !== null && consumable <= 20) {
      alerts.push({
        id: `ha-consumable-${entity.entity_id}`,
        level: consumable <= 10 ? '高' : '中',
        title: `${name}剩余 ${consumable}%`,
        detail: '耗材快用完了，可以安排更换。',
        handled: false,
      });
    }
  }
  return alerts;
}

const AREA_TEMPLATE = `{% for s in states.light | list + states.climate | list + states.media_player | list + states.cover | list %}
{{ s.entity_id }}||{{ area_name(s.entity_id) or '' }}
{% endfor %}`;

export async function fetchAreas(base: string, token: string) {
  try {
    const response = await fetch(`${root(base)}/api/template`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'text/plain',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ template: AREA_TEMPLATE }),
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (!text.includes('||')) return null;
    const areas: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const splitAt = line.indexOf('||');
      if (splitAt < 0) continue;
      const id = line.slice(0, splitAt).trim();
      if (!id.includes('.')) continue;
      areas[id] = line.slice(splitAt + 2).trim();
    }
    return areas;
  } catch {
    return null;
  }
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

export async function callService(
  base: string,
  token: string,
  domain: string,
  service: string,
  entityId: string,
  data?: Record<string, number>,
) {
  const response = await fetch(`${root(base)}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ entity_id: entityId, ...data }),
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

function roomFor(name: string, entityId: string, areas?: Record<string, string> | null) {
  if (areas) {
    const area = (areas[entityId] ?? '').trim();
    return area || '未分区';
  }
  return ROOMS.find((item) => name.includes(item)) ?? '未分区';
}

function batteryPercent(entity: HaEntity) {
  if (entity.state === 'unavailable' || entity.state === 'unknown') return null;
  const deviceClass = text(entity.attributes?.device_class);
  const level = entity.attributes?.battery_level;
  if (typeof level === 'number' && level >= 0 && level <= 100) return level;
  if (deviceClass !== 'battery') return null;
  return percent(entity);
}

function consumablePercent(entity: HaEntity) {
  if (entity.state === 'unavailable' || entity.state === 'unknown') return null;
  const deviceClass = text(entity.attributes?.device_class);
  const name = text(entity.attributes?.friendly_name);
  if (deviceClass !== 'filter' && !/滤芯|耗材/.test(name)) return null;
  return percent(entity);
}

function percent(entity: HaEntity) {
  const unit = text(entity.attributes?.unit_of_measurement);
  if (unit && unit !== '%') return null;
  const value = Number(entity.state);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
