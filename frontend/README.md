# Frontend

This Next.js app currently implements the auth layer for the live MVP:

- register
- login
- logout
- current-user session restore
- live feed
- creator go-live setup
- live room join and publish with LiveKit

## Setup

1. Copy `.env.local.example` to `.env.local`
2. Ensure the Django backend is running on the URL in `NEXT_PUBLIC_API_BASE_URL`
3. Install dependencies and start the dev server

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Current Routes

- `/`
- `/login`
- `/register`
- `/live/setup`
- `/live/[sessionId]`

## Next Frontend Work

- comments and reactions UI
- feed ranking and swipe UX
- viewer counts and presence
