import { useQuery } from "@tanstack/react-query";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

export type AuthSession = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
};

function getFirebaseSession(): Promise<AuthSession | null> {
  if (!firebaseAuth) return Promise.resolve(null);
  const auth = firebaseAuth;

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(
        user
          ? {
              user: {
                id: user.uid,
                email: user.email,
                name: user.displayName,
                avatarUrl: user.photoURL,
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
  if (!firebaseAuth) throw new Error("Firebase is not configured");
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
