import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildApp } from '../src/app.ts';

test('внутренняя ошибка скрывает подробности и стек', async () => {
  const app = buildApp();
  app.get('/test-failure', () => { throw new Error('secret-internal-value'); });
  try {
    const response = await app.inject('/test-failure');
    assert.equal(response.statusCode, 500);
    assert.deepEqual(Object.keys(response.json()), ['errors']);
    const error = response.json().errors[0];
    assert.deepEqual(Object.keys(error).sort(), ['field', 'message']);
    assert.equal(error.field, null);
    assert.match(error.message, /[а-яё]/i);
    assert.doesNotMatch(response.body, /secret-internal-value|stack/);
  } finally {
    await app.close();
  }
});

test('изменённые тарифы определяют и цену, и подписи страницы', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const work = join(root, 'work');
  await mkdir(work, { recursive: true });
  const fixture = await mkdtemp(join(work, 'tariff-'));
  let configured: ReturnType<typeof buildApp> | undefined;
  try {
    await cp(join(root, 'src'), join(fixture, 'src'), { recursive: true });
    await cp(join(root, 'public'), join(fixture, 'public'), { recursive: true });
    await writeFile(join(fixture, 'src/tariffs.json'), JSON.stringify({
      divisor: 5000, base: 200, perKg: 60, perDistanceBlock: 20,
      distanceBlockKm: 15, expressMultiplier: 2, fragile: 200,
    }));
    const { buildApp: buildConfigured } = await import(pathToFileURL(join(fixture, 'src/app.ts')).href);
    configured = buildConfigured();
    const quote = await configured!.inject({ method: 'POST', url: '/api/quote', payload: {
      weightKg: 2, lengthCm: 10, widthCm: 10, heightCm: 10,
      originCity: 'moscow', destinationCity: 'saint-petersburg', deliveryType: 'express', fragile: true,
    } });
    assert.equal(quote.statusCode, 200);
    assert.equal(quote.json().totalRub, 2720);
    assert.equal(quote.json().distanceBlocks, 47);
    const page = await configured!.inject('/');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Базовый сбор<\/span><strong>200 ₽/);
    assert.match(page.body, /Каждый начатый кг<\/span><strong>60 ₽/);
    assert.match(page.body, /Каждые начатые 15 км<\/span><strong>20 ₽/);
    assert.match(page.body, /Стоимость × 2/);
    assert.match(page.body, /\+200 ₽/);
    assert.match(page.body, /data-distance-block-km="15"/);
  } finally {
    await configured?.close();
    assert.equal(dirname(fixture), work);
    await rm(fixture, { recursive: true, force: true });
  }
});
