import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { reportScenario } from './report.ts';

async function fillParcel(page: Page) {
  await test.step('Заполнить посылку: 2 кг, 10 × 10 × 10 см, Москва → Санкт-Петербург', async () => {
    await page.getByLabel('Вес, кг', { exact: true }).fill('2');
    await page.getByLabel('Длина, см', { exact: true }).fill('10');
    await page.getByLabel('Ширина, см', { exact: true }).fill('10');
    await page.getByLabel('Высота, см', { exact: true }).fill('10');
    await page.getByLabel('Город отправления', { exact: true }).selectOption('moscow');
    await page.getByLabel('Город назначения', { exact: true }).selectOption('saint-petersburg');
  });
}

test('реальный расчёт, дробный вес и сброс результата', async ({ page }) => {
  await reportScenario('Расчёт стоимости', 'Обычная и экспресс-доставка с доплатами');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  await test.step('Проверить начальное состояние: вес пустой, доставка обычная, хрупкость выключена', async () => {
    await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Обычная', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Хрупкий груз', { exact: true })).not.toBeChecked();
  });

  await fillParcel(page);

  await test.step('Рассчитать обычную доставку: 900 ₽, маршрут Москва → Санкт-Петербург, 700 км', async () => {
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByTestId('total')).toHaveText('900 ₽');
    await expect(page.getByTestId('quote-result')).toContainText('Москва → Санкт-Петербург');
    await expect(page.getByTestId('quote-result')).toContainText('700 км');
  });

  await test.step('Выбрать экспресс и хрупкий груз: прежняя цена скрыта, новый расчёт стоит 1 450 ₽', async () => {
    await page.getByLabel('Экспресс', { exact: true }).check();
    await expect(page.getByTestId('quote-result')).toBeHidden();
    await page.getByLabel('Хрупкий груз', { exact: true }).check();
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByTestId('total')).toHaveText('1 450 ₽');
  });

  await test.step('Ввести вес 1,25 кг: сервис получает число 1.25 и показывает результат', async () => {
    await page.getByLabel('Вес, кг', { exact: true }).fill('1,25');
    const request = page.waitForRequest('**/api/quote');
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    expect((await request).postDataJSON().weightKg).toBe(1.25);
    await expect(page.getByTestId('quote-result')).toBeVisible();
  });

  await test.step('Изменить город назначения: предыдущий результат скрывается', async () => {
    await page.getByLabel('Город назначения', { exact: true }).selectOption('kazan');
    await expect(page.getByTestId('quote-result')).toBeHidden();
  });
});

