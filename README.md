# TikTok-Style Live MVP

This repository is the starting point for a TikTok-style live MVP built with Django, Next.js, and LiveKit OSS.

## Product Scope

The MVP supports:

- User authentication
- Creator start and end live session
- Viewer join live session
- Live video playback
- Live comments
- Likes/hearts
- Follow creator
- Simple live feed
- Basic moderation and reporting

Out of scope for v1:

- Monetization
- Multi-host or battle streams
- Beauty filters and effects
- Replay editing
- Advanced recommendation systems
- Full trust and safety tooling

## Stack

- Backend: Django, Django REST Framework, Django Channels, PostgreSQL, Redis
- Frontend: Next.js
- Live media: LiveKit OSS
- Local infrastructure: Docker Compose

## Repository Layout

- `backend/`: Django project and domain apps
- `frontend/`: Next.js application
- `infra/`: local infrastructure and deployment assets
- `docs/`: architecture and implementation notes

## Immediate Build Order

1. Backend project setup with auth, users, and live session models
2. LiveKit token issuance and room lifecycle integration
3. Frontend auth flow and vertical live feed
4. Live room page with player, comments, likes, and follow action
5. Basic moderation and reporting

The backend bootstrap in `backend/` is now in place for steps 1 and 2.

## Next Step

Read [`docs/mvp-architecture.md`](docs/mvp-architecture.md) before starting implementation.
