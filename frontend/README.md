# Frontend

This Next.js app currently implements the auth layer for the live MVP:

- register
- login
- logout
- current-user session restore

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

## Next Frontend Work

- live feed page
- creator go-live flow
- LiveKit room join and playback
- comments and reactions UI
