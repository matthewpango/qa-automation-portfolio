import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function fillParcel(page: Page) {
  await page.getByLabel('Вес, кг', { exact: true }).fill('2');
  await page.getByLabel('Длина, см', { exact: true }).fill('10');
  await page.getByLabel('Ширина, см', { exact: true }).fill('10');
  await page.getByLabel('Высота, см', { exact: true }).fill('10');
  await page.getByLabel('Город отправления', { exact: true }).selectOption('moscow');
  await page.getByLabel('Город назначения', { exact: true }).selectOption('saint-petersburg');
}

test('реальный расчёт, дробный вес и сброс результата', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Обычная', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Хрупкий груз', { exact: true })).not.toBeChecked();
  await fillParcel(page);
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('900 ₽');
  await expect(page.getByTestId('quote-result')).toContainText('Москва → Санкт-Петербург');
  await expect(page.getByTestId('quote-result')).toContainText('700 км');
  await page.getByLabel('Экспресс', { exact: true }).check();
  await expect(page.getByTestId('quote-result')).toBeHidden();
  await page.getByLabel('Хрупкий груз', { exact: true }).check();
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('1 450 ₽');
  await page.getByLabel('Вес, кг', { exact: true }).fill('1,25');
  const request = page.waitForRequest('**/api/quote');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  expect((await request).postDataJSON().weightKg).toBe(1.25);
  await expect(page.getByTestId('quote-result')).toBeVisible();
  await page.getByLabel('Город назначения', { exact: true }).selectOption('kazan');
  await expect(page.getByTestId('quote-result')).toBeHidden();
});

test('ошибки полей сохраняют данные и доступны с клавиатуры', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Вес, кг', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Длина, см', { exact: true })).toBeFocused();
  await fillParcel(page);
  let requests = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/quote')) requests++; });
  for (const value of ['', '1,2,3', '1.00000000001']) {
    await page.getByLabel('Вес, кг', { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#weightKg-error')).not.toBeEmpty();
  }
  expect(requests).toBe(0);
  await page.route('**/api/quote', (route) => route.fulfill({ status: 400,
    contentType: 'application/json', body: JSON.stringify({ errors: [
      { field: 'destinationCity', message: 'Выберите другой город назначения.' },
    ] }) }));
  await page.getByLabel('Вес, кг', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByLabel('Город назначения', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Город назначения', { exact: true })).toHaveValue('saint-petersburg');
});

test('поздний ответ скрывается, сетевой сбой позволяет повторить расчёт', async ({ page }) => {
  await page.goto('/');
  await fillParcel(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/quote', async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  const sent = page.waitForRequest('**/api/quote');
  const button = page.getByRole('button', { name: 'Рассчитать стоимость' });
  await button.click();
  await sent;
  await expect(button).toBeDisabled();
  await page.getByLabel('Город назначения', { exact: true }).selectOption('kazan');
  release();
  await expect(button).toBeEnabled();
  await expect(page.getByTestId('quote-result')).toBeHidden();
  await page.unroute('**/api/quote');
  await page.route('**/api/quote', (route) => route.abort());
  await button.click();
  await expect(page.getByRole('alert')).toContainText('соединение');
  await page.unroute('**/api/quote');
  await button.click();
  await expect(page.getByTestId('total')).toHaveText('1 020 ₽');
});

test('страница помещается на узком экране и не вызывает ошибок JavaScript', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await fillParcel(page);
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('900 ₽');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('два списка с 10 городами запрещают пустой и внутригородской маршрут', async ({ page }) => {
  await page.goto('/');
  const origin = page.getByRole('combobox', { name: 'Город отправления', exact: true });
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });
  await expect(origin).toHaveValue('');
  await expect(destination).toHaveValue('');
  await expect(origin.getByRole('option')).toHaveCount(11);
  await expect(destination.getByRole('option')).toHaveCount(11);
  await fillParcel(page);
  let requests = 0;
  page.on('request', request => { if (request.url().endsWith('/api/quote')) requests++; });
  await origin.selectOption('');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(origin).toHaveAttribute('aria-invalid', 'true');
  await origin.selectOption('moscow');
  await destination.selectOption('moscow');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(destination).toHaveAttribute('aria-invalid', 'true');
  await expect(destination).toHaveAccessibleDescription('Выберите другой город назначения.');
  await expect(page.getByTestId('quote-result')).toBeHidden();
  expect(requests).toBe(0);
  await destination.selectOption('kazan');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('1 020 ₽');
});

test('у городов нет обводки после мыши, но есть при навигации клавиатурой', async ({ page }) => {
  await page.goto('/');
  const origin = page.getByRole('combobox', { name: 'Город отправления', exact: true });
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });
  for (const [select, city] of [[origin, 'moscow'], [destination, 'kazan']] as const) {
    await select.click();
    await select.selectOption(city);
    await expect(select).toHaveCSS('outline-style', 'none');
    await page.keyboard.press('Escape');
  }
  await page.getByLabel('Высота, см', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(origin).toBeFocused();
  await expect(origin).toHaveCSS('outline-style', 'solid');
  await expect(origin).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Tab');
  await expect(destination).toBeFocused();
  await expect(destination).toHaveCSS('outline-style', 'solid');
  await expect(destination).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Shift+Tab');
  await expect(origin).toBeFocused();
  await expect(origin).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowDown');
  await expect(destination).toBeFocused();
  await expect(destination).toHaveCSS('outline-style', 'solid');
});

test('UI-03: изменение любого параметра скрывает предыдущую цену', async ({ page }) => {
  await page.goto('/');
  const changes = [
    ['вес', () => page.getByLabel('Вес, кг', { exact: true }).fill('3')],
    ['длина', () => page.getByLabel('Длина, см', { exact: true }).fill('20')],
    ['ширина', () => page.getByLabel('Ширина, см', { exact: true }).fill('20')],
    ['высота', () => page.getByLabel('Высота, см', { exact: true }).fill('20')],
    ['отправление', () => page.getByLabel('Город отправления', { exact: true }).selectOption('kazan')],
    ['назначение', () => page.getByLabel('Город назначения', { exact: true }).selectOption('kazan')],
    ['тип доставки', () => page.getByLabel('Экспресс', { exact: true }).check()],
    ['хрупкость', () => page.getByLabel('Хрупкий груз', { exact: true }).check()],
  ] as const;
  for (const [name, change] of changes) {
    await test.step(name, async () => {
      await fillParcel(page);
      await page.getByLabel('Обычная', { exact: true }).check();
      await page.getByLabel('Хрупкий груз', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      await expect(page.getByTestId('total')).toHaveText('900 ₽');
      await change();
      await expect(page.getByTestId('quote-result')).toBeHidden();
    });
  }
});

test('UI-03: поздняя ошибка старого маршрута не влияет на новую форму', async ({ page }) => {
  await page.goto('/');
  await fillParcel(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/quote', async route => {
    await gate;
    await route.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({ errors: [{ field: null, message: 'Ошибка старого маршрута.' }] }) });
  });
  const sent = page.waitForRequest('**/api/quote');
  const button = page.getByRole('button', { name: 'Рассчитать стоимость' });
  await button.click();
  await sent;
  await page.getByLabel('Город отправления', { exact: true }).selectOption('kazan');
  release();
  await expect(button).toBeEnabled();
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByTestId('quote-result')).toBeHidden();
  await expect(page.getByLabel('Город отправления', { exact: true })).toHaveValue('kazan');
  await page.unroute('**/api/quote');
  await button.click();
  await expect(page.getByTestId('total')).toHaveText('1 700 ₽');
  await expect(page.getByTestId('quote-result')).toContainText('Казань → Санкт-Петербург');
});

