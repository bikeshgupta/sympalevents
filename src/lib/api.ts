import { firebaseAuth } from "@/lib/firebase";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  requireAuth?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { body, requireAuth, ...init } = options;
  const token = await firebaseAuth?.currentUser?.getIdToken();

  if (requireAuth !== false && !token) {
    throw new Error("You must be signed in");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => {
    throw new Error("API returned an invalid response. Run npm run dev:full for local API routes.");
  });

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data as T;
}
