import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

function readEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

const firebaseConfig = {
  apiKey: readEnvValue(import.meta.env.VITE_FIREBASE_API_KEY as string | undefined),
  authDomain: readEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined),
  projectId: readEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined),
  storageBucket: readEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined),
  messagingSenderId: readEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined),
  appId: readEnvValue(import.meta.env.VITE_FIREBASE_APP_ID as string | undefined),
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

export const firebaseApp = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

export const firebasePersistenceReady = firebaseAuth
  ? setPersistence(firebaseAuth, browserLocalPersistence).catch((error) => {
      console.warn("Unable to enable Firebase local persistence:", error);
    })
  : Promise.resolve();

export const missingFirebaseConfigKeys = [
  ["VITE_FIREBASE_API_KEY", firebaseConfig.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", firebaseConfig.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", firebaseConfig.projectId],
  ["VITE_FIREBASE_APP_ID", firebaseConfig.appId],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (import.meta.env.DEV) {
  const exposedSecrets = ["VITE_FIREBASE_PRIVATE_KEY", "VITE_FIREBASE_CLIENT_EMAIL"].filter(
    (name) => import.meta.env[name],
  );

  if (exposedSecrets.length) {
    console.warn(`Remove server-only Firebase values from VITE_ env vars: ${exposedSecrets.join(", ")}`);
  }
}
