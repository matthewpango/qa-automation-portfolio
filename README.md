# ParcelQuote

[![Tests](https://github.com/matthewpango/qa-automation-portfolio/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/matthewpango/qa-automation-portfolio/actions/workflows/tests.yml)

Учебный проект для моего портфолио **QA Automation Engineer**.
На примере небольшого сервиса демонстрирую тест-дизайн, автоматизацию API и UI,
контейнерное окружение и отчётность.

Приложение рассчитывает стоимость доставки между десятью городами России.
Есть JSON API и веб-форма на русском. База данных не требуется;
тарифы и расстояния вымышленные.

## Стек

TypeScript · Playwright · Node.js / Fastify · Docker Compose · Allure · GitHub Actions.

## Что реализовано

- Тестовая стратегия и матрица покрытия требований и рисков.
- API-тесты: расчёты, маршруты, контракты, границы и неверные данные.
- UI-тесты: форма, разбивка цены, ошибки, повторный расчёт и устаревшие ответы.
- Запуск всех проверок в Docker, ESLint и проверка типов.
- Allure с фичами, историями, шагами на русском, screenshots и traces при отказе.

| Проверки | Количество |
|---|---:|
| API, Playwright | 172 |
| UI, Playwright / Chromium | 27 |
| Unit и внутренние интеграционные, node:test | 8 |
| **Всего** | **207** |

[GitHub Actions](https://github.com/matthewpango/qa-automation-portfolio/actions/workflows/tests.yml) запускает проверки в Docker
и сохраняет отчёты. [Первый полный запуск](https://github.com/matthewpango/qa-automation-portfolio/actions/runs/42540835392) прошёл успешно.

## Запуск

Нужен Docker с Linux-контейнерами и Docker Compose.

```sh
docker compose up --build -d --wait
```

Приложение: http://127.0.0.1:3000.

## Автотесты

```sh
docker compose --profile test run --build --rm tests
```

Команда запускает lint, проверку типов и все тесты внутри контейнера.
После прогона открыть Allure:

```sh
docker compose --profile test run --rm --no-deps -p 127.0.0.1:8080:8080 tests npm run allure:open
```

Отчёт: http://127.0.0.1:8080. В Allure представлены 199 API/UI-тестов;
остальные 8 проверок доступны в логах.

## Документация

- [Тестовая стратегия](docs/qa-strategy.md) и [матрица покрытия](docs/qa-coverage-matrix.md).
- [Правила продукта и API](docs/product-contract.md).
- [Подробный запуск, отдельные наборы тестов и отчёты](docs/development.md).
- [Правила изменений](CONTRIBUTING.md) и [публикация на GitHub](docs/github-publication.md).
