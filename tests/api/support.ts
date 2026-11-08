import { test, expect } from '@playwright/test';
import type { APIResponse } from '@playwright/test';

export const fieldNames: Record<string, string> = {
  weightKg: 'Вес, кг', lengthCm: 'Длина, см', widthCm: 'Ширина, см', heightCm: 'Высота, см',
  originCity: 'Город отправления', destinationCity: 'Город назначения',
  deliveryType: 'Тип доставки', fragile: 'Хрупкий груз',
  extraField: 'Постороннее поле', distanceKm: 'Расстояние, заданное вручную',
};

export const parcel = {
  weightKg: 2, lengthCm: 10, widthCm: 10, heightCm: 10,
  originCity: 'moscow', destinationCity: 'saint-petersburg',
  deliveryType: 'standard', fragile: false,
};

export const cities = [
  ['moscow', 'Москва'], ['saint-petersburg', 'Санкт-Петербург'], ['kazan', 'Казань'],
  ['nizhny-novgorod', 'Нижний Новгород'], ['voronezh', 'Воронеж'],
  ['rostov-on-don', 'Ростов-на-Дону'], ['volgograd', 'Волгоград'],
  ['samara', 'Самара'], ['krasnodar', 'Краснодар'], ['yekaterinburg', 'Екатеринбург'],
] as const;

export async function expectQuote(response: APIResponse) {
  return test.step('Проверить успешный ответ: состав данных, значения, валюту и сумму доплат', async () => {
    expect(response.status(), await response.text()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    const numberFields = [
      'actualWeightKg', 'volumetricWeightKg', 'chargeableWeightKg', 'billedWeightKg',
      'distanceBlocks', 'baseCostRub', 'weightCostRub', 'distanceCostRub', 'subtotalRub',
      'deliveryMultiplier', 'expressSurchargeRub', 'fragileSurchargeRub', 'totalRub', 'distanceKm',
    ];
    const stringFields = ['currency', 'originCity', 'destinationCity', 'originCityName', 'destinationCityName'];
    expect(Object.keys(body).sort()).toEqual([...numberFields, ...stringFields].sort());
    for (const field of numberFields) {
      expect(typeof body[field], field).toBe('number');
      expect(Number.isFinite(body[field]), field).toBe(true);
      expect(body[field], field).toBeGreaterThanOrEqual(0);
    }
    for (const field of stringFields) {
      expect(typeof body[field], field).toBe('string');
      expect(body[field].length, field).toBeGreaterThan(0);
    }
    expect(body.currency).toBe('RUB');
    expect(body.distanceKm).toBeGreaterThan(0);
    expect(body.totalRub).toBeGreaterThan(0);
    expect(body.totalRub).toBe(body.subtotalRub + body.expressSurchargeRub + body.fragileSurchargeRub);
    return body;
  });
}

export async function expectErrors(response: APIResponse, status: number, fields: Array<string | null>) {
  return test.step(`Проверить отказ с кодом ${status}: сообщение об ошибке и поля ${fields.map(field => fieldNames[field ?? ''] ?? 'весь запрос').join(', ')}`, async () => {
    expect(response.status(), await response.text()).toBe(status);
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.json();
    expect(Object.keys(body)).toEqual(['errors']);
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    for (const error of body.errors) {
      expect(Object.keys(error).sort()).toEqual(['field', 'message']);
      expect(error.field === null || typeof error.field === 'string').toBe(true);
      expect(typeof error.message).toBe('string');
      expect(error.message).toMatch(/[а-яё]/i);
    }
    expect(new Set(body.errors.map((error: { field: string | null }) => error.field))).toEqual(new Set(fields));
    return body;
  });
}
