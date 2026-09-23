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
