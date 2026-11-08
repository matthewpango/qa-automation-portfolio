import { test, expect } from '@playwright/test';
import { cities, expectErrors, expectQuote, parcel } from './support.ts';

for (const [deliveryType, fragile, multiplier, express, surcharge, total] of [
  ['standard', false, 1, 0, 0, 900],
  ['standard', true, 1, 0, 100, 1000],
  ['express', false, 1.5, 450, 0, 1350],
  ['express', true, 1.5, 450, 100, 1450],
] as const) {
  test(`CALC-04: ${deliveryType}, хрупкость ${fragile}: ${total} ₽`, async ({ request }) => {
    const body = await expectQuote(await request.post('/api/quote', {
      data: { ...parcel, deliveryType, fragile },
    }));
    expect(body).toEqual({
      actualWeightKg: 2, volumetricWeightKg: 0.2, chargeableWeightKg: 2,
      billedWeightKg: 2, distanceBlocks: 70, baseCostRub: 100,
      weightCostRub: 100, distanceCostRub: 700, subtotalRub: 900,
      deliveryMultiplier: multiplier, expressSurchargeRub: express, fragileSurchargeRub: surcharge,
      totalRub: total, currency: 'RUB', distanceKm: 700,
      originCity: 'moscow', destinationCity: 'saint-petersburg',
      originCityName: 'Москва', destinationCityName: 'Санкт-Петербург',
    });
  });
}

for (const [weightKg, lengthCm, widthCm, heightCm, volume, chargeable, billed, total] of [
  [0.99, 10, 10, 10, 0.2, 0.99, 1, 850],
  [1, 10, 10, 10, 0.2, 1, 1, 850],
  [1.01, 10, 10, 10, 0.2, 1.01, 2, 900],
  [0.2, 10, 10, 10, 0.2, 0.2, 1, 850],
  [0.1, 41, 61, 2, 1.0004, 1.0004, 2, 900],
  [30, 100, 100, 100, 200, 200, 200, 10800],
] as const) {
  test(`CALC-01/02/03: ${weightKg} кг, ${lengthCm}×${widthCm}×${heightCm} см`, async ({ request }) => {
    const body = await expectQuote(await request.post('/api/quote', {
      data: { ...parcel, weightKg, lengthCm, widthCm, heightCm },
    }));
    expect(body.actualWeightKg).toBe(weightKg);
    expect(body.volumetricWeightKg).toBe(volume);
    expect(body.chargeableWeightKg).toBe(chargeable);
    expect(body.billedWeightKg).toBe(billed);
    expect(body.totalRub).toBe(total);
  });
}

test('ROUTE-01/02: все 90 направлений доступны, обратные маршруты симметричны', async ({ request }) => {
  const results = new Map<string, { distance: number; price: number }>();
  for (const [originCity, originCityName] of cities) {
    for (const [destinationCity, destinationCityName] of cities) {
      if (originCity === destinationCity) continue;
      await test.step(`${originCityName} → ${destinationCityName}`, async () => {
        const body = await expectQuote(await request.post('/api/quote', {
          data: { ...parcel, originCity, destinationCity },
        }));
        expect(body.originCity).toBe(originCity);
        expect(body.destinationCity).toBe(destinationCity);
        expect(body.originCityName).toBe(originCityName);
        expect(body.destinationCityName).toBe(destinationCityName);
        expect(Number.isInteger(body.distanceKm)).toBe(true);
        results.set(`${originCity}:${destinationCity}`, { distance: body.distanceKm, price: body.totalRub });
      });
    }
  }
  expect(results.size).toBe(90);
  for (const [key, result] of results) expect(results.get(key.split(':').reverse().join(':'))).toEqual(result);
});

test('ROUTE-03: перевозки внутри каждого из десяти городов запрещены', async ({ request }) => {
  for (const [city, name] of cities) {
    await test.step(name, async () => {
      await expectErrors(await request.post('/api/quote', {
        data: { ...parcel, originCity: city, destinationCity: city },
      }), 400, ['destinationCity']);
    });
  }
});

test('ROUTE-04: смена города меняет расстояние и цену по фиксированному эталону', async ({ request }) => {
  const body = await expectQuote(await request.post('/api/quote', {
    data: { ...parcel, destinationCity: 'kazan' },
  }));
  expect(body.distanceKm).toBe(820);
  expect(body.distanceBlocks).toBe(82);
  expect(body.distanceCostRub).toBe(820);
  expect(body.totalRub).toBe(1020);
});

test('одинаковый запрос воспроизводит одинаковый результат', async ({ request }) => {
  const first = await expectQuote(await request.post('/api/quote', { data: parcel }));
  const second = await expectQuote(await request.post('/api/quote', { data: parcel }));
  expect(second).toEqual(first);
});
