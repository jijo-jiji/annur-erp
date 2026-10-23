// Starts the API for the end-to-end tests on a database built from scratch every run.
// The data lives in the operating system's temp folder and is never the developer's database.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '../../../backend');
const dataDir = process.env.ANNUR_E2E_DATA || path.join(os.tmpdir(), 'annur-e2e');
const port = process.env.ANNUR_E2E_API_PORT || '8181';
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

const env = {
  ...process.env,
  ANNUR_ENV: 'development', // never production: the demo data below is refused there
  ANNUR_DATA_DIR: dataDir,
  ANNUR_LOGIN_RATE: '10000/min', // many logins in a minute are normal for a test run
};

const manage = (...args) => execFileSync(python, ['manage.py', ...args], { cwd: backend, env, stdio: 'inherit' });

rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
console.log(`[e2e] building a fresh database in ${dataDir}`);
manage('migrate', '--noinput', '-v', '0');
manage('seed_data');
manage('shell', '-c', `exec(open(r'${path.join(here, 'prepare.py')}', encoding='utf-8').read())`);

const server = spawn(python, ['manage.py', 'runserver', `127.0.0.1:${port}`, '--noreload'], { cwd: backend, env, stdio: 'inherit' });
const stop = () => { server.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
