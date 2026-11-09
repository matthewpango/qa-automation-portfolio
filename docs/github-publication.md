# Репозиторий и GitHub Actions

Репозиторий: [matthewpango/qa-automation-portfolio](https://github.com/matthewpango/qa-automation-portfolio).
Исходники отправлены в `main`; локальная `main` отслеживает `origin/main`.
Репозиторий публичный. Лицензия пока не выбрана.

[Первый полный прогон CI](https://github.com/matthewpango/qa-automation-portfolio/actions/runs/42540835392) завершился успешно.
Проверены все шаги job `tests`, скачан и изучен артефакт
`test-evidence-42540835392-1`: логи, Playwright HTML и Allure с 199 успешными API/UI.
Ещё 6 unit и 2 внутренних интеграционных проверки прошли в логах.

## Работа с изменениями

Создавайте отдельную ветку и pull request в `main`. Например:

```sh
git switch -c feat/my-change
docker compose --profile test run --build --rm tests
```

Правила изменений описаны в [CONTRIBUTING](../CONTRIBUTING.md).
Push рабочей ветки проверяет lint, типы, unit и внутренние интеграционные;
PR и push в `main` дополнительно выполняют все API/UI. Событие `workflow_dispatch`
также запускает полный набор. Зависимости и отчёты в Git не добавляются.

## Как проверять CI и отчёты

1. На вкладке [Actions](https://github.com/matthewpango/qa-automation-portfolio/actions) откройте workflow `Tests` для нужного SHA.
2. Скачайте `test-evidence` и проверьте логи, Playwright HTML и Allure.
   Для просмотра Allure поместите каталог `allure/` из архива в локальный checkout
   и используйте команду из [руководства запуска](development.md).
3. При изменении workflow повторяйте контрольный отказ в отдельном PR:
   проверьте красный статус, блокировку слияния, Allure, screenshot и trace.
   Исправьте ожидание в том же PR и проверьте зелёный статус и разрешённое слияние.
   Контрольный PR закройте без слияния.
4. Сравнивайте историю Allure в артефактах полных прогонов одной Git-ссылки.
   Восстановление истории уже подтверждено между запусками main 42540835392 и 42610787489.

## Подтверждённая защита main

- Изменения только через PR; обязательный check `tests` от приложения GitHub Actions (15368).
- Ветка должна быть актуальна относительно `main` (strict).
- Правила применяются к администратору; force push и удаление `main` запрещены.
- Обязательное число одобряющих reviewers: 0, проект можно вести самостоятельно.

Проверка: [контрольный PR №1](https://github.com/matthewpango/qa-automation-portfolio/pull/1): [красный прогон](https://github.com/matthewpango/qa-automation-portfolio/actions/runs/42612670890) и [зелёный прогон](https://github.com/matthewpango/qa-automation-portfolio/actions/runs/42613004946).
Красный прогон: 198 API/UI успешны, один намеренный UI-отказ; слияние `blocked`
при отсутствии конфликтов. Скачаны Allure, screenshot и trace, cleanup успешен.
После восстановления ожидания: 199 API/UI успешны, слияние `clean`.
В обоих прогонах также прошли 6 unit и 2 внутренних интеграционных проверки.
PR закрыт без слияния, временная ветка удалена, контрольной ошибки в `main` нет.

Публикация исходников и CI не развёртывают приложение. Хостинг и CD остаются
отдельным решением. Для повторного использования кода осталось выбрать лицензию.
