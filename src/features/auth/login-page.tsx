import { LogIn } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signInWithGoogle } from "@/lib/auth";

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setIsSigningIn(true);

    try {
      await signInWithGoogle();
    } catch (item) {
      const message = item instanceof Error ? item.message : "Google sign-in failed";
      setError(message);
      setIsSigningIn(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to SymPal Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use Google login to access restricted event pages and member-only controls.
          </p>
          <Button className="w-full" onClick={() => void handleGoogleSignIn()} disabled={isSigningIn}>
            <LogIn className="h-4 w-4" />
            {isSigningIn ? "Opening Google..." : "Continue with Google"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
