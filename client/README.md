# WebHarvest client

Vite + React UI for the WebHarvest API.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Dev server defaults to port **3000** and proxies `/api` to `http://localhost:5000` (start the API from `../server`).

## Build

```bash
npm run build
```

Output: `dist/` — deploy to static hosting and set `VITE_API_URL` to your API base URL if it is not same-origin.
