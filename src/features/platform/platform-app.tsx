import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { PlatformSession } from "./platform-api";
import { platformSections, sectionPath } from "./platform-sections";
import { PlatformShell } from "./platform-shell";
import { PendingSection } from "./sections/pending-section";
import { SystemSection } from "./sections/system-section";

/**
 * The Platform Control Center, loaded only after the server has confirmed the platform owner (platform-gate.tsx).
 * A separate chunk, so nobody else ever downloads it.
 */
export function PlatformApp({ session }: { session: PlatformSession }) {
  const { search } = useLocation();
  return (
    <Routes>
      <Route element={<PlatformShell session={session} />}>
        <Route index element={<Navigate to={{ pathname: sectionPath("overview"), search }} replace />} />
        {platformSections.map((section) => (
          <Route
            key={section.key}
            path={section.key}
            element={section.key === "system" ? <SystemSection section={section} /> : <PendingSection section={section} />}
          />
        ))}
        <Route path="*" element={<UnknownSection />} />
      </Route>
    </Routes>
  );
}

function UnknownSection() {
  return (
    <div className="py-10">
      <h1 className="font-display text-3xl">There is no such section</h1>
      <p className="mt-2 text-muted-foreground">Pick one from the menu, or start from the overview.</p>
      <Link to={sectionPath("overview")} className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-primary">
        Go to the overview
      </Link>
    </div>
  );
}
