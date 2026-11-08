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
