import { createGameServer } from './app.js';

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}
const { gameServer } = createGameServer();
await gameServer.listen(port, '0.0.0.0');
console.log(`Mutiny server listening on port ${port}`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void gameServer.gracefullyShutdown(false).catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
