import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function fillParcel(page: Page) {
  await page.getByLabel('Вес, кг', { exact: true }).fill('2');
  await page.getByLabel('Длина, см', { exact: true }).fill('10');
  await page.getByLabel('Ширина, см', { exact: true }).fill('10');
  await page.getByLabel('Высота, см', { exact: true }).fill('10');
  await page.getByLabel('Расстояние, км', { exact: true }).fill('15');
}

test('реальный расчёт, дробный вес и сброс результата', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Обычная', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Хрупкий груз', { exact: true })).not.toBeChecked();
  await fillParcel(page);
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('220 ₽');
  await page.getByLabel('Экспресс', { exact: true }).check();
  await expect(page.getByTestId('quote-result')).toBeHidden();
  await page.getByLabel('Хрупкий груз', { exact: true }).check();
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('430 ₽');
  await page.getByLabel('Вес, кг', { exact: true }).fill('1,25');
  const request = page.waitForRequest('**/api/quote');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  expect((await request).postDataJSON().weightKg).toBe(1.25);
  await expect(page.getByTestId('quote-result')).toBeVisible();
  await page.getByLabel('Расстояние, км', { exact: true }).fill('20');
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
      { field: 'distanceKm', message: 'Расстояние должно быть целым числом от 1 до 3000 км.' },
    ] }) }));
  await page.getByLabel('Вес, кг', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.locator('#distanceKm-error')).toContainText('Расстояние');
  await expect(page.getByLabel('Расстояние, км', { exact: true })).toHaveValue('15');
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
  await page.getByLabel('Вес, кг', { exact: true }).fill('3');
  release();
  await expect(button).toBeEnabled();
  await expect(page.getByTestId('quote-result')).toBeHidden();
  await page.unroute('**/api/quote');
  await page.route('**/api/quote', (route) => route.abort());
  await button.click();
  await expect(page.getByRole('alert')).toContainText('соединение');
  await page.unroute('**/api/quote');
  await button.click();
  await expect(page.getByTestId('total')).toHaveText('270 ₽');
});

test('страница помещается на узком экране и не вызывает ошибок JavaScript', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await fillParcel(page);
  await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
  await expect(page.getByTestId('total')).toHaveText('220 ₽');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
