import { SUGGESTIONS } from './seedData.js';

export function pickSuggestion(index: number, weatherOn: boolean) {
  const pool = SUGGESTIONS.filter((item) => item.weather === weatherOn);
  const picked = pool[index % Math.max(pool.length, 1)] ?? SUGGESTIONS[0];
  return {
    ...picked,
    reason: weatherOn ? picked.reason : '没拿到天气，已改成按通勤场合推荐。',
  };
}
