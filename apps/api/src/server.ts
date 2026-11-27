import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = buildApp({
  dbPath: config.dbPath,
  webDist: config.webDist,
  apiToken: config.apiToken,
  mediaDir: config.mediaDir,
  ffmpegPath: config.ffmpegPath,
  corsOrigins: config.corsOrigins,
  corsAllowPrivateNetwork: config.corsAllowPrivateNetwork,
  vapid: config.vapid,
  logger: true,
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 10_000);
  deadline.unref();
  try {
    await app.close();
  } catch (error) {
    app.log.error(error, 'Не удалось остановить сервер');
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

try {
  await app.listen({ port: config.port, host: config.host });
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
