import { buildApp } from './app.ts';

const app = buildApp();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.close().catch(() => { process.exitCode = 1; });
  });
}

try {
  const address = await app.listen({
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 3000),
  });
  console.log(`ParcelQuote запущен: ${address}`);
} catch {
  console.error('Не удалось запустить сервер. Проверьте HOST, PORT и доступность порта.');
  process.exitCode = 1;
}
