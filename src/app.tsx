import { EventIndex } from "@/features/command/event-index";
import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PageSkeleton } from "@/components/shared/event-loading";
import { PageTurnOutlet } from "@/components/shared/page-turn";
import { AppLayout } from "@/components/layout/app-layout";
import { RouteGuard } from "@/components/layout/route-guard";
import { AccessDeniedPage } from "@/features/auth/access-denied-page";
import { LoginPage } from "@/features/auth/login-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ShareLinkPage } from "@/features/onboarding/share-link";
import { SocietyHomePage } from "@/features/society/society-home-page";
import { SocietyRoot } from "@/features/society/society-root";
import { PlaceholderPage } from "@/features/shared/placeholder-page";
import { PlatformGate } from "@/features/platform/platform-gate";


/*
 * Pages other than the two front doors (the dashboard and the society home)
 * load on demand. Every route used to be imported up front, so opening the
 * dashboard on a phone also downloaded and parsed Settings, the closing page,
 * registrations and the rest before anything could draw. Once the first page is
 * up they are fetched quietly in the background (see `warmPages`), so moving to
 * one is still immediate.
 */
const pageLoaders: Array<() => Promise<unknown>> = [];
function lazyPage<M>(load: () => Promise<M>, pick: (module: M) => ComponentType) {
  pageLoaders.push(load);
  return lazy(() => load().then((module) => ({ default: pick(module) })));
}

const CommandCentrePage = lazyPage(() => import("@/features/command/command-centre-page"), (m) => m.CommandCentrePage);
const CommunicationsPage = lazyPage(() => import("@/features/communications/communications-page"), (m) => m.CommunicationsPage);
const GatePage = lazyPage(() => import("@/features/gate/gate-page"), (m) => m.GatePage);
const UpdatesPage = lazyPage(() => import("@/features/updates/updates-page"), (m) => m.UpdatesPage);
const PassPage = lazyPage(() => import("@/features/registration/pass-page"), (m) => m.PassPage);
const RegistrationPage = lazyPage(() => import("@/features/registration/registration-page"), (m) => m.RegistrationPage);
const AuctionsPage = lazyPage(() => import("@/features/auctions/auctions-page"), (m) => m.AuctionsPage);
const BudgetPage = lazyPage(() => import("@/features/budget/budget-page"), (m) => m.BudgetPage);
const ClosingPage = lazyPage(() => import("@/features/closing/closing-page"), (m) => m.ClosingPage);
const ContributionsPage = lazyPage(() => import("@/features/contributions/contributions-page"), (m) => m.ContributionsPage);
const CustomiseDashboardPage = lazyPage(() => import("@/features/dashboard/customise-dashboard"), (m) => m.CustomiseDashboardPage);
const EventPlanPage = lazyPage(() => import("@/features/event-plan/event-plan-page"), (m) => m.EventPlanPage);
const ExpensesPage = lazyPage(() => import("@/features/expenses/expenses-page"), (m) => m.ExpensesPage);
const FixturesPage = lazyPage(() => import("@/features/fixtures/fixtures-page"), (m) => m.FixturesPage);
const CreateEventWizard = lazyPage(() => import("@/features/onboarding/create-event-wizard"), (m) => m.CreateEventWizard);
const SocietyAdminPage = lazyPage(() => import("@/features/society/admin/society-admin-page"), (m) => m.SocietyAdminPage);
const PrasadPage = lazyPage(() => import("@/features/prasad/prasad-page"), (m) => m.PrasadPage);
const ProfilePage = lazyPage(() => import("@/features/profile/profile-page"), (m) => m.ProfilePage);
const VolunteersPage = lazyPage(() => import("@/features/volunteers/volunteers-page"), (m) => m.VolunteersPage);
const SettingsPage = lazyPage(() => import("@/features/settings/settings-page"), (m) => m.SettingsPage);
const SponsorsPage = lazyPage(() => import("@/features/sponsors/sponsors-page"), (m) => m.SponsorsPage);
const TasksPage = lazyPage(() => import("@/features/tasks/tasks-page"), (m) => m.TasksPage);
const TeamsPage = lazyPage(() => import("@/features/teams/teams-page"), (m) => m.TeamsPage);

