import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

import logger from '../logger.js';

const log = logger.child({ module: 'commands' });
const here = dirname(fileURLToPath(import.meta.url));

/** Recursively collect every .js file under a directory except this loader. */
function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collect(full));
    } else if (entry.endsWith('.js') && full !== join(here, 'index.js')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Load every command module into the client's name and alias collections.
 * Returns the loaded modules so scripts/deploy-commands.js can reuse this.
 */
export async function loadCommands(client = null) {
  const modules = [];

  for (const file of collect(here)) {
    const imported = await import(pathToFileURL(file).href);
    const command = imported.default;

    if (!command?.name || typeof command.execute !== 'function') {
      log.warn({ file }, 'Skipping module: not a valid command');
      continue;
    }

    modules.push(command);
    if (client) {
      client.commands.set(command.name, command);
      for (const alias of command.aliases ?? []) {
        client.aliases.set(alias, command.name);
      }
    }
  }

  log.info({ count: modules.length }, 'Loaded commands');
  return modules;
}

/** Resolve a name or alias to a command module. */
export function resolveCommand(client, name) {
  const key = name.toLowerCase();
  return client.commands.get(key) ?? client.commands.get(client.aliases.get(key));
}

export default loadCommands;
