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
  is_online: boolean;
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
  viewer_count_live: number;
  total_view_count: number;
  thumbnail: string | null;
  created_at: string;
  comment_count: number;
  heart_count: number;
  duration_seconds: number | null;
};

export type LiveTokenResponse = {
  token: string;
  livekit_url: string;
  room_name: string;
  role: "creator" | "viewer";
};

export type Comment = {
  id: number;
  session: number;
  user: User;
  body: string;
  parent_id: number | null;
  is_deleted: boolean;
  created_at: string;
};

export type DirectMessage = {
  id: number;
  sender: User;
  recipient: User;
  body: string;
  parent_id: number | null;
  attachment: string | null;
  attachment_url: string | null;
  attachment_name: string;
  attachment_content_type: string;
  attachment_size: number | null;
  created_at: string;
  is_read: boolean;
};

export type DMThread = {
  user: User;
  last_message: DirectMessage | null;
  unread_count: number;
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

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? deriveWebSocketBaseUrl(API_BASE_URL);

function deriveWebSocketBaseUrl(httpBaseUrl: string) {
  const url = new URL(httpBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

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

export async function getLiveFeed(status: string = "live") {
  const response = await fetch(`${API_BASE_URL}/api/live/feed?status=${status}`, {
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
  payload: FormData,
) {
  const response = await fetch(`${API_BASE_URL}/api/live/start`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
    body: payload,
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

export async function getLiveComments(token: string, sessionId: string | number) {
  const response = await fetch(`${API_BASE_URL}/api/live/${sessionId}/comments`, {
    headers: {
      Authorization: `Token ${token}`,
    },
    cache: "no-store",
  });

  return parseResponse<Comment[]>(response);
}

export async function postLiveComment(
  token: string,
  sessionId: string | number,
  body: string,
  parentId?: number | null,
) {
  const response = await fetch(`${API_BASE_URL}/api/live/${sessionId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ body, ...(parentId != null ? { parent_id: parentId } : {}) }),
  });

  return parseResponse<Comment>(response);
}

export async function postLiveReaction(
  token: string,
  sessionId: string | number,
  type: "heart" = "heart",
) {
  const response = await fetch(`${API_BASE_URL}/api/live/${sessionId}/reactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${token}`,
    },
    body: JSON.stringify({ type }),
  });

  return parseResponse<{ created: boolean; heart_count: number }>(response);
}

export function buildWebSocketUrl(path: string, token?: string | null) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${WS_BASE_URL}${normalizedPath}`);
  if (token) {
    url.searchParams.set("token", token);
  }
  return url.toString();
}

export async function getDMs(token: string, withUserId: number | string) {
  const response = await fetch(
    `${API_BASE_URL}/api/users/dms/?with_user_id=${withUserId}`,
    {
      headers: {
        Authorization: `Token ${token}`,
      },
      cache: "no-store",
    }
  );

  return parseResponse<DirectMessage[]>(response);
}

export async function postDM(
  token: string,
  recipientId: number | string,
  body: string,
  options?: { parentId?: number | null; attachment?: File | null },
) {
  const attachment = options?.attachment ?? null;
  const parentId = options?.parentId ?? null;
  const requestBody = attachment
    ? (() => {
        const formData = new FormData();
        formData.append("recipient_id", String(recipientId));
        formData.append("body", body);
        formData.append("attachment", attachment);
        if (parentId != null) {
          formData.append("parent_id", String(parentId));
        }
        return formData;
      })()
    : JSON.stringify({ recipient_id: recipientId, body, ...(parentId != null ? { parent_id: parentId } : {}) });

  const response = await fetch(`${API_BASE_URL}/api/users/dms/`, {
    method: "POST",
    headers: attachment
      ? {
          Authorization: `Token ${token}`,
        }
      : {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
    body: requestBody,
  });

  return parseResponse<DirectMessage>(response);
}

export async function getDMThreads(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/users/dms/threads/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
    cache: "no-store",
  });

  return parseResponse<DMThread[]>(response);
}

export async function getUsers(token: string, options?: { onlineOnly?: boolean }) {
  const query = options?.onlineOnly ? "?online_only=1" : "";
  const response = await fetch(`${API_BASE_URL}/api/users/${query}`, {
    headers: {
      Authorization: `Token ${token}`,
    },
    cache: "no-store",
  });

  return parseResponse<User[]>(response);
}

export function getMediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${cleanUrl}`;
}