test('ошибки полей сохраняют данные и доступны с клавиатуры', async ({ page }) => {
  await reportScenario('Проверка данных посылки', 'Исправление ошибок без потери введённых данных');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  await test.step('Нажать Tab в поле веса: фокус переходит к длине', async () => {
    await page.getByLabel('Вес, кг', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Длина, см', { exact: true })).toBeFocused();
  });

  await fillParcel(page);
  let requests = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/quote')) requests++; });

  await test.step('Проверить пустой и ошибочный вес: поле отмечено, сообщение показано, запросов нет', async () => {
    for (const value of ['', '1,2,3', '1.00000000001']) {
      await page.getByLabel('Вес, кг', { exact: true }).fill(value);
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#weightKg-error')).not.toBeEmpty();
    }
    expect(requests).toBe(0);
  });

  await page.route('**/api/quote', (route) => route.fulfill({ status: 400,
    contentType: 'application/json', body: JSON.stringify({ errors: [
      { field: 'destinationCity', message: 'Выберите другой город назначения.' },
    ] }) }));

  await test.step('Получить ошибку города от сервиса: выделить поле и сохранить выбранный город', async () => {
    await page.getByLabel('Вес, кг', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByLabel('Город назначения', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Город назначения', { exact: true })).toHaveValue('saint-petersburg');
  });
});

test('поздний ответ скрывается, сетевой сбой позволяет повторить расчёт', async ({ page }) => {
  await reportScenario('Надёжность формы', 'Восстановление после сетевого сбоя');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

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

  await test.step('Изменить город во время расчёта: кнопка занята, поздний ответ не показывает устаревшую цену', async () => {
    await button.click();
    await sent;
    await expect(button).toBeDisabled();
    await page.getByLabel('Город назначения', { exact: true }).selectOption('kazan');
    release();
    await expect(button).toBeEnabled();
    await expect(page.getByTestId('quote-result')).toBeHidden();
  });

  await test.step('Прервать соединение: показать сообщение о сетевой ошибке', async () => {
    await page.unroute('**/api/quote');
    await page.route('**/api/quote', (route) => route.abort());
    await button.click();
    await expect(page.getByRole('alert')).toContainText('соединение');
  });

  await test.step('Восстановить соединение и повторить расчёт: доставка до Казани стоит 1 020 ₽', async () => {
    await page.unroute('**/api/quote');
    await button.click();
    await expect(page.getByTestId('total')).toHaveText('1 020 ₽');
  });
});

test('страница помещается на узком экране и не вызывает ошибок JavaScript', async ({ page }) => {
  await reportScenario('Доступность формы', 'Расчёт на узком экране');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  await fillParcel(page);

  await test.step('Рассчитать доставку на экране 390 × 844: цена 900 ₽, нет горизонтальной прокрутки и ошибок JavaScript', async () => {
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByTestId('total')).toHaveText('900 ₽');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('два списка с 10 городами запрещают пустой и внутригородской маршрут', async ({ page }) => {
  await reportScenario('Междугородние маршруты', 'Выбор разных городов отправления и назначения');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  const origin = page.getByRole('combobox', { name: 'Город отправления', exact: true });
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });

  await test.step('Проверить два пустых списка: в каждом 10 городов и приглашение выбрать город', async () => {
    await expect(origin).toHaveValue('');
    await expect(destination).toHaveValue('');
    await expect(origin.getByRole('option')).toHaveCount(11);
    await expect(destination.getByRole('option')).toHaveCount(11);
  });

  await fillParcel(page);
  let requests = 0;
  page.on('request', request => { if (request.url().endsWith('/api/quote')) requests++; });

  await test.step('Отклонить пустой город отправления и маршрут внутри Москвы без отправки запроса', async () => {
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
  });

  await test.step('Выбрать Казань вместо Москвы: разрешить расчёт и показать 1 020 ₽', async () => {
    await destination.selectOption('kazan');
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByTestId('total')).toHaveText('1 020 ₽');
  });
});

test('у городов нет обводки после мыши, но есть при навигации клавиатурой', async ({ page }) => {
  await reportScenario('Доступность формы', 'Видимый фокус при работе с клавиатурой');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  const origin = page.getByRole('combobox', { name: 'Город отправления', exact: true });
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });

  await test.step('Выбрать города мышью: после выбора обводка отсутствует', async () => {
    for (const [select, city] of [[origin, 'moscow'], [destination, 'kazan']] as const) {
      await select.click();
      await select.selectOption(city);
      await expect(select).toHaveCSS('outline-style', 'none');
      await page.keyboard.press('Escape');
    }
  });

  await test.step('Перейти между городами клавишами Tab, Shift+Tab и стрелками: фокус и обводка сохраняются', async () => {
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
});

test('изменение любого параметра скрывает предыдущую цену', async ({ page }) => {
  await reportScenario('Надёжность формы', 'Сброс устаревшей цены при изменении посылки');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

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
    await test.step(`Изменить ${name}: ранее рассчитанная цена должна скрыться`, async () => {
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

test('поздняя ошибка старого маршрута не влияет на новую форму', async ({ page }) => {
  await reportScenario('Надёжность формы', 'Игнорирование ответа для старых параметров');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

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

  await test.step('Изменить отправление до ответа сервиса: поздняя ошибка не появляется, выбранной остаётся Казань', async () => {
    await button.click();
    await sent;
    await page.getByLabel('Город отправления', { exact: true }).selectOption('kazan');
    release();
    await expect(button).toBeEnabled();
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(page.getByTestId('quote-result')).toBeHidden();
    await expect(page.getByLabel('Город отправления', { exact: true })).toHaveValue('kazan');
  });

  await test.step('Рассчитать новый маршрут Казань → Санкт-Петербург: показать 1 700 ₽', async () => {
    await page.unroute('**/api/quote');
    await button.click();
    await expect(page.getByTestId('total')).toHaveText('1 700 ₽');
    await expect(page.getByTestId('quote-result')).toContainText('Казань → Санкт-Петербург');
  });
});

test('ошибка 500 сохраняет данные и позволяет повторить расчёт', async ({ page }) => {
  await reportScenario('Надёжность формы', 'Повторный расчёт после ошибки сервиса');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  await fillParcel(page);
  await page.route('**/api/quote', route => route.fulfill({ status: 500,
    contentType: 'application/json', body: JSON.stringify({ errors: [
      { field: null, message: 'Не удалось выполнить расчёт. Попробуйте позже.' },
    ] }) }), { times: 1 });
  const button = page.getByRole('button', { name: 'Рассчитать стоимость' });

  await test.step('Получить ошибку сервиса: показать сообщение, сохранить вес и город, разрешить повтор', async () => {
    await button.click();
    await expect(page.getByRole('alert')).toContainText('Попробуйте позже');
    await expect(page.getByTestId('quote-result')).toBeHidden();
    await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('Город назначения', { exact: true })).toHaveValue('saint-petersburg');
    await expect(button).toBeEnabled();
  });

  await test.step('Повторить расчёт после ошибки: показать 900 ₽ и убрать сообщение', async () => {
    await button.click();
    await expect(page.getByTestId('total')).toHaveText('900 ₽');
    await expect(page.getByRole('alert')).toBeHidden();
  });
});

test('точка и запятая дают одинаковый расчёт и правильные параметры запроса', async ({ page }) => {
  await reportScenario('Проверка данных посылки', 'Ввод дробного веса через точку и запятую');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  await fillParcel(page);
  const results: unknown[] = [];
  for (const value of ['1.25', '1,25']) {
    await test.step(`Ввести вес «${value}» и получить 900 ₽ с одинаковыми параметрами запроса`, async () => {
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
    });
  }

  await test.step('Сравнить ответы: точка и запятая дают одинаковый результат', async () => {
    expect(results[0]).toEqual(results[1]);
  });
});

test('пустой город назначения не отправляет запрос', async ({ page }) => {
  await reportScenario('Междугородние маршруты', 'Обязательный выбор города назначения');

  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });

  await fillParcel(page);
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });
  await destination.selectOption('');
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/quote')) requests.push(request.url()); });

  await test.step('Рассчитать без города назначения: показать ошибку у поля, перевести фокус и не отправлять запрос', async () => {
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(destination).toHaveAttribute('aria-invalid', 'true');
    await expect(destination).toHaveAccessibleDescription('Выберите город назначения из списка.');
    await expect(destination).toBeFocused();
    await expect(page.getByTestId('quote-result')).toBeHidden();
    expect(requests).toEqual([]);
  });
});
