function hasValue(name: string) {
  return Boolean(process.env[name]?.trim());
}

function sendJson(res: any, status: number, body: unknown) {
  res.setHeader?.("Cache-Control", "no-store");
  res.status(status).json(body);
}

export default function handler(req: any, res: any) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    env: {
      supabaseUrl: hasValue("SUPABASE_URL") || hasValue("VITE_SUPABASE_URL"),
      supabaseServiceRoleKey: hasValue("SUPABASE_SERVICE_ROLE_KEY"),
      firebaseProjectId: hasValue("FIREBASE_PROJECT_ID") || hasValue("VITE_FIREBASE_PROJECT_ID"),
      firebaseAdminClientEmail: hasValue("FIREBASE_CLIENT_EMAIL"),
      firebaseAdminPrivateKey: hasValue("FIREBASE_PRIVATE_KEY"),
      firebaseAdminServiceAccountJson: hasValue("FIREBASE_SERVICE_ACCOUNT_JSON"),
    },
  });
}
