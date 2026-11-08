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

function describeValue(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'пустой массив []';
  if (typeof value === 'object') return 'пустой объект {}';
  const typeNames: Record<string, string> = { string: 'строка', number: 'число', boolean: 'логическое значение' };
  return `${typeNames[typeof value]} ${JSON.stringify(value)}`;
}

for (const [field, values] of invalidTypes) {
  for (const value of values) {
    const valueName = describeValue(value);

    test(`Поле «${fieldNames[field]}»: ${valueName} отклоняется без исправления`, async ({ request }) => {
      await reportScenario('Проверка данных посылки', 'Типы данных и допустимые значения');

      await test.step(`Передать в поле «${fieldNames[field]}» ${valueName}: получить ошибку поля`, async () => {
        await expectErrors(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }), 400, [field]);
      });
    });
  }
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
  for (const [value, volume] of [[1, 0.02], [2, 0.04], [99, 1.98], [100, 2]] as const) {
    test(`Поле «${fieldNames[field]}»: размер ${value} см принимается и даёт объёмный вес ${volume} кг`, async ({ request }) => {
      await reportScenario('Проверка данных посылки', 'Границы габаритов');

      await test.step(`Передать размер ${value} см: проверить объёмный вес ${volume} кг и цену 900 ₽`, async () => {
        const body = await expectQuote(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }));
        expect(body.volumetricWeightKg).toBe(volume);
        expect(body.chargeableWeightKg).toBe(2);
        expect(body.billedWeightKg).toBe(2);
        expect(body.totalRub).toBe(900);
      });
    });
  }

  for (const value of [-1, 0, 101, 1.5]) {
    test(`Поле «${fieldNames[field]}»: размер ${value} см отклоняется`, async ({ request }) => {
      await reportScenario('Проверка данных посылки', 'Границы габаритов');

      await test.step(`Передать размер ${value} см: получить отказ и ошибку размера`, async () => {
        await expectErrors(await request.post('/api/quote', {
          data: { ...parcel, [field]: value },
        }), 400, [field]);
      });
    });
  }
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

for (const [data, description] of [
  ['null', 'null вместо объекта'],
  ['[]', 'массив вместо объекта'],
  ['42', 'число вместо объекта'],
  ['false', 'логическое значение вместо объекта'],
  ['"посылка"', 'строка вместо объекта'],
  ['{', 'оборванный JSON'],
  ['', 'пустое тело'],
] as const) {
  test(`Некорректное содержимое запроса: ${description} отклоняется`, async ({ request }) => {
    await reportScenario('Обмен данными с сервисом', 'Некорректное содержимое запроса');

    await test.step(`Отправить ${description}: получить отказ с кодом 400`, async () => {
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
