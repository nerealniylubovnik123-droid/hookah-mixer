# Hookah Mixer App (Telegram Mini App)
Simple Node.js + Express backend for a Telegram Mini App hookah mix builder.

## Endpoints
- GET /api/library — Get brands and flavors
- POST /api/library — Update library (admin only)
- GET /api/mixes — Get saved mixes
- POST /api/mixes — Save new mix
- POST /api/mixes/:id/like — Like / Unlike a mix

## Run locally
```
npm install
cp .env.example .env
npm start
```

## Deploy on Railway
Add environment variable ADMIN_TOKEN and attach a volume for /data
