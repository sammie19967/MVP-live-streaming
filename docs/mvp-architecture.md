# MVP Architecture

## Goal

Ship a usable 1-to-many live product quickly. The first release should prove:

- Creators can go live with minimal friction
- Viewers can discover and join quickly
- Live interaction feels immediate enough to retain usage

## Core User Flows

### Creator goes live

1. Creator signs in
2. Creator taps `Go Live`
3. Backend creates a `LiveSession`
4. Backend issues a LiveKit access token for a room
5. Creator publishes camera and microphone into the room
6. Session becomes discoverable in the live feed

### Viewer joins live

1. Viewer opens the live feed
2. Frontend requests active sessions from the backend
3. Viewer taps a stream
4. Backend issues a viewer token for the room
5. Frontend joins the room and subscribes to media
6. Comments and reactions update in real time

### Creator ends live

1. Creator taps `End Live`
2. Frontend notifies backend
3. Backend marks the session as ended
4. Frontend removes the stream from active feed positions

## Responsibilities

### Django

- Authentication and user accounts
- Creator profile and follower graph
- Live session lifecycle
- Feed API for active sessions
- Comment persistence
- Likes and reaction counters
- Reporting and moderation actions
- LiveKit room metadata and token issuance
- App-level realtime events over WebSockets

### Next.js

- Auth UI
- Vertical live feed
- Creator live setup page
- Live room page
- Comments and reactions UI
- Follow and report actions

### LiveKit OSS

- Room-based realtime audio and video transport
- Publisher and subscriber connectivity
- Media session permissions via signed access tokens

## Proposed Monolith-First Structure

This MVP should start as a single Django backend and a single Next.js frontend. Do not split services early.

## Backend Domains

### `users`

- `User`
- `Profile`
- Creator metadata

### `social`

- `Follow`
- lightweight social graph queries

### `live`

- `LiveSession`
- room state
- stream status
- viewer snapshots if needed later

### `engagement`

- `Comment`
- `Reaction`

### `moderation`

- `Report`
- comment deletion
- user mute or ban state

## Initial Data Model

### `User`

- `id`
- `username`
- `email`
- `password_hash`
- `is_creator`
- `created_at`

### `Profile`

- `user_id`
- `display_name`
- `avatar_url`
- `bio`

### `Follow`

- `follower_id`
- `following_id`
- `created_at`

### `LiveSession`

- `id`
- `creator_id`
- `title`
- `status` (`scheduled`, `live`, `ended`)
- `livekit_room_name`
- `started_at`
- `ended_at`
- `viewer_count_cached`
- `thumbnail_url`

### `Comment`

- `id`
- `session_id`
- `user_id`
- `body`
- `is_deleted`
- `created_at`

### `Reaction`

- `id`
- `session_id`
- `user_id`
- `type`
- `created_at`

### `Report`

- `id`
- `reporter_id`
- `session_id`
- `target_user_id`
- `reason`
- `created_at`

## Initial API Surface

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### Feed

- `GET /api/live/feed`
- `GET /api/live/{session_id}`

### Live lifecycle

- `POST /api/live/start`
- `POST /api/live/{session_id}/end`
- `POST /api/live/{session_id}/token`

### Engagement

- `GET /api/live/{session_id}/comments`
- `POST /api/live/{session_id}/comments`
- `POST /api/live/{session_id}/reactions`
- `POST /api/users/{user_id}/follow`

### Moderation

- `POST /api/live/{session_id}/report`
- `DELETE /api/comments/{comment_id}`
- `POST /api/live/{session_id}/mute-user`

## Realtime Plan

Use two realtime channels:

- `LiveKit`: audio and video transport
- `Django Channels`: comments, likes, viewer presence snapshots, and moderation events

This keeps product events in our application domain instead of forcing everything through the media layer.

## Feed Strategy For MVP

Do not build recommendations yet. Feed ordering should be:

1. Followed creators who are currently live
2. Other active sessions ordered by recent engagement
3. Fallback to newest live sessions

## Frontend Pages

### `/`

- Vertical live feed
- Swipe or scroll between active streams

### `/live/setup`

- Creator pre-live screen
- Title entry
- Start live action

### `/live/[sessionId]`

- Live player
- Creator info
- Follow button
- Comments panel
- Likes/hearts
- Report action

### `/profile/[username]`

- Profile header
- Follow action
- Active live badge if the creator is live

## Local Development Infrastructure

Use Docker Compose for:

- PostgreSQL
- Redis
- LiveKit OSS

Run Django and Next.js as app services after the base infra is stable.

## Build Sequence

### Phase 1

- Bootstrap Django and Next.js
- Add Docker Compose for PostgreSQL, Redis, and LiveKit
- Create auth and user models

### Phase 2

- Implement live session models and APIs
- Integrate LiveKit token generation
- Build creator go-live and viewer join flow

### Phase 3

- Add comments, likes, follows, and reporting
- Add WebSocket updates for comments and reactions

### Phase 4

- Polish feed ranking
- Add moderation guardrails
- Add basic observability and error handling

## Engineering Constraints

- Keep backend as a single deployable Django app for now
- Keep schemas simple and denormalized where it helps feed reads
- Avoid premature microservices
- Avoid building custom media infrastructure around SFU internals

## Risks

- LiveKit OSS is free software but still requires operational setup
- Web broadcasting quality varies across browsers and devices
- Viewer counts and presence can drift if not periodically reconciled
- Realtime comments can become noisy without moderation controls

## Success Metrics

- Time to first live
- Join latency
- Session start success rate
- Average watch time
- Comment rate per active viewer
- Creator return rate
