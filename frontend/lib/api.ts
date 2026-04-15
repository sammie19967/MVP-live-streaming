export type Profile = {
  display_name: string;
  avatar_url: string;
  bio: string;
};

export type User = {
  id: number;
  username: string;
  email: string;
  is_creator: boolean;
  created_at: string;
  profile: Profile;
  follower_count: number;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type LiveSession = {
  id: number;
  creator: User;
  title: string;
  status: "scheduled" | "live" | "ended";
  livekit_room_name: string;
  started_at: string | null;
  ended_at: string | null;
  viewer_count_cached: number;
  thumbnail_url: string;
  created_at: string;
};

export type LiveTokenResponse = {
  token: string;
  livekit_url: string;
  room_name: string;
  role: "creator" | "viewer";
};

export type RegisterPayload = {
  username: string;
  email: string;
  password: string;
  is_creator: boolean;
};

export type LoginPayload = {
  username: string;
  password: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function parseResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  const data = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    const detail =
      data?.detail ||
      Object.values(data || {})
        .flat()
        .join(" ") ||
      "Request failed.";
    throw new Error(detail);
  }

  return data as T;
}

export async function registerUser(payload: RegisterPayload) {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<AuthResponse>(response);
}

export async function loginUser(payload: LoginPayload) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<AuthResponse>(response);
}

export async function logoutUser(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    await parseResponse(response);
  }
}

export async function getCurrentUser(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Token ${token}`,
    },
    cache: "no-store",
  });

  return parseResponse<User>(response);
}

export async function getLiveFeed() {
  const response = await fetch(`${API_BASE_URL}/api/live/feed`, {
    cache: "no-store",
  });

  return parseResponse<LiveSession[]>(response);
}

export async function getLiveSession(sessionId: string | number) {
  const response = await fetch(`${API_BASE_URL}/api/live/${sessionId}`, {
    cache: "no-store",
  });

  return parseResponse<LiveSession>(response);
}

export async function startLiveSession(
  token: string,
  payload: { title: string; thumbnail_url?: string },
) {
  const response = await fetch(`${API_BASE_URL}/api/live/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<LiveSession>(response);
}

export async function endLiveSession(token: string, sessionId: string | number) {
  const response = await fetch(`${API_BASE_URL}/api/live/${sessionId}/end`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
  });

  return parseResponse<LiveSession>(response);
}

export async function getLiveToken(
  token: string,
  sessionId: string | number,
  role: "creator" | "viewer",
) {
  const response = await fetch(`${API_BASE_URL}/api/live/${sessionId}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ role }),
  });

  return parseResponse<LiveTokenResponse>(response);
}
