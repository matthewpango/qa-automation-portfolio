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

async function openForm(page: Page) {
  await test.step('Открыть форму расчёта доставки', async () => {
    await page.goto('/');
  });
}

test('Новая форма: поля пустые, обычная доставка, хрупкость выключена, доступны десять городов', async ({ page }) => {
  await reportScenario('Расчёт стоимости', 'Начальное состояние формы');
  await openForm(page);

  await test.step('Проверить начальные значения и по десять городов в каждом списке', async () => {
    await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Обычная', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Хрупкий груз', { exact: true })).not.toBeChecked();
    const origin = page.getByRole('combobox', { name: 'Город отправления', exact: true });
    const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });
    await expect(origin).toHaveValue('');
    await expect(destination).toHaveValue('');
    await expect(origin.getByRole('option')).toHaveCount(11);
    await expect(destination.getByRole('option')).toHaveCount(11);
  });
});

for (const scenario of [
  {
    name: 'Обычная доставка: 900 ₽ и полная разбивка цены и фактического веса',
    weight: '2', length: '10', width: '10', height: '10', delivery: 'Обычная', fragile: false,
    multiplier: '1', total: '900 ₽',
    values: ['100 ₽', '100 ₽', '700 ₽', '900 ₽', '0 ₽', '0 ₽', '2 кг', '0,2 кг', '2 кг', '2 кг', '70'],
  },
  {
    name: 'Экспресс с хрупким грузом: 1 450 ₽ и разбивка объёмного веса без потери точности',
    weight: '0,1', length: '41', width: '61', height: '2', delivery: 'Экспресс', fragile: true,
    multiplier: '1,5', total: '1 450 ₽',
    values: ['100 ₽', '100 ₽', '700 ₽', '900 ₽', '450 ₽', '100 ₽', '0,1 кг', '1,0004 кг', '1,0004 кг', '2 кг', '70'],
  },
]) {
  test(scenario.name, async ({ page }) => {
    await reportScenario('Расчёт стоимости', 'Разбивка стоимости и оплачиваемого веса');
    await openForm(page);
    await fillParcel(page);

    await test.step(`Указать вес ${scenario.weight} кг, размеры ${scenario.length} × ${scenario.width} × ${scenario.height} см и выбранные доплаты`, async () => {
      await page.getByLabel('Вес, кг', { exact: true }).fill(scenario.weight);
      await page.getByLabel('Длина, см', { exact: true }).fill(scenario.length);
      await page.getByLabel('Ширина, см', { exact: true }).fill(scenario.width);
      await page.getByLabel('Высота, см', { exact: true }).fill(scenario.height);
      await page.getByLabel(scenario.delivery, { exact: true }).check();
      await page.getByLabel('Хрупкий груз', { exact: true }).setChecked(scenario.fragile);
    });

    await test.step(`Рассчитать доставку Москва → Санкт-Петербург: показать ${scenario.total} и 700 км`, async () => {
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      await expect(page.getByTestId('total')).toHaveText(scenario.total);
      await expect(page.getByTestId('quote-result')).toContainText('Москва → Санкт-Петербург');
      await expect(page.getByTestId('quote-result')).toContainText('700 км');
    });

    await test.step('Проверить каждую видимую строку разбивки: сбор, вес, расстояние, доплаты и округление веса', async () => {
      const result = page.getByTestId('quote-result');
      await expect(result.getByRole('term')).toHaveText([
        'Базовый сбор', 'За вес', 'За расстояние', 'Промежуточная сумма',
        `Экспресс (×${scenario.multiplier})`, 'Хрупкий груз',
        'Фактический вес', 'Объёмный вес', 'Расчётный вес', 'Оплачиваемый вес',
        'Блоки расстояния по 10 км',
      ]);
      await expect(result.getByRole('definition')).toHaveText(scenario.values);
    });
  });
}

