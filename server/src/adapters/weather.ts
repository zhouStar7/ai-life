const coordinates = new Map<string, [number, number]>([
  ['北京', [39.90, 116.41]], ['上海', [31.23, 121.47]], ['广州', [23.13, 113.26]],
  ['深圳', [22.54, 114.06]], ['杭州', [30.27, 120.15]], ['南京', [32.06, 118.80]],
  ['成都', [30.57, 104.07]], ['重庆', [29.56, 106.55]], ['武汉', [30.59, 114.31]],
  ['西安', [34.34, 108.94]], ['天津', [39.08, 117.20]], ['苏州', [31.30, 120.59]],
]);
export const weatherCities = [...coordinates.keys()];

function condition(code: number) {
  if (code === 0) return '晴';
  if ([1, 2, 3].includes(code)) return '多云';
  if ([45, 48].includes(code)) return '雾';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪';
  if ([95, 96, 99].includes(code)) return '雷雨';
  if (code >= 51 && code <= 82) return '雨';
  return '';
}

export async function readWeather(customUrl?: string, city = '') {
  const weatherSource = customUrl ? '自定义天气接口' : 'Open-Meteo';
  try {
    const url = new URL(customUrl || 'https://api.open-meteo.com/v1/forecast');
    if (customUrl) {
      if (city) url.searchParams.set('city', city);
    } else {
      const point = coordinates.get(city);
      if (!point) throw new Error('city');
      url.searchParams.set('latitude', String(point[0]));
      url.searchParams.set('longitude', String(point[1]));
      url.searchParams.set('current', 'temperature_2m,weather_code');
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('weather');
    const body = await response.json() as { label?: string; current?: { temperature_2m: number; weather_code: number } };
    const weatherLabel = customUrl ? body.label?.trim() : body.current && Number.isFinite(body.current.temperature_2m)
      ? `${body.current.temperature_2m}°C ${condition(body.current.weather_code)}`.trim() : '';
    if (!weatherLabel) throw new Error('weather');
    return { weatherOn: true, weatherLabel, weatherSource, weatherUpdatedAt: new Date().toISOString() };
  } catch {
    return { weatherOn: false, weatherLabel: '天气未知', weatherSource, weatherUpdatedAt: '' };
  }
}
