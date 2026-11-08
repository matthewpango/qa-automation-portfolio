import { test, expect } from '@playwright/test';
import { reportScenario } from '../report.ts';
import { cities, expectErrors, expectQuote, parcel } from './support.ts';

for (const [deliveryType, fragile, multiplier, express, surcharge, total] of [
  ['standard', false, 1, 0, 0, 900],
  ['standard', true, 1, 0, 100, 1000],
  ['express', false, 1.5, 450, 0, 1350],
  ['express', true, 1.5, 450, 100, 1450],
] as const) {
  test(`${deliveryType === 'standard' ? 'Обычная' : 'Экспресс'} доставка ${fragile ? 'с хрупким грузом' : 'без хрупкого груза'} стоит ${total} ₽`, async ({ request }) => {
    await reportScenario('Расчёт стоимости', 'Доплаты за экспресс и хрупкий груз');

    await test.step(`${deliveryType === 'standard' ? 'Обычная' : 'Экспресс'} доставка ${fragile ? 'с хрупким грузом' : 'без хрупкого груза'} стоит ${total} ₽`, async () => {
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
  test(`Вес ${weightKg} кг и размеры ${lengthCm} × ${widthCm} × ${heightCm} см дают цену ${total} ₽`, async ({ request }) => {
    await reportScenario('Расчёт стоимости', 'Выбор и округление оплачиваемого веса');

    await test.step(`Вес ${weightKg} кг и размеры ${lengthCm} × ${widthCm} × ${heightCm} см дают цену ${total} ₽`, async () => {
      const body = await expectQuote(await request.post('/api/quote', {
        data: { ...parcel, weightKg, lengthCm, widthCm, heightCm },
      }));
      expect(body.actualWeightKg).toBe(weightKg);
      expect(body.volumetricWeightKg).toBe(volume);
      expect(body.chargeableWeightKg).toBe(chargeable);
      expect(body.billedWeightKg).toBe(billed);
      expect(body.totalRub).toBe(total);
    });
  });
}

for (const [index, [originCity, originCityName]] of cities.entries()) {
  for (const [destinationCity, destinationCityName] of cities.slice(index + 1)) {
    test(`Маршрут ${originCityName} ↔ ${destinationCityName}: доставка доступна в обе стороны с одинаковыми ценой и расстоянием`, async ({ request }) => {
      await reportScenario('Междугородние маршруты', 'Доступность и симметрия всех направлений');

      const forward = await test.step(`Рассчитать доставку ${originCityName} → ${destinationCityName}`, async () => {
        const body = await expectQuote(await request.post('/api/quote', {
          data: { ...parcel, originCity, destinationCity },
        }));
        expect(body.originCity).toBe(originCity);
        expect(body.destinationCity).toBe(destinationCity);
        expect(body.originCityName).toBe(originCityName);
        expect(body.destinationCityName).toBe(destinationCityName);
        expect(Number.isInteger(body.distanceKm)).toBe(true);
        return body;
      });

      const reverse = await test.step(`Рассчитать доставку ${destinationCityName} → ${originCityName}`, async () => {
        const body = await expectQuote(await request.post('/api/quote', {
          data: { ...parcel, originCity: destinationCity, destinationCity: originCity },
        }));
        expect(body.originCity).toBe(destinationCity);
        expect(body.destinationCity).toBe(originCity);
        expect(body.originCityName).toBe(destinationCityName);
        expect(body.destinationCityName).toBe(originCityName);
        expect(Number.isInteger(body.distanceKm)).toBe(true);
        return body;
      });

      await test.step('Проверить одинаковые цену и расстояние для прямого и обратного маршрута', async () => {
        expect(reverse.distanceKm).toBe(forward.distanceKm);
        expect(reverse.totalRub).toBe(forward.totalRub);
      });
    });
  }
}

for (const [city, name] of cities) {
  test(`Доставка внутри города ${name} запрещена`, async ({ request }) => {
    await reportScenario('Междугородние маршруты', 'Запрет доставки внутри города');

    await test.step(`Запросить доставку внутри города ${name}: получить отказ и ошибку города назначения`, async () => {
      await expectErrors(await request.post('/api/quote', {
        data: { ...parcel, originCity: city, destinationCity: city },
      }), 400, ['destinationCity']);
    });
  });
}

test('Доставка Москва → Казань: 820 км и стоимость 1 020 ₽', async ({ request }) => {
  await reportScenario('Междугородние маршруты', 'Цена выбранного маршрута');

  await test.step('Доставка Москва → Казань: 820 км и стоимость 1 020 ₽', async () => {
    const body = await expectQuote(await request.post('/api/quote', {
      data: { ...parcel, destinationCity: 'kazan' },
    }));
    expect(body.distanceKm).toBe(820);
    expect(body.distanceBlocks).toBe(82);
    expect(body.distanceCostRub).toBe(820);
    expect(body.totalRub).toBe(1020);
  });
});

test('Повторный расчёт одной посылки возвращает тот же результат', async ({ request }) => {
  await reportScenario('Расчёт стоимости', 'Воспроизводимый результат');

  await test.step('Повторный расчёт одной посылки возвращает тот же результат', async () => {
    const first = await expectQuote(await request.post('/api/quote', { data: parcel }));
    const second = await expectQuote(await request.post('/api/quote', { data: parcel }));
    expect(second).toEqual(first);
  });
});
