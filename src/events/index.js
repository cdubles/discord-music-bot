import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import logger from '../logger.js';

const log = logger.child({ module: 'events' });
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Each event module exports { name, once?, execute(client, ...args) }.
 */
export async function loadEvents(client) {
  const files = readdirSync(here).filter(
    (file) => file.endsWith('.js') && file !== 'index.js',
  );

  for (const file of files) {
    const { default: handler } = await import(pathToFileURL(join(here, file)).href);
    if (!handler?.name || typeof handler.execute !== 'function') {
      log.warn({ file }, 'Skipping module: not a valid event handler');
      continue;
    }

    const bound = (...args) =>
      Promise.resolve(handler.execute(client, ...args)).catch((error) =>
        log.error({ err: error, event: handler.name }, 'Event handler failed'),
      );

    if (handler.once) client.once(handler.name, bound);
    else client.on(handler.name, bound);
  }

  log.info({ count: files.length }, 'Loaded event handlers');
}

export default loadEvents;
