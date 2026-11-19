import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DbConnection } from '../src/module_bindings/index.ts';

const windowsCli = resolve(process.env.LOCALAPPDATA ?? resolve(homedir(), 'AppData', 'Local'), 'SpacetimeDB', 'bin', 'current', 'spacetimedb-cli.exe');
const cli = process.env.SPACETIME ?? (process.platform === 'win32' && existsSync(windowsCli) ? windowsCli : 'spacetime');
const cliPath = cli.includes('/') || cli.includes('\\')
  ? resolve(cli)
  : execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [cli], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
const standaloneCli = resolve(dirname(cliPath), process.platform === 'win32' ? 'spacetimedb-standalone.exe' : 'spacetimedb-standalone');
const requestedPort = process.env.GRAFFITI_TEST_PORT ? Number(process.env.GRAFFITI_TEST_PORT) : null;
let port;
let host;
const database = `graffiti-runtime-${randomUUID()}`;
const moduleDir = resolve(process.cwd(), 'server', 'spacetimedb');

function run(args, options = {}) {
  return execFileSync(cli, args, { encoding: 'utf8', ...options });
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, host), { method: 'POST', ...options });
  const text = await response.text();
  assert.ok(response.ok, `${options.method ?? 'GET'} ${path}: ${response.status} ${text}`);
  return text;
}

function startServer(dataDirectory) {
  const child = spawn(standaloneCli, ['start', '--in-memory', '--data-dir', resolve(dataDirectory, 'data'), '--jwt-key-dir', resolve(dataDirectory, 'keys'), '--listen-addr', `127.0.0.1:${port}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return { child, stderr: () => stderr };
}

function stopServer(child) {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  } else {
    child.kill();
  }
}

function connect(token) {
  return new Promise((resolveConnection, reject) => {
    let connection;
    connection = DbConnection.builder()
      .withUri(`ws://127.0.0.1:${port}`)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect(() => resolveConnection(connection))
      .onConnectError((_context, error) => reject(error))
      .build();
  });
}

function waitFor(predicate, message) {
  return new Promise((resolveWait, reject) => {
    const timeout = setTimeout(() => { clearInterval(interval); reject(new Error(`Timed out waiting for ${message}`)); }, 10000);
    const interval = setInterval(() => {
      if (!predicate()) return;
      clearTimeout(timeout);
      clearInterval(interval);
      resolveWait();
    }, 25);
  });
}

async function main() {
  assert.match(run(['--version']), /tool version 2\.15\.0\b/);
  port = requestedPort ?? await findFreePort();
  host = `http://127.0.0.1:${port}`;
  if (!existsSync(standaloneCli)) throw new Error(`SpacetimeDB standalone server not found at ${standaloneCli}; set SPACETIME to the CLI 2.15.0 executable`);
  const dataDirectory = mkdtempSync(resolve(tmpdir(), 'graffiti-runtime-server-'));
  const { child, stderr } = startServer(dataDirectory);
  let admin;
  let user;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`SpacetimeDB exited: ${stderr()}`);
      try { await request('/v1/ping', { method: 'GET' }); ready = true; break; }
      catch { await new Promise((resolveDelay) => setTimeout(resolveDelay, 500)); }
    }
    assert.ok(ready, `SpacetimeDB did not start: ${stderr()}`);

    const publisher = JSON.parse(await request('/v1/identity'));
    const wasmDir = resolve(moduleDir, 'target', 'runtime-smoke');
    execFileSync(process.env.CARGO ?? 'cargo', ['build', '--release', '--locked', '--target', 'wasm32-unknown-unknown', '--manifest-path', resolve(moduleDir, 'Cargo.toml'), '--target-dir', wasmDir], {
      stdio: 'inherit', env: { ...process.env, SITE_FEED_OWNER_IDENTITY: publisher.identity },
    });
    const wasm = readFileSync(resolve(wasmDir, 'wasm32-unknown-unknown', 'release', 'server.wasm'));
    const published = JSON.parse(await request(`/v1/database/${database}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${publisher.token}`, 'Content-Type': 'application/octet-stream' }, body: wasm,
    }));
    assert.equal(published.Success.op, 'created');

    admin = await connect(publisher.token);
    user = await connect();
    let adminReady = false;
    let userReady = false;
    admin.subscriptionBuilder().onApplied(() => { adminReady = true; }).subscribe(['SELECT * FROM connected_users', 'SELECT * FROM strokes']);
    user.subscriptionBuilder().onApplied(() => { userReady = true; }).subscribe(['SELECT * FROM connected_users', 'SELECT * FROM strokes']);
    await waitFor(() => adminReady && userReady, 'both initial subscriptions');
    await waitFor(() => Number(admin.db.connectedUsers.count()) === 2 && Number(user.db.connectedUsers.count()) === 2, 'two-client presence');

    await assert.rejects(user.reducers.addAdmin({ identity: user.identity, username: 'untrusted-bootstrap' }), /Only admins can add admins/i);
    await admin.reducers.addStroke({ points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: 255, brushSize: 3 });
    await waitFor(() => Number(admin.db.strokes.count()) === 1 && Number(user.db.strokes.count()) === 1, `stroke visible to both clients (${admin.db.strokes.count()}/${user.db.strokes.count()})`);
    await assert.rejects(user.reducers.clearCanvas(), /Only admins can clear the canvas/i);
    assert.equal(Number(admin.db.strokes.count()), 1, 'rejected clear preserves stroke');
    await admin.reducers.clearCanvas();
    await waitFor(() => Number(user.db.strokes.count()) === 0, 'admin clear visible to other client');

    user.disconnect();
    await waitFor(() => Number(admin.db.connectedUsers.count()) === 1, 'presence removal after disconnect');
    admin.disconnect();
    console.log('PASS: two-client stroke sync, join/leave presence, admin clear, non-admin rejection');
  } finally {
    user?.disconnect();
    admin?.disconnect();
    stopServer(child);
    rmSync(dataDirectory, { recursive: true, force: true });
  }
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port: freePort } = probe.address();
      probe.close((error) => error ? reject(error) : resolvePort(freePort));
    });
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
