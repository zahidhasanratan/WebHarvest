# WebHarvest (MERN) – Auth Backend (Step 2)

This repo is scaffolded with an Express + MongoDB API and JWT auth to support multi-tenant scraping jobs.

## Setup

1. Copy env file:
   - `cp .env.example .env` (or create `.env` manually on Windows)
2. Set `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
3. Install dependencies:
   - `npm install`
4. Run:
   - `npm run dev`

API runs at `http://localhost:5000`.

## Endpoints

- `GET /health`
- `POST /api/auth/register` `{ email, password, name? }`
- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/refresh` (uses `refresh_token` httpOnly cookie)
- `POST /api/auth/logout`
- `GET /api/me` (requires `Authorization: Bearer <accessToken>`)

