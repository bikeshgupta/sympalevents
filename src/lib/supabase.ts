/*
 * The browser no longer talks to Supabase: every read and write goes through
 * /api (the money pages were the last, see "The money pages stopped writing
 * direct" in CLAUDE.md). What is left is the one fact the screens still ask -
 * whether this build was configured with a project at all, which decides demo
 * mode. The client itself used to be created here too, unused, and it was the
 * largest library in the bundle every visitor downloaded.
 */
function readEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

const supabaseUrl = readEnvValue(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const supabaseAnonKey = readEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (import.meta.env.DEV && import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Remove VITE_SUPABASE_SERVICE_ROLE_KEY from .env. Use SUPABASE_SERVICE_ROLE_KEY for server-only access.");
}
