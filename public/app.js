const form = document.querySelector('#quote-form');
const button = form.querySelector('button');
const formError = document.querySelector('#form-error');
const status = document.querySelector('#form-status');
const result = document.querySelector('#quote-result');
const emptyResult = document.querySelector('#empty-result');
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const moneyFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
let revision = 0;

const numericFields = {
  weightKg: { min: 0.1, max: 30, decimal: true, message: 'Укажите вес от 0,1 до 30 кг с точностью до 0,01 кг.' },
  lengthCm: { min: 1, max: 100, message: 'Укажите целую длину от 1 до 100 см.' },
  widthCm: { min: 1, max: 100, message: 'Укажите целую ширину от 1 до 100 см.' },
  heightCm: { min: 1, max: 100, message: 'Укажите целую высоту от 1 до 100 см.' },
  distanceKm: { min: 1, max: 3000, message: 'Укажите целое расстояние от 1 до 3000 км.' },
};

function clearErrors() {
  for (const element of form.querySelectorAll('[aria-invalid]')) element.removeAttribute('aria-invalid');
  for (const element of form.querySelectorAll('.field-error')) element.textContent = '';
  formError.hidden = true;
  formError.textContent = '';
  status.textContent = '';
}

function showErrors(errors) {
  for (const { field, message } of errors) {
    const errorElement = field && document.getElementById(`${field}-error`);
    if (errorElement) {
      errorElement.textContent = message;
      const inputs = form.elements.namedItem(field);
      if (inputs instanceof HTMLElement) inputs.setAttribute('aria-invalid', 'true');
    } else {
      formError.textContent = message;
      formError.hidden = false;
    }
  }
  status.textContent = 'Проверьте параметры. В форме есть ошибки.';
  form.querySelector('[aria-invalid="true"]')?.focus();
}

function hideResult() {
  result.hidden = true;
  emptyResult.hidden = false;
}

function formChanged() {
  revision++;
  hideResult();
  clearErrors();
}
form.addEventListener('input', formChanged);
form.addEventListener('change', formChanged);

function renderRows(id, rows) {
  const list = document.getElementById(id);
  list.replaceChildren();
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    list.append(row);
  }
}

function showResult(quote) {
  const rub = (value) => `${moneyFormat.format(value)} ₽`;
  const kg = (value) => `${numberFormat.format(value)} кг`;
  document.querySelector('#total').textContent = rub(quote.totalRub);
  renderRows('price-breakdown', [
    ['Базовый сбор', rub(quote.baseCostRub)],
    ['За вес', rub(quote.weightCostRub)],
    ['За расстояние', rub(quote.distanceCostRub)],
    ['Промежуточная сумма', rub(quote.subtotalRub)],
    [`Экспресс (×${numberFormat.format(quote.deliveryMultiplier)})`, rub(quote.expressSurchargeRub)],
    ['Хрупкий груз', rub(quote.fragileSurchargeRub)],
  ]);
  renderRows('weight-breakdown', [
    ['Фактический вес', kg(quote.actualWeightKg)],
    ['Объёмный вес', kg(quote.volumetricWeightKg)],
    ['Расчётный вес', kg(quote.chargeableWeightKg)],
    ['Оплачиваемый вес', kg(quote.billedWeightKg)],
    ['Блоки расстояния по 10 км', numberFormat.format(quote.distanceBlocks)],
  ]);
  emptyResult.hidden = true;
  result.hidden = false;
  status.textContent = `Расчёт готов. Стоимость ${rub(quote.totalRub)}.`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  clearErrors();
  hideResult();
  const payload = {};
  const errors = [];
  for (const [field, rule] of Object.entries(numericFields)) {
    const raw = form.elements.namedItem(field).value.trim();
    const pattern = rule.decimal ? /^\d+(?:[.,]\d+)?$/ : /^\d+$/;
    const value = Number(raw.replace(',', '.'));
    const validPrecision = !rule.decimal || Math.abs(value * 100 - Math.round(value * 100)) < 1e-8;
    if (!pattern.test(raw) || !Number.isFinite(value) || value < rule.min || value > rule.max || !validPrecision) {
      errors.push({ field, message: rule.message });
    } else {
      payload[field] = value;
    }
  }
  if (errors.length) {
    showErrors(errors);
    return;
  }
  payload.deliveryType = form.elements.namedItem('deliveryType').value;
  payload.fragile = form.elements.namedItem('fragile').checked;
  const submittedRevision = revision;
  button.disabled = true;
  form.setAttribute('aria-busy', 'true');
  status.textContent = 'Рассчитываем стоимость доставки.';
  try {
    const response = await fetch('/api/quote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (revision !== submittedRevision) return;
    if (response.ok) showResult(body);
    else showErrors(body.errors);
  } catch {
    if (revision === submittedRevision) {
      showErrors([{ field: null, message: 'Не удалось получить расчёт. Проверьте соединение и попробуйте ещё раз.' }]);
    }
  } finally {
    button.disabled = false;
    form.removeAttribute('aria-busy');
  }
});
