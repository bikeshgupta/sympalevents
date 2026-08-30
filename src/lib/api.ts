import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth, firebasePersistenceReady } from "@/lib/firebase";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  requireAuth?: boolean;
};

async function getCurrentUserToken() {
  if (!firebaseAuth) return undefined;
  const auth = firebaseAuth;
  await firebasePersistenceReady;

  const user =
    auth.currentUser ??
    (await new Promise<User | null>((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        unsubscribe();
        resolve(currentUser);
      });
    }));

  return user?.getIdToken();
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { body, requireAuth, ...init } = options;
  const token = await getCurrentUserToken();

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
