# Graffiti Together

Real-time collaborative drawing application

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
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

### 4. Install frontend dependencies and build

```bash
npm install
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

# Build and serve the frontend
npm install
npm run build
npx serve dist -l 8080
```

The app will be available at `http://your-server-ip:8080`.

## Development

```bash
npm run dev
```

Starts the Vite dev server with hot reload (default `http://localhost:5173`).
