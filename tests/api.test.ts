import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { buildApp } from '../src/app.ts';

const app = buildApp();
after(() => app.close());
const parcel = {
  weightKg: 2, lengthCm: 10, widthCm: 10, heightCm: 10,
  distanceKm: 15, deliveryType: 'standard', fragile: false,
};

test('API возвращает расчёт обычной доставки', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/quote', payload: parcel });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().totalRub, 220);
  assert.equal(response.json().currency, 'RUB');
});

const invalid: Array<[string, unknown]> = [
  ['weightKg', undefined], ['weightKg', null], ['weightKg', '2'],
  ['weightKg', 0.09], ['weightKg', 30.01], ['weightKg', 1.251],
  ['extraField', 1], ['lengthCm', 0], ['widthCm', 101], ['heightCm', 1.5],
  ['distanceKm', 0], ['distanceKm', 3001], ['distanceKm', 1.5],
  ['deliveryType', 'overnight'], ['fragile', 'false'],
];
for (const [field, value] of invalid) {
  test(`API отклоняет ${field}=${String(value)}`, async () => {
    const payload: Record<string, unknown> = { ...parcel, [field]: value };
    if (value === undefined) delete payload[field];
    const response = await app.inject({ method: 'POST', url: '/api/quote', payload });
    assert.equal(response.statusCode, 400);
    assert.ok(response.json().errors.some((error: { field: string; message: string }) =>
      error.field === field && /[а-яё]/i.test(error.message)));
  });
}

for (const value of [0.1, 0.29, 1.250, 30]) {
  test(`API принимает допустимый вес ${value}`, async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/quote', payload: { ...parcel, weightKg: value },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().actualWeightKg, value);
  });
}

test('API принимает включённые границы размеров и расстояния', async () => {
  for (const [side, distance] of [[1, 1], [100, 3000]]) {
    const response = await app.inject({ method: 'POST', url: '/api/quote', payload: {
      ...parcel, lengthCm: side, widthCm: side, heightCm: side, distanceKm: distance,
    } });
    assert.equal(response.statusCode, 200);
  }
});

test('API возвращает несколько ошибок без автоматического исправления', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/quote', payload: {
    ...parcel, weightKg: '2', distanceKm: 0, extraField: true,
  } });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(new Set(response.json().errors.map((e: { field: string }) => e.field)),
    new Set(['weightKg', 'distanceKm', 'extraField']));
});

test('API сообщает об ошибке всего тела для повреждённого JSON', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/quote',
    headers: { 'content-type': 'application/json' }, payload: '{' });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().errors[0].field, null);
  assert.match(response.json().errors[0].message, /[а-яё]/i);
});

test('API требует application/json даже для поддерживаемого Fastify text/plain', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/quote',
    headers: { 'content-type': 'text/plain' }, payload: 'hello' });
  assert.equal(response.statusCode, 415);
  assert.equal(response.json().errors[0].field, null);
});

test('внутренняя ошибка скрывает подробности и стек', async () => {
  const failing = buildApp();
  failing.get('/test-failure', () => { throw new Error('secret-internal-value'); });
  try {
    const response = await failing.inject('/test-failure');
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().errors[0].field, null);
    assert.match(response.json().errors[0].message, /[а-яё]/i);
    assert.doesNotMatch(response.body, /secret-internal-value|stack/);
  } finally {
    await failing.close();
  }
});
