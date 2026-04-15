# WebHarvest

Monorepo with two apps:

| Folder     | Role                         |
|-----------|------------------------------|
| `server/` | Express API (`/api/scrape`, auth, jobs when MongoDB is enabled) |
| `client/` | Vite + React UI              |

## Quick start (full stack)

From the **repository root**:

```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

Copy env for the API:

```bash
cp server/.env.example server/.env
```

Edit `server/.env` as needed (`CORS_ORIGIN` should match the client URL, e.g. `http://localhost:3000`).

Then from the **repository root**:

```bash
npm run dev:server
```

In another terminal:

```bash
npm run dev:client
```

- API: `http://localhost:5000`
- UI: `http://localhost:3000` (proxies `/api` to the API)

Or run both installs separately:

- **Server only:** `cd server && npm install && npm run dev`
- **Client only:** `cd client && npm install && npm run dev`

## Root `npm` scripts

| Script            | Action                          |
|-------------------|---------------------------------|
| `npm run dev`     | Same as `dev:server`            |
| `npm run dev:server` | API with nodemon             |
| `npm run dev:client` | Vite dev server              |
| `npm start`       | Production API (`node index.js` in `server/`) |
| `npm run build`   | Build client to `client/dist/` |

## Deploying the server (e.g. cPanel)

Upload only the **`server/`** folder (it has its own `package.json`).

- **Application root:** `server` directory (where `package.json` is).
- **Startup file:** `index.js`
- **Environment:** `.env` next to `package.json` inside `server/`.

## API endpoints (when MongoDB is connected)

- `GET /health`
- `POST /api/scrape` — main scrape endpoint
- `POST /api/auth/*`, `GET /api/me`, `/api/jobs`, `/api/runs`, `/api/export` — require MongoDB