test('Клавиша Tab переводит фокус с веса на длину', async ({ page }) => {
  await reportScenario('Доступность формы', 'Навигация по полям с клавиатурой');
  await openForm(page);

  await test.step('Нажать Tab в поле веса: фокус должен перейти к длине', async () => {
    await page.getByLabel('Вес, кг', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Длина, см', { exact: true })).toBeFocused();
  });
});

for (const value of ['', '1,2,3', '1.00000000001']) {
  test(`Неверный вес «${value}»: доступное сообщение об ошибке без отправки запроса`, async ({ page }) => {
    await reportScenario('Проверка данных посылки', 'Ошибки веса до отправки запроса');
    await openForm(page);
    await fillParcel(page);
    const requests: string[] = [];
    page.on('request', request => { if (request.url().endsWith('/api/quote')) requests.push(request.url()); });

    await test.step(`Ввести вес «${value}» и рассчитать: показать связанную с полем ошибку`, async () => {
      const weight = page.getByLabel('Вес, кг', { exact: true });
      await weight.fill(value);
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      await expect(weight).toHaveAttribute('aria-invalid', 'true');
      await expect(weight).toHaveAccessibleDescription(/Укажите вес от 0,1 до 30 кг с точностью до 0,01 кг\.$/);
      await expect(weight).toBeFocused();
      await expect(page.getByTestId('quote-result')).toBeHidden();
      expect(requests).toEqual([]);
    });
  });
}

test('Ошибка города от сервиса сохраняет выбранные значения формы', async ({ page }) => {
  await reportScenario('Проверка данных посылки', 'Исправление ошибок без потери введённых данных');
  await openForm(page);
  await fillParcel(page);
  await page.route('**/api/quote', route => route.fulfill({ status: 400,
    contentType: 'application/json', body: JSON.stringify({ errors: [
      { field: 'destinationCity', message: 'Выберите другой город назначения.' },
    ] }) }));

  await test.step('Получить ошибку города: сохранить данные, выделить поле и показать доступное описание', async () => {
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    const destination = page.getByLabel('Город назначения', { exact: true });
    await expect(destination).toHaveAttribute('aria-invalid', 'true');
    await expect(destination).toHaveAccessibleDescription('Выберите другой город назначения.');
    await expect(destination).toHaveValue('saint-petersburg');
    await expect(page.getByLabel('Вес, кг', { exact: true })).toHaveValue('2');
  });
});

test('Поздний успешный ответ не показывает цену для старого маршрута', async ({ page }) => {
  await reportScenario('Надёжность формы', 'Игнорирование ответа для старых параметров');

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

});

test('Сетевой сбой позволяет повторить расчёт после восстановления соединения', async ({ page }) => {
  await reportScenario('Надёжность формы', 'Восстановление после сетевого сбоя');
  await openForm(page);
  await fillParcel(page);
  const button = page.getByRole('button', { name: 'Рассчитать стоимость' });

  await test.step('Выбрать Казань и прервать соединение: показать сообщение о сетевой ошибке', async () => {
    await page.getByLabel('Город назначения', { exact: true }).selectOption('kazan');
    await page.route('**/api/quote', route => route.abort());
    await button.click();
    await expect(page.getByRole('alert')).toContainText('соединение');
    await expect(page.getByTestId('quote-result')).toBeHidden();
  });

  await test.step('Восстановить соединение и повторить расчёт: показать 1 020 ₽ и убрать сообщение', async () => {
    await page.unroute('**/api/quote');
    await button.click();
    await expect(page.getByTestId('total')).toHaveText('1 020 ₽');
    await expect(page.getByRole('alert')).toBeHidden();
  });
});

test('Внутригородской маршрут отклоняется, после выбора другого города расчёт доступен', async ({ page }) => {
  await reportScenario('Междугородние маршруты', 'Выбор разных городов отправления и назначения');
  await openForm(page);
  await fillParcel(page);
  const destination = page.getByRole('combobox', { name: 'Город назначения', exact: true });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/quote')) requests.push(request.url()); });

  await test.step('Выбрать Москву в обоих городах: показать ошибку без отправки запроса', async () => {
    await destination.selectOption('moscow');
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(destination).toHaveAttribute('aria-invalid', 'true');
    await expect(destination).toHaveAccessibleDescription('Выберите другой город назначения.');
    await expect(page.getByTestId('quote-result')).toBeHidden();
    expect(requests).toEqual([]);
  });

  await test.step('Выбрать Казань вместо Москвы: разрешить расчёт и показать 1 020 ₽', async () => {
    await destination.selectOption('kazan');
    await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
    await expect(page.getByTestId('total')).toHaveText('1 020 ₽');
  });
});

for (const [label, message] of [
  ['Город отправления', 'Выберите город отправления из списка.'],
  ['Город назначения', 'Выберите город назначения из списка.'],
] as const) {
  test(`Пустое поле «${label}»: ошибка без отправки запроса`, async ({ page }) => {
    await reportScenario('Междугородние маршруты', 'Обязательный выбор обоих городов');
    await openForm(page);
    await fillParcel(page);
    const field = page.getByRole('combobox', { name: label, exact: true });
    const requests: string[] = [];
    page.on('request', request => { if (request.url().endsWith('/api/quote')) requests.push(request.url()); });

    await test.step(`Оставить поле «${label}» пустым и рассчитать: ошибка должна быть связана с полем`, async () => {
      await field.selectOption('');
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(field).toHaveAccessibleDescription(message);
      await expect(field).toBeFocused();
      await expect(page.getByTestId('quote-result')).toBeHidden();
      expect(requests).toEqual([]);
    });
  });
}

for (const [name, change] of [
  ['вес', (page: Page) => page.getByLabel('Вес, кг', { exact: true }).fill('3')],
  ['длину', (page: Page) => page.getByLabel('Длина, см', { exact: true }).fill('20')],
  ['ширину', (page: Page) => page.getByLabel('Ширина, см', { exact: true }).fill('20')],
  ['высоту', (page: Page) => page.getByLabel('Высота, см', { exact: true }).fill('20')],
  ['город отправления', (page: Page) => page.getByLabel('Город отправления', { exact: true }).selectOption('kazan')],
  ['город назначения', (page: Page) => page.getByLabel('Город назначения', { exact: true }).selectOption('kazan')],
  ['тип доставки', (page: Page) => page.getByLabel('Экспресс', { exact: true }).check()],
  ['хрупкость', (page: Page) => page.getByLabel('Хрупкий груз', { exact: true }).check()],
] as const) {
  test(`Изменить ${name}: предыдущая цена скрывается`, async ({ page }) => {
    await reportScenario('Надёжность формы', 'Сброс устаревшей цены при изменении посылки');
    await openForm(page);
    await fillParcel(page);

    await test.step('Рассчитать исходную посылку и получить 900 ₽', async () => {
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      await expect(page.getByTestId('total')).toHaveText('900 ₽');
    });

    await test.step(`Изменить ${name}: ранее рассчитанная цена должна скрыться`, async () => {
      await change(page);
      await expect(page.getByTestId('quote-result')).toBeHidden();
    });
  });
}

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

for (const [value, format] of [['1.25', 'через точку'], ['1,25', 'через запятую']] as const) {
  test(`Дробный вес ${format}: отправить число 1.25, сохранить хрупкость false и показать 900 ₽`, async ({ page }) => {
    await reportScenario('Проверка данных посылки', 'Ввод дробного веса через точку и запятую');
    await openForm(page);
    await fillParcel(page);

    await test.step(`Ввести вес «${value}»: проверить точные параметры и успешный ответ сервиса`, async () => {
      await page.getByLabel('Вес, кг', { exact: true }).fill(value);
      const sent = page.waitForRequest('**/api/quote');
      await page.getByRole('button', { name: 'Рассчитать стоимость' }).click();
      const request = await sent;
      expect(request.postDataJSON()).toEqual({
        weightKg: 1.25, lengthCm: 10, widthCm: 10, heightCm: 10,
        originCity: 'moscow', destinationCity: 'saint-petersburg', deliveryType: 'standard', fragile: false,
      });
      const response = await request.response();
      expect(response?.status()).toBe(200);
      expect(await response!.json()).toMatchObject({ actualWeightKg: 1.25, billedWeightKg: 2, totalRub: 900 });
      await expect(page.getByTestId('total')).toHaveText('900 ₽');
    });
  });
}
