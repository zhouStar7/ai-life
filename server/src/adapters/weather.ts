export async function readWeather(url?: string) {
  if (!url) return { weatherOn: true, weatherLabel: '22°C 多云' };
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('weather');
    const body = await response.json() as { label?: string };
    if (!body.label) throw new Error('weather');
    return { weatherOn: true, weatherLabel: body.label };
  } catch {
    return { weatherOn: false, weatherLabel: '天气未知' };
  }
}
