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

export type Country = {
  id: number;
  name: string;
  slug: string;
  code: string;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  level: number;
  full_path: string;
};

export type Location = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  level: number;
  full_path: string;
  parent: number | null;
  country: number;
};

export type AttributeOption = {
  id: number;
  label: string;
  value: string;
  sort_order: number;
};

export type AttributeDefinition = {
  id: number;
  name: string;
  code: string;
  category: number;
  data_type: "text" | "number" | "boolean" | "select";
  is_required: boolean;
  is_filterable: boolean;
  help_text: string;
  sort_order: number;
  options: AttributeOption[];
};

export type ProductImage = {
  id: number;
  image: string;
  alt_text: string;
  sort_order: number;
  created_at: string;
};

export type ProductReview = {
  id: number;
  reviewer: User;
  rating: number;
  title: string;
  body: string;
  is_approved: boolean;
  created_at: string;
};

export type Product = {
  id: number;
  owner: User;
  category: Category;
  country: Country | null;
  location: Location | null;
  title: string;
  slug: string;
  description: string;
  price: string;
  currency: string;
  negotiable: boolean;
  discount_percent: number;
  condition: "new" | "used" | "refurbished";
  custom_fields: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  images: ProductImage[];
  reviews: ProductReview[];
  average_rating: number | null;
  review_count: number;
  effective_price: number;
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
  let data: unknown = null;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      const snippet = responseText.replace(/\s+/g, " ").trim().slice(0, 140);
      throw new Error(
        `Request failed with ${response.status} ${response.statusText}: ${snippet || "Non-JSON response."}`,
      );
    }
  }

  if (!response.ok) {
    const errorData = data as { detail?: string } | Record<string, unknown> | null;
    const detailValue =
      (errorData && "detail" in errorData ? errorData.detail : null) ||
      Object.values(errorData || {})
        .flat()
        .join(" ") ||
      "Request failed.";
    const detail = String(detailValue);
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

export async function getProductMeta(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/products/meta/`, {
    headers: {
      Authorization: `Token ${token}`,
    },
    cache: "no-store",
  });

  return parseResponse<{
    countries: Country[];
    categories: Category[];
    locations: Location[];
    attributes: AttributeDefinition[];
  }>(response);
}

export async function createProduct(
  token: string,
  payload: {
    category: number;
    country: number;
    location: number;
    title: string;
    description: string;
    price: string;
    currency: string;
    negotiable: boolean;
    discount_percent: number;
    condition: "new" | "used" | "refurbished";
    custom_fields: Record<string, unknown>;
    attribute_values: Array<{
      definition: number;
      option?: number | null;
      value_text?: string;
      value_number?: number;
      value_boolean?: boolean;
    }>;
    image_files: File[];
    image_urls: string[];
  },
) {
  const body = new FormData();
  body.append("category", String(payload.category));
  body.append("country", String(payload.country));
  body.append("location", String(payload.location));
  body.append("title", payload.title);
  body.append("description", payload.description);
  body.append("price", payload.price);
  body.append("currency", payload.currency);
  body.append("negotiable", String(payload.negotiable));
  body.append("discount_percent", String(payload.discount_percent));
  body.append("condition", payload.condition);
  body.append("custom_fields", JSON.stringify(payload.custom_fields));
  body.append("attribute_values", JSON.stringify(payload.attribute_values));
  for (const file of payload.image_files) {
    body.append("image_files", file);
  }
  for (const url of payload.image_urls) {
    body.append("image_urls", url);
  }

  const response = await fetch(`${API_BASE_URL}/api/products/create/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
    },
    body,
  });

  return parseResponse<{ message: string; product: Product }>(response);
}

export async function getProducts() {
  const response = await fetch(`${API_BASE_URL}/api/products/`, {
    cache: "no-store",
  });

  return parseResponse<Product[]>(response);
}

export function getMediaUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const cleanUrl = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${cleanUrl}`;
}
