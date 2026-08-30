import { useQuery } from "@tanstack/react-query";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { apiFetch } from "@/lib/api";
import { firebaseAuth, missingFirebaseConfigKeys } from "@/lib/firebase";

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

async function getAppUser(user: User) {
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

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      const appUser = user ? await getAppUser(user) : null;
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
  });
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
  await signInWithPopup(firebaseAuth, provider);
  window.location.assign("/");
}

export async function signOut() {
  if (!firebaseAuth) return;
  await firebaseAuth.signOut();
  window.location.assign("/");
}
