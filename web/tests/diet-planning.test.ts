import assert from 'node:assert/strict';
import test from 'node:test';
import { commonMeals, estimateMeal, portionNutrition } from '../src/dietPlan';

test('common meals reuse the latest nutrition values and rank repeat meals first', () => {
  const base = { name: '豆腐饭', time: '12:30', date: '2028-02-28', kcal: 400, protein: 20, carb: 65, fat: 12 };
  const latest = { ...base, date: '2028-02-29', kcal: 440 };
  const other = { ...base, name: '面包', date: '2028-03-01' };
  const meals = [other, latest, base, { ...base, name: ' ' }];
  assert.deepEqual(commonMeals(meals), [latest, other]);
  assert.deepEqual(commonMeals(meals, 1), [latest]);
  assert.deepEqual(portionNutrition(latest, 1.5), { kcal: 660, protein: 30, carb: 98, fat: 18 });
  assert.deepEqual(portionNutrition(latest, 0.25), { kcal: 110, protein: 5, carb: 16, fat: 3 });
  assert.equal(latest.kcal, 440);
});

test('unrecognized dishes carry an editable estimate', () => {
  const guess = estimateMeal('家常秘制菜肴');
  assert.match(guess.note, /估/);
  assert.deepEqual(portionNutrition({ ...guess, kcal: 500 }, 0.5).kcal, 250);
});
