import { createClient } from "@supabase/supabase-js";

function readEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = readEnvValue(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const supabaseAnonKey = readEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

if (import.meta.env.DEV && import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Remove VITE_SUPABASE_SERVICE_ROLE_KEY from .env. Use SUPABASE_SERVICE_ROLE_KEY for server-only access.");
}
