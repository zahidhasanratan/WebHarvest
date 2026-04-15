# WebHarvest API

Express + MongoDB (optional) scraping backend.

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` (see `.env.example` for variables).

## Run

```bash
npm run dev    # nodemon
npm start      # production: node index.js
```

## cPanel / Node.js

- **Application root:** this folder (must contain `package.json`).
- **Application startup file:** `index.js` (sits next to `package.json`)
- **Environment file:** `.env` in this same folder.
