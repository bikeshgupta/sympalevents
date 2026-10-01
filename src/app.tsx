import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { RouteGuard } from "@/components/layout/route-guard";
import { AccessDeniedPage } from "@/features/auth/access-denied-page";
import { LoginPage } from "@/features/auth/login-page";
import { AuctionsPage } from "@/features/auctions/auctions-page";
import { BudgetPage } from "@/features/budget/budget-page";
import { ClosingPage } from "@/features/closing/closing-page";
import { ContributionsPage } from "@/features/contributions/contributions-page";
import { CustomiseDashboardPage } from "@/features/dashboard/customise-dashboard";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { EventPlanPage } from "@/features/event-plan/event-plan-page";
import { ExpensesPage } from "@/features/expenses/expenses-page";
import { FixturesPage } from "@/features/fixtures/fixtures-page";
import { CreateEventWizard } from "@/features/onboarding/create-event-wizard";
import { ShareLinkPage } from "@/features/onboarding/share-link";
import { SocietyHomePage } from "@/features/society/society-home-page";
import { SocietyRoot } from "@/features/society/society-root";
import { PrasadPage } from "@/features/prasad/prasad-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { PlaceholderPage } from "@/features/shared/placeholder-page";
import { SponsorsPage } from "@/features/sponsors/sponsors-page";
import { TasksPage } from "@/features/tasks/tasks-page";
import { TeamsPage } from "@/features/teams/teams-page";

/**
 * Every page of an event, defined once and mounted twice.
 *
 * `/e/<eventId>/budget` is the real address: it survives a refresh, it can be
 * bookmarked, and it can be shared with somebody who has never opened the app.
 * The flat `/budget` form is kept because bookmarks and the stored selection
 * still use it, and because a person with one event should not have to look
 * at an id. Both render the same tree; which event they are about comes from
 * the path when there is one, and from the switcher otherwise.
 */
function eventRoutes(indexElement = <Navigate to="dashboard" replace />) {
  return (
    <Route element={<RouteGuard />}>
      <Route index element={indexElement} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="customise-dashboard" element={<CustomiseDashboardPage />} />
      <Route path="contributions" element={<ContributionsPage />} />
      <Route path="sponsors" element={<SponsorsPage />} />
      <Route path="budget" element={<BudgetPage />} />
      <Route path="tasks" element={<TasksPage />} />
      <Route path="expenses" element={<ExpensesPage />} />
      <Route path="auctions" element={<AuctionsPage />} />
      <Route path="closing" element={<ClosingPage />} />
      <Route path="prasad" element={<PrasadPage />} />
      <Route path="volunteers" element={<PlaceholderPage title="Volunteers" />} />
      <Route path="events" element={<Navigate to="../event-plan" replace />} />
      <Route path="event-plan" element={<EventPlanPage />} />
      <Route path="teams" element={<TeamsPage />} />
      <Route path="fixtures" element={<FixturesPage />} />
      <Route path="contacts" element={<PlaceholderPage title="Contacts" />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      {/* Outside AppLayout: no event is selected yet, so the sidebar and the
          route guard have nothing to be about. */}
      <Route path="/new-event" element={<CreateEventWizard />} />
      {/* The permanent link. Resolves a token and hands over to the path form. */}
      <Route path="/s/:token" element={<ShareLinkPage />} />

      {/* A society's events - the front door. Outside AppLayout: this page is
          about choosing an event, so the event sidebar has nothing to be
          about yet. `/society` with no slug resolves to the viewer's own. */}
      <Route path="/society" element={<SocietyHomePage />} />
      <Route path="/society/:societySlug" element={<SocietyHomePage />} />

      <Route path="/e/:eventId" element={<AppLayout />}>
        {eventRoutes()}
      </Route>

      {/* The flat mount. Its index is the one difference from the path form:
          `/e/<id>/` means "this event, show me its dashboard", while a bare
          `/` has no event in hand yet and resolves to the society instead. */}
      <Route element={<AppLayout />}>{eventRoutes(<SocietyRoot />)}</Route>
    </Routes>
  );
}
