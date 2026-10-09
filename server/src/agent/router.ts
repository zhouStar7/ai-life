export type Intent = 'outfit' | 'meal' | 'home' | 'travel' | 'spend' | 'cross';

export function routeIntent(text: string): Intent {
  if (/下雨|降温|交流会|出差/.test(text)) return 'cross';
  if (/穿|搭配/.test(text)) return 'outfit';
  if (/吃|餐|食|热量|蛋白/.test(text)) return 'meal';
  if (/家|灯|空调|滤芯|场景/.test(text)) return 'home';
  if (/出行|行程|行李|飞机/.test(text)) return 'travel';
  if (/花|钱|预算|支出|账/.test(text)) return 'spend';
  return 'cross';
}

export function intentKey(intent: Intent) {
  if (intent === 'cross') return 'cross';
  if (intent === 'outfit') return 'outfit';
  if (intent === 'meal') return 'protein';
  if (intent === 'home') return 'filter';
  if (intent === 'travel') return 'prep';
  return 'spend';
}

export function intentHref(intent: Intent) {
  if (intent === 'outfit') return '/wardrobe';
  if (intent === 'meal') return '/diet';
  if (intent === 'home') return '/home';
  if (intent === 'travel') return '/travel';
  if (intent === 'spend') return '/spending';
  return '/';
}
