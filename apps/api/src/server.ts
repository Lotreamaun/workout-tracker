import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = buildApp({
  dbPath: config.dbPath,
  corsOrigins: config.corsOrigins,
  corsAllowPrivateNetwork: config.corsAllowPrivateNetwork,
  logger: true,
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
