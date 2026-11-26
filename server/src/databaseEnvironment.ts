import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const serverRoot = fileURLToPath(new URL('../', import.meta.url));
export type DataMode = 'demo' | 'personal';

export function configureDatabase(env: NodeJS.ProcessEnv = process.env, root = serverRoot): DataMode {
  const mode = env.AI_LIFE_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'personal') {
    throw new Error('AI_LIFE_MODE must be demo or personal');
  }
  if (env.DATABASE_URL === undefined) {
    const directory = path.join(root, 'data');
    mkdirSync(directory, { recursive: true });
    env.DATABASE_URL = `file:${path.join(directory, `${mode}.sqlite`)}`;
  }
  return mode;
}
