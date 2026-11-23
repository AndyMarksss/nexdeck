import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { dependencyDirectory, dependencyManifest } from './dependency-path.js';

mkdirSync(dependencyDirectory, { recursive: true });
copyFileSync(new URL('./package.json', import.meta.url), dependencyManifest);
const lock = new URL('./package-lock.json', import.meta.url);
const hasLock = existsSync(lock);
if (hasLock) copyFileSync(lock, join(dependencyDirectory, 'package-lock.json'));
const args = [hasLock ? 'ci' : 'install', '--ignore-scripts', '--no-fund'];
const windows = process.platform === 'win32';
const result = spawnSync(
  windows ? 'cmd.exe' : 'npm',
  windows ? ['/d', '/c', 'npm.cmd', ...args] : args,
  { cwd: dependencyDirectory, stdio: 'inherit' },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
