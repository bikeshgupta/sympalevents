import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/event-loading";
import { useSession } from "@/lib/auth";
import { useSocietyActions } from "@/lib/societies";

/**
 * `/join/<code>`: join a society with the eight-character code its admin hands out (the existing
 * `?resource=join`, which adds a resident membership and nothing else).
 *
 * A code can be typed by anybody, but a membership belongs to an account, so a signed-out visitor is asked
 * to sign in first and brought straight back here; signed in, it joins at once and opens the society.
 */
export function JoinSocietyPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading } = useSession();
  const { join } = useSocietyActions();
  const [problem, setProblem] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!session || started.current) return;
    started.current = true;
    join
      .mutateAsync(code.toUpperCase())
      .then(({ society }) => navigate(society.slug ? `/society/${society.slug}` : "/society", { replace: true }))
      .catch((error: unknown) => setProblem(error instanceof Error ? error.message : "Could not join. Try again."));
  }, [session, code, join, navigate]);

  if (isLoading) return <PageSkeleton />;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <h1 className="font-display text-3xl font-semibold">Join your society</h1>
      {!session ? (
        <>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Sign in to join with the code <span className="font-semibold tracking-[0.15em] text-foreground">{code.toUpperCase()}</span>. You'll
            come straight back here. It's free.
          </p>
          <Button asChild className="mt-6">
            <Link to="/login" state={{ from: `/join/${code}` }}>
              Sign in to join
            </Link>
          </Button>
        </>
      ) : problem ? (
        <>
          <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{problem}</p>
          <Link to="/" className="mt-4 text-sm font-medium text-primary underline-offset-2 hover:underline">
            Back to home
          </Link>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-muted-foreground" role="status">
          Joining…
        </p>
      )}
    </main>
  );
}
