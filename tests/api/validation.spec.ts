import { test, expect } from '@playwright/test';
import { reportScenario } from '../report.ts';
import { fieldNames, expectErrors, expectQuote, parcel } from './support.ts';

for (const field of Object.keys(parcel)) {
  test(`Без обязательного поля «${fieldNames[field]}» расчёт отклоняется`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Обязательные поля');

    await test.step(`Без обязательного поля «${fieldNames[field]}» расчёт отклоняется`, async () => {
      const data: Record<string, unknown> = { ...parcel };
      delete data[field];
      await expectErrors(await request.post('/api/quote', { data }), 400, [field]);
    });
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
  test(`Неверные значения поля «${fieldNames[field]}» отклоняются без автоматического исправления`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Типы данных и допустимые значения');

    for (const value of values) {
      await test.step(`Передать в поле «${fieldNames[field]}» значение ${JSON.stringify(value)} и получить ошибку`, async () => {
        await expectErrors(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }), 400, [field]);
      });
    }
  });
}

for (const weightKg of [0, 0.09, 30.01, 1.251, 1.00000000001, 1.00999999999]) {
  test(`Вес ${weightKg} кг вне допустимого диапазона или точности отклоняется`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Границы и точность веса');

    await test.step(`Вес ${weightKg} кг вне допустимого диапазона или точности отклоняется`, async () => {
      await expectErrors(await request.post('/api/quote', {
        data: { ...parcel, weightKg },
      }), 400, ['weightKg']);
    });
  });
}

for (const [weightKg, billedWeightKg, totalRub] of [
  [0.1, 1, 850], [0.11, 1, 850], [0.29, 1, 850],
  [1.25, 2, 900], [29.99, 30, 2300], [30, 30, 2300],
] as const) {
  test(`Допустимый вес ${weightKg} кг принимается, цена составляет ${totalRub} ₽`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Границы и точность веса');

    await test.step(`Допустимый вес ${weightKg} кг принимается, цена составляет ${totalRub} ₽`, async () => {
      const body = await expectQuote(await request.post('/api/quote', { data: { ...parcel, weightKg } }));
      expect(body.actualWeightKg).toBe(weightKg);
      expect(body.billedWeightKg).toBe(billedWeightKg);
      expect(body.totalRub).toBe(totalRub);
    });
  });
}

for (const field of ['lengthCm', 'widthCm', 'heightCm']) {
  test(`Поле «${fieldNames[field]}» принимает граничные размеры от 1 до 100 см`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Границы габаритов');

    for (const value of [1, 2, 99, 100]) {
      await test.step(`Передать размер ${value} см и проверить результат`, async () => {
        const body = await expectQuote(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }));
        expect(body.totalRub).toBe(900);
      });
    }
  });

  test(`Поле «${fieldNames[field]}» отклоняет размеры вне диапазона и дробные сантиметры`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Границы габаритов');

    for (const value of [-1, 0, 101, 1.5]) {
      await test.step(`Передать размер ${value} см и проверить результат`, async () => {
        await expectErrors(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }), 400, [field]);
      });
    }
  });
}

for (const field of ['extraField', 'distanceKm']) {
  test(`Лишнее поле «${fieldNames[field]}» отклоняется`, async ({ request }) => {
    await reportScenario('Проверка данных посылки', 'Запрет лишних полей и ручного расстояния');

    await test.step(`Лишнее поле «${fieldNames[field]}» отклоняется`, async () => {
      await expectErrors(await request.post('/api/quote', {
        data: { ...parcel, [field]: 1 },
      }), 400, [field]);
    });
  });
}

test('Несколько ошибок запроса возвращаются вместе независимо от порядка', async ({ request }) => {
  await reportScenario('Проверка данных посылки', 'Все ошибки одного запроса');

  await test.step('Несколько ошибок запроса возвращаются вместе независимо от порядка', async () => {
    await expectErrors(await request.post('/api/quote', {
      data: { ...parcel, weightKg: '2', destinationCity: 'unknown', extraField: true },
    }), 400, ['weightKg', 'destinationCity', 'extraField']);
  });
});

for (const data of ['null', '[]', '42', 'false', '"посылка"', '{', '']) {
  test(`Некорректное содержимое запроса ${JSON.stringify(data)} отклоняется`, async ({ request }) => {
    await reportScenario('Обмен данными с сервисом', 'Некорректное содержимое запроса');

    await test.step(`Некорректное содержимое запроса ${JSON.stringify(data)} отклоняется`, async () => {
      await expectErrors(await request.post('/api/quote', {
        headers: { 'Content-Type': 'application/json' }, data,
      }), 400, [null]);
    });
  });
}

for (const contentType of ['text/plain', 'application/xml']) {
  test(`Формат ${contentType} отклоняется: сервис принимает только JSON`, async ({ request }) => {
    await reportScenario('Обмен данными с сервисом', 'Поддерживаемый формат JSON');

    await test.step(`Формат ${contentType} отклоняется: сервис принимает только JSON`, async () => {
      await expectErrors(await request.post('/api/quote', {
        headers: { 'Content-Type': contentType }, data: JSON.stringify(parcel),
      }), 415, [null]);
    });
  });
}

test('Запрос без указания формата данных отклоняется', async ({ request }) => {
  await reportScenario('Обмен данными с сервисом', 'Поддерживаемый формат JSON');

  await test.step('Запрос без указания формата данных отклоняется', async () => {
    await expectErrors(await request.post('/api/quote'), 415, [null]);
  });
});

test('JSON с указанием кодировки, пробелами и весом 1.250 принимается', async ({ request }) => {
  await reportScenario('Обмен данными с сервисом', 'Поддерживаемый формат JSON');

  await test.step('JSON с указанием кодировки, пробелами и весом 1.250 принимается', async () => {
    const data = JSON.stringify(parcel, null, 2).replace('"weightKg": 2', '"weightKg": 1.250');
    const body = await expectQuote(await request.post('/api/quote', {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }, data,
    }));
    expect(body.actualWeightKg).toBe(1.25);
    expect(body.totalRub).toBe(900);
  });
});

test('Запрос больше 1 МБ отклоняется с сообщением о превышении размера', async ({ request }) => {
  await reportScenario('Обмен данными с сервисом', 'Ограничение размера запроса');

  await test.step('Запрос больше 1 МБ отклоняется с сообщением о превышении размера', async () => {
    await expectErrors(await request.post('/api/quote', {
      data: { ...parcel, padding: 'x'.repeat(2 * 1024 * 1024) },
    }), 413, [null]);
  });
});
