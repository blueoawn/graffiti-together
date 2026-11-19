# Graffiti Together

Real-time collaborative drawing application

## Prerequisites

- [Node.js](https://nodejs.org/) (22.23.4 or newer in the 22.x line)
- [Rust toolchain](https://rustup.rs/)
- [SpacetimeDB CLI](https://spacetimedb.com/install)

## Server Setup

### 1. Install SpacetimeDB

```bash
curl -sSf https://install.spacetimedb.com | bash
```

### 2. Start the SpacetimeDB server

```bash
spacetime start
```

This starts SpacetimeDB on `localhost:3000` by default.

### 3. Publish the backend module

```bash
cd server/spacetimedb
spacetime publish graffiti-together
```

### 4. Install, generate bindings, and build

```bash
npm ci
npm run generate
npm run build
```

### 5. Serve the frontend

The production build outputs to `dist/`. Serve it with any static file server:

```bash
npm run preview
```

Or use a server like nginx, caddy, or:

```bash
npx serve dist
```

## Remote Deployment

Binding generation requires SpacetimeDB CLI 2.15.0. Rust dependencies are pinned in server/spacetimedb/Cargo.lock; build with cargo build --locked --manifest-path server/spacetimedb/Cargo.toml --target wasm32-unknown-unknown --release.

### Existing drawings and 2.x cutover

New databases provision the authenticated publishing identity as the first admin
in the initialization reducer. Browser clients cannot claim the first admin role.
Only an existing admin can grant another identity admin privileges through
`add_admin`; retain trusted admin identities when migrating an existing database.
An existing database with no admins fails closed and needs a separately reviewed
operator provisioning/migration plan; do not wipe data to recreate an admin.

Do not reset, republish with a data wipe, or delete the existing production database as part of this upgrade. Before changing production, take and verify an operator-managed backup of the existing 1.x database, retain its original database and service configuration, and test the 2.15 module against a separate disposable database. SpacetimeDB 1.x and 2.x compatibility is not assumed: an operator must choose and review an explicit export/import migration or a separately named 2.x database and planned cutover. Preserve the original database until the new deployment and any required drawing migration are verified and rollback is no longer needed. This change does not perform the cutover or touch production.

When deploying to a remote server, update the SpacetimeDB connection URI in `canvas.ts` from `ws://localhost:3000` to your server's address (e.g. `ws://your-server-ip:3000`).

### Quick start (all-in-one)

```bash
# Clone and enter the project
git clone <repo-url>
cd graffiti-together

# Start SpacetimeDB
spacetime start &

# Publish the backend module
cd server/spacetimedb
spacetime publish graffiti-together
cd ../..

# Install, generate bindings, build, and serve the frontend
npm ci
npm run generate
npm run build
npx serve dist -l 8080
```

The app will be available at `http://your-server-ip:8080`.

## Development

```bash
npm run dev
```

Starts the Vite dev server with hot reload (default `http://localhost:5173`).

### Disposable live-behavior smoke test

With Node 22.23.4 (the supported site-feed baseline), Rust/Cargo, the
`wasm32-unknown-unknown` target, generated bindings, and SpacetimeDB CLI 2.15.0
available, run:

```bash
npm run test:runtime
```

The test starts an in-memory server bound only to `127.0.0.1`, publishes the
module to a uniquely named disposable database, and uses two real SDK clients to
check stroke synchronization, presence on join/leave, admin clear, and useful
non-admin rejection. It stops the server even if an assertion fails. Set
`SPACETIME` or `GRAFFITI_TEST_PORT` to override the CLI or local port. It does
not connect to, publish to, or reset any configured or production database.
