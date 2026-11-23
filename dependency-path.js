import { homedir } from 'node:os';
import { join } from 'node:path';

export const dependencyDirectory = join(process.env.LOCALAPPDATA || homedir(), 'NexDeck', 'dependencies');
export const dependencyManifest = join(dependencyDirectory, 'package.json');

export const pwaRoot = join(dependencyDirectory, '..', 'pwa');
