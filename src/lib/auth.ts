import { useQuery } from "@tanstack/react-query";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { apiFetch } from "@/lib/api";
import { clearPersistedCache } from "@/lib/query-persist";
import { firebaseAuth, firebasePersistenceReady, missingFirebaseConfigKeys } from "@/lib/firebase";

export type EventRole = "admin" | "committee" | "read_only";

export type AuthSession = {
  user: {
    id: string;
    appUserId: string | null;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
};

async function getAppUser() {
  try {
    const data = await apiFetch<{
      user: {
        id: string;
        email: string;
        full_name: string | null;
        photo_url: string | null;
      };
    }>("/api/me");

    return data.user;
  } catch (error) {
    console.warn("Firebase login succeeded, but app user sync failed:", error);
    return null;
  }
}

function getFirebaseSession(): Promise<AuthSession | null> {
  if (!firebaseAuth) return Promise.resolve(null);
  const auth = firebaseAuth;

  return firebasePersistenceReady.then(
    () =>
      new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          unsubscribe();
          const appUser = user ? await getAppUser() : null;
          resolve(
            user
              ? {
                  user: {
                    id: user.uid,
                    appUserId: appUser?.id ?? null,
                    email: appUser?.email ?? user.email,
                    name: appUser?.full_name ?? user.displayName,
                    avatarUrl: appUser?.photo_url ?? user.photoURL,
                  },
                }
              : null,
          );
        });
      }),
  );
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: getFirebaseSession,
  });
}

export async function signInWithGoogle() {
  if (!firebaseAuth) {
    throw new Error(
      missingFirebaseConfigKeys.length
        ? `Firebase is not configured. Missing ${missingFirebaseConfigKeys.join(", ")}.`
        : "Firebase is not configured. Restart the dev server after changing .env.",
    );
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await firebasePersistenceReady;
  await signInWithPopup(firebaseAuth, provider);
}

export async function signOut() {
  // Nothing from this person stays on the device for the next one.
  clearPersistedCache();
  if (!firebaseAuth) return;
  await firebaseAuth.signOut();
  window.location.assign("/");
}
