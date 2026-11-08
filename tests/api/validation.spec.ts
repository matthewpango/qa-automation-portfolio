import { test, expect } from '@playwright/test';
import { expectErrors, expectQuote, parcel } from './support.ts';

for (const field of Object.keys(parcel)) {
  test(`API-01: обязательное поле ${field} отсутствует`, async ({ request }) => {
    const data: Record<string, unknown> = { ...parcel };
    delete data[field];
    await expectErrors(await request.post('/api/quote', { data }), 400, [field]);
  });
}

const invalidTypes: Array<[string, unknown[]]> = [
  ...['weightKg', 'lengthCm', 'widthCm', 'heightCm'].map(field =>
    [field, [null, '2', true, {}, []]] as [string, unknown[]]),
  ['originCity', [null, 2, true, {}, [], '', 'unknown']],
  ['destinationCity', [null, 2, true, {}, [], '', 'unknown']],
  ['deliveryType', [null, 1, true, {}, [], '', 'overnight']],
  ['fragile', [null, 'false', 0, {}, []]],
];
for (const [field, values] of invalidTypes) {
  test(`API-05/06: неверные типы и значения ${field} не исправляются`, async ({ request }) => {
    for (const value of values) {
      await test.step(JSON.stringify(value), async () => {
        await expectErrors(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }), 400, [field]);
      });
    }
  });
}

for (const weightKg of [0, 0.09, 30.01, 1.251, 1.00000000001, 1.00999999999]) {
  test(`API-02/03: недопустимый вес ${weightKg}`, async ({ request }) => {
    await expectErrors(await request.post('/api/quote', {
      data: { ...parcel, weightKg },
    }), 400, ['weightKg']);
  });
}

for (const [weightKg, billedWeightKg, totalRub] of [
  [0.1, 1, 850], [0.11, 1, 850], [0.29, 1, 850],
  [1.25, 2, 900], [29.99, 30, 2300], [30, 30, 2300],
] as const) {
  test(`API-02/03: допустимый вес ${weightKg}`, async ({ request }) => {
    const body = await expectQuote(await request.post('/api/quote', { data: { ...parcel, weightKg } }));
    expect(body.actualWeightKg).toBe(weightKg);
    expect(body.billedWeightKg).toBe(billedWeightKg);
    expect(body.totalRub).toBe(totalRub);
  });
}

for (const field of ['lengthCm', 'widthCm', 'heightCm']) {
  test(`API-04: допустимые границы ${field}`, async ({ request }) => {
    for (const value of [1, 2, 99, 100]) {
      await test.step(String(value), async () => {
        const body = await expectQuote(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }));
        expect(body.totalRub).toBe(900);
      });
    }
  });

  test(`API-04: внешние границы и дробь ${field}`, async ({ request }) => {
    for (const value of [-1, 0, 101, 1.5]) {
      await test.step(String(value), async () => {
        await expectErrors(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }), 400, [field]);
      });
    }
  });
}

for (const field of ['extraField', 'distanceKm']) {
  test(`API-06: неизвестное поле ${field}`, async ({ request }) => {
    await expectErrors(await request.post('/api/quote', {
      data: { ...parcel, [field]: 1 },
    }), 400, [field]);
  });
}

test('API-08: несколько ошибок, без требования к порядку', async ({ request }) => {
  await expectErrors(await request.post('/api/quote', {
    data: { ...parcel, weightKg: '2', destinationCity: 'unknown', extraField: true },
  }), 400, ['weightKg', 'destinationCity', 'extraField']);
});

for (const data of ['null', '[]', '42', 'false', '"посылка"', '{', '']) {
  test(`API-08/09: неверное тело ${JSON.stringify(data)}`, async ({ request }) => {
    await expectErrors(await request.post('/api/quote', {
      headers: { 'Content-Type': 'application/json' }, data,
    }), 400, [null]);
  });
}

for (const contentType of ['text/plain', 'application/xml']) {
  test(`API-09: Content-Type ${contentType} не поддерживается`, async ({ request }) => {
    await expectErrors(await request.post('/api/quote', {
      headers: { 'Content-Type': contentType }, data: JSON.stringify(parcel),
    }), 415, [null]);
  });
}

test('API-09: Content-Type отсутствует', async ({ request }) => {
  await expectErrors(await request.post('/api/quote'), 415, [null]);
});

test('API-03/09: JSON с charset, пробелами и весом 1.250 принимается', async ({ request }) => {
  const data = JSON.stringify(parcel, null, 2).replace('"weightKg": 2', '"weightKg": 1.250');
  const body = await expectQuote(await request.post('/api/quote', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }, data,
  }));
  expect(body.actualWeightKg).toBe(1.25);
  expect(body.totalRub).toBe(900);
});

test('API-10: слишком большое JSON-тело возвращает 413', async ({ request }) => {
  await expectErrors(await request.post('/api/quote', {
    data: { ...parcel, padding: 'x'.repeat(2 * 1024 * 1024) },
  }), 413, [null]);
});
