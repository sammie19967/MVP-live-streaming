# Backend

This Django backend now includes:

- Custom `User` model with profile creation
- Token-based auth endpoints
- Follow endpoint
- `LiveSession` model and feed endpoints
- LiveKit token issuance for creator and viewer roles

## Current Apps

- `users`
- `live`

## Environment

Copy `.env.example` to `.env` and adjust values as needed.

## Local Commands

```bash
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
python manage.py test
```

## Current API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/users/{user_id}/follow`
- `GET /api/live/feed`
- `GET /api/live/{session_id}`
- `POST /api/live/start`
- `POST /api/live/{session_id}/end`
- `POST /api/live/{session_id}/token`

## Next Backend Work

- Comments, reactions, and reporting
- WebSocket events with Django Channels
- Feed ranking beyond simple active sessions
