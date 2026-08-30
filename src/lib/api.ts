import { firebaseAuth } from "@/lib/firebase";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const token = await firebaseAuth?.currentUser?.getIdToken();

  if (!token) {
    throw new Error("You must be signed in");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed");
  }

  return data as T;
}
