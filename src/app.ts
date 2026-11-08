import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import { calculateQuote } from './quote.ts';
import type { QuoteInput } from './quote.ts';

const fieldMessages: Record<string, string> = {
  weightKg: 'Вес должен быть от 0,1 до 30 кг с точностью до 0,01 кг.',
  lengthCm: 'Длина должна быть целым числом от 1 до 100 см.',
  widthCm: 'Ширина должна быть целым числом от 1 до 100 см.',
  heightCm: 'Высота должна быть целым числом от 1 до 100 см.',
  distanceKm: 'Расстояние должно быть целым числом от 1 до 3000 км.',
  deliveryType: 'Выберите обычную или экспресс-доставку.',
  fragile: 'Признак хрупкости должен быть логическим значением.',
};

export function buildApp(): FastifyInstance {
  const app = Fastify({
    ajv: { customOptions: {
      coerceTypes: false, removeAdditional: false, allErrors: true, multipleOfPrecision: 8,
    } },
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

  app.post<{ Body: QuoteInput }>('/api/quote', {
    onRequest: async (request, reply) => {
      const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (contentType !== 'application/json') {
        return reply.code(415).send({ errors: [{ field: null,
          message: 'Используйте Content-Type: application/json.' }] });
      }
    },
    schema: { body: {
      type: 'object', additionalProperties: false,
      required: Object.keys(fieldMessages),
      properties: {
        weightKg: { type: 'number', minimum: 0.1, maximum: 30, multipleOf: 0.01 },
        lengthCm: { type: 'integer', minimum: 1, maximum: 100 },
        widthCm: { type: 'integer', minimum: 1, maximum: 100 },
        heightCm: { type: 'integer', minimum: 1, maximum: 100 },
        distanceKm: { type: 'integer', minimum: 1, maximum: 3000 },
        deliveryType: { type: 'string', enum: ['standard', 'express'] },
        fragile: { type: 'boolean' },
      },
    } },
  }, async (request) => calculateQuote(request.body));

  return app;
}