let warmed = false;
/** Fetch every on-demand page while the browser is idle, once. */
function warmPages() {
  if (warmed || typeof window === "undefined") return;
  warmed = true;
  const run = () => pageLoaders.forEach((load) => void load().catch(() => undefined));
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
  if (idle) idle(run);
  else window.setTimeout(run, 2000);
}

/** A page that may still be loading draws the page skeleton meanwhile, like any other wait in an event. */
function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

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
function eventRoutes(indexElement = <EventIndex />) {
  return (
    <Route element={<RouteGuard />}>
      <Route index element={indexElement} />
      <Route path="command" element={<Page><CommandCentrePage /></Page>} />
      <Route path="communications" element={<Page><CommunicationsPage /></Page>} />
      <Route path="registration" element={<Page><RegistrationPage /></Page>} />
      <Route path="pass" element={<Page><PassPage /></Page>} />
      <Route path="updates" element={<Page><UpdatesPage /></Page>} />
      <Route path="gate" element={<Page><GatePage /></Page>} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="customise-dashboard" element={<Page><CustomiseDashboardPage /></Page>} />
      <Route path="contributions" element={<Page><ContributionsPage /></Page>} />
      <Route path="sponsors" element={<Page><SponsorsPage /></Page>} />
      <Route path="budget" element={<Page><BudgetPage /></Page>} />
      <Route path="tasks" element={<Page><TasksPage /></Page>} />
      <Route path="expenses" element={<Page><ExpensesPage /></Page>} />
      <Route path="auctions" element={<Page><AuctionsPage /></Page>} />
      <Route path="closing" element={<Page><ClosingPage /></Page>} />
      <Route path="prasad" element={<Page><PrasadPage /></Page>} />
      <Route path="volunteers" element={<Page><VolunteersPage /></Page>} />
      <Route path="events" element={<Navigate to="../event-plan" replace />} />
      <Route path="event-plan" element={<Page><EventPlanPage /></Page>} />
      <Route path="teams" element={<Page><TeamsPage /></Page>} />
      <Route path="fixtures" element={<Page><FixturesPage /></Page>} />
      <Route path="contacts" element={<PlaceholderPage title="Contacts" />} />
      <Route path="settings" element={<Page><SettingsPage /></Page>} />
    </Route>
  );
}

export function App() {
  useEffect(warmPages, []);
  return (
    <Routes>
      {/* The pages outside AppLayout slide in on a page turn like every event page does. See page-turn.tsx. */}
      <Route element={<PageTurnOutlet />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        {/* Outside AppLayout: no event is selected yet, so the sidebar and the
            route guard have nothing to be about. */}
        <Route path="/new-event" element={<Page><CreateEventWizard /></Page>} />
        <Route path="/profile" element={<Page><ProfilePage /></Page>} />
        {/* The permanent link. Resolves a token and hands over to the path form. */}
        <Route path="/s/:token" element={<ShareLinkPage />} />

        {/* A society's events - the front door. Outside AppLayout: this page is
            about choosing an event, so the event sidebar has nothing to be
            about yet. `/society` with no slug resolves to the viewer's own. */}
        <Route path="/society" element={<SocietyHomePage />} />
        <Route path="/society/:societySlug" element={<SocietyHomePage />} />
        {/* Private to society admins; the server decides, this only draws. */}
        <Route path="/society/:societySlug/admin" element={<Page><SocietyAdminPage /></Page>} />
      </Route>

      {/* The owner-only Platform Control Center. Reached by typing the address: nothing links here. The server
          decides who may read it; everybody else gets "Page not found". Outside the page turn, because moving
          between its sections should not slide its sidebar. See src/features/platform/platform-gate.tsx. */}
      <Route path="/platform/analytics/*" element={<PlatformGate />} />

      {/* The readable address. The `society` and `events` segments are what
          make it collision-proof: a society slugged "login" or "dashboard" can
          never shadow an app route, so there is no reserved-word list to keep
          up to date. AppLayout resolves the pair to an id. */}
      <Route path="/society/:societySlug/events/:eventSlug" element={<AppLayout />}>
        {eventRoutes()}
      </Route>

      {/* The id form. Still the address every existing bookmark and share token
          resolves to, and still what an event without slugs uses. AppLayout
          redirects it to the readable form once the slugs are known. */}
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
