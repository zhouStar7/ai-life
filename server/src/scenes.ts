export type DeviceRow = {
  id: string;
  name: string;
  room: string;
  kind: string;
  on: boolean;
  paramLabel: string | null;
  paramValue: string | null;
  offline: boolean;
};

export function nextDevice(device: DeviceRow, scene: string): DeviceRow {
  if (device.offline) return device;
  if (scene === '离家') {
    if (device.kind === '灯' || device.kind === '空调' || device.kind === '电视') return { ...device, on: false };
    return device;
  }
  if (scene === '回家') {
    if (device.kind === '灯') return { ...device, on: true, paramValue: device.paramLabel === '亮度' ? '70%' : device.paramValue };
    if (device.kind === '空调' && device.room === '客厅') return { ...device, on: true, paramValue: '24°C' };
    if (device.kind === '电视') return { ...device, on: false };
    return device;
  }
  if (scene === '睡眠') {
    if (device.kind === '灯' || device.kind === '电视') return { ...device, on: false };
    if (device.kind === '空调' && device.room === '客厅') return { ...device, on: false };
    if (device.kind === '空调' && device.room === '卧室') return { ...device, on: true, paramValue: '26°C' };
    return device;
  }
  if (device.room === '客厅' && device.kind === '灯') return { ...device, on: true, paramValue: '15%' };
  if (device.room === '客厅' && device.kind === '窗帘') return { ...device, on: true, paramValue: '闭合' };
  if (device.room === '客厅' && device.kind === '电视') return { ...device, on: true };
  return device;
}

export type ServiceCall = {
  domain: string;
  service: string;
  data?: Record<string, number>;
};

export function serviceCalls(before: DeviceRow, after: DeviceRow): ServiceCall[] {
  if (before.offline || (before.on === after.on && before.paramValue === after.paramValue)) return [];
  const domain = before.id.split('.')[0];
  if (domain === 'cover') {
    if (after.paramValue === '闭合') return [{ domain, service: 'close_cover' }];
    if (after.on && !before.on) return [{ domain, service: 'open_cover' }];
    if (!after.on && before.on) return [{ domain, service: 'close_cover' }];
    return [];
  }
  if (domain === 'climate') {
    const calls: ServiceCall[] = [];
    if (!after.on && before.on) calls.push({ domain, service: 'turn_off' });
    if (after.on && !before.on) calls.push({ domain, service: 'turn_on' });
    const temperature = celsius(after.paramValue);
    if (after.on && temperature !== null && (!before.on || after.paramValue !== before.paramValue)) {
      calls.push({ domain, service: 'set_temperature', data: { temperature } });
    }
    return calls;
  }
  if (domain === 'light') {
    if (!after.on) return before.on ? [{ domain, service: 'turn_off' }] : [];
    const brightness = percent(after.paramValue);
    const data = brightness === null ? undefined : { brightness_pct: brightness };
    if (!before.on || after.paramValue !== before.paramValue) return [{ domain, service: 'turn_on', ...(data ? { data } : {}) }];
    return [];
  }
  if (domain === 'media_player' && after.on !== before.on) {
    return [{ domain, service: after.on ? 'turn_on' : 'turn_off' }];
  }
  return [];
}

function percent(value: string | null) {
  const match = value?.match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : null;
}

function celsius(value: string | null) {
  const match = value?.match(/(\d+(?:\.\d+)?)\u00b0C/);
  return match ? Number(match[1]) : null;
}
