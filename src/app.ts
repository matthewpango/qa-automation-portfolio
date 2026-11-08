import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import type { FastifyError, FastifyInstance } from 'fastify';
import { calculateQuote } from './quote.ts';
import type { QuoteInput } from './quote.ts';
import tariffs from './tariffs.json' with { type: 'json' };
import { cities, getRoute } from './routes.ts';

type QuoteRequest = Omit<QuoteInput, 'distanceKm'> & { originCity: string; destinationCity: string };

const fieldMessages: Record<string, string> = {
  weightKg: 'Вес должен быть от 0,1 до 30 кг с точностью до 0,01 кг.',
  lengthCm: 'Длина должна быть целым числом от 1 до 100 см.',
  widthCm: 'Ширина должна быть целым числом от 1 до 100 см.',
  heightCm: 'Высота должна быть целым числом от 1 до 100 см.',
  originCity: 'Выберите город отправления из списка.',
  destinationCity: 'Выберите город назначения из списка.',
  deliveryType: 'Выберите обычную или экспресс-доставку.',
  fragile: 'Признак хрупкости должен быть логическим значением.',
};

export function buildApp(): FastifyInstance {
  const bodyLimit = 1024 * 1024;
  const app = Fastify({
    bodyLimit,
    ajv: {
      customOptions: { coerceTypes: false, removeAdditional: false, allErrors: true },
      plugins: [(ajv) => {
        ajv.addFormat('hundredths', {
          type: 'number', validate: (value: number) => value === Math.round(value * 100) / 100,
        });
        return ajv;
      }],
    },
  });

  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error.validation) {
      const errors = error.validation.map((issue) => {
        const field = String(issue.params.missingProperty ?? issue.params.additionalProperty ??
          issue.instancePath?.slice(1) ?? '') || null;
        const message = issue.keyword === 'additionalProperties' ? 'Неизвестное поле.' :
          issue.keyword === 'required' ? 'Обязательное поле.' :
          (field && fieldMessages[field]) || 'Тело запроса должно быть JSON-объектом.';
        return { field, message };
      });
      return reply.code(400).send({ errors });
    }
    const status = error.statusCode === 400 ? 400 : error.statusCode === 415 ? 415 :
      error.statusCode === 413 ? 413 : 500;
    const messages = {
      400: 'Некорректный JSON в теле запроса.',
      413: 'Тело запроса слишком большое.',
      415: 'Используйте Content-Type: application/json.',
      500: 'Не удалось выполнить расчёт. Попробуйте позже.',
    };
    return reply.code(status).send({ errors: [{ field: null, message: messages[status] }] });
  });

  app.post<{ Body: QuoteRequest }>('/api/quote', {
    onRequest: async (request, reply) => {
      const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return reply.code(415).send({ errors: [{ field: null,
          message: 'Используйте Content-Type: application/json.' }] });
      }
      // Отказываем до парсера, чтобы клиент получил 413 при продолжающейся загрузке.
      if (Number(request.headers['content-length']) > bodyLimit) {
        return reply.code(413).send({ errors: [{ field: null, message: 'Тело запроса слишком большое.' }] });
      }
    },
    schema: { body: {
      type: 'object', additionalProperties: false,
      required: Object.keys(fieldMessages),
      properties: {
        weightKg: { type: 'number', minimum: 0.1, maximum: 30, format: 'hundredths' },
        lengthCm: { type: 'integer', minimum: 1, maximum: 100 },
        widthCm: { type: 'integer', minimum: 1, maximum: 100 },
        heightCm: { type: 'integer', minimum: 1, maximum: 100 },
        originCity: { type: 'string', enum: cities.map(city => city.id) },
        destinationCity: { type: 'string', enum: cities.map(city => city.id) },
        deliveryType: { type: 'string', enum: ['standard', 'express'] },
        fragile: { type: 'boolean' },
      },
    } },
  }, async (request, reply) => {
    const route = getRoute(request.body.originCity, request.body.destinationCity);
    if (!route) {
      return reply.code(400).send({ errors: [{ field: 'destinationCity',
        message: 'Выберите другой город назначения.' }] });
    }
    return { ...calculateQuote({ ...request.body, distanceKm: route.distanceKm }), ...route };
  });

  const templateValues: Record<string, string> = {
    ...Object.fromEntries(Object.entries(tariffs).map(([key, value]) =>
      [key, new Intl.NumberFormat('ru-RU').format(value)])),
    cityOptions: cities.map(city => `<option value="${city.id}">${city.name}</option>`).join(''),
  };

  for (const [route, file, contentType] of [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
    ['/app.js', 'app.js', 'application/javascript; charset=utf-8'],
  ]) {
    app.get(route, async (_request, reply) => {
      const content = await readFile(new URL(`../public/${file}`, import.meta.url));
      const body = file === 'index.html' ? content.toString().replace(/\{\{(\w+)\}\}/g,
        (_match, key: string) => templateValues[key]) : content;
      return reply.type(contentType).send(body);
    });
  }

  return app;
}