test('UI-04: ошибка 500 сохраняет данные и позволяет повторить расчёт', async ({ page }) => {
  await page.goto('/');
  await fillParcel(page);
  await page.route('**/api/quote', route => route.fulfill({ status: 500,
    contentType: 'application/json', body: JSON.stringify({ errors: [
      { field: null, message: 'Не удалось выполнить расчёт. Попробуйте позже.' },
    ] }) }), { times: 1 });
  const button = page.getByRole('button', { name: 'Рассчитать стоимость' });
  await button.click();
  await expect(page.getByRole('alert')).toContainText('Попробуйте позже');
  await expect(page.getByTestId('quote-result')).toBeHidden();
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Город назначения', { exact: true })).toHaveValue('saint-petersburg');
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByTestId('total')).toHaveText('900 ₽');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('UI-02/05: точка и запятая дают одинаковый расчёт и точный payload', async ({ page }) => {
  await page.goto('/');
  await fillParcel(page);
  const results = [];
  for (const value of ['1.25', '1,25']) {
    await page.getByLabel('Вес, кг', { exact: true }).fill(value);
    const sent = page.waitForRequest('**/api/quote');
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    const request = await sent;
    expect(request.postDataJSON()).toEqual({
      weightKg: 1.25, lengthCm: 10, widthCm: 10, heightCm: 10,
      originCity: 'moscow', destinationCity: 'saint-petersburg', deliveryType: 'standard', fragile: false,
    });
    await expect(page.getByTestId('total')).toHaveText('900 ₽');
    const response = await request.response();
    expect(response?.status()).toBe(200);
    results.push(await response!.json());
  }
  expect(results[0]).toEqual(results[1]);
});

test('UI-01: пустой город назначения не отправляет запрос', async ({ page }) => {
  await page.goto('/');
  await fillParcel(page);
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });
  await destination.selectOption('');
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/quote')) requests.push(request.url()); });
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(destination).toHaveAttribute('aria-invalid', 'true');
  await expect(destination).toHaveAccessibleDescription('Выберите город назначения из списка.');
  await expect(destination).toBeFocused();
  await expect(page.getByTestId('quote-result')).toBeHidden();
  expect(requests).toEqual([]);
});
