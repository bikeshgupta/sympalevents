import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { RouteGuard } from "@/components/layout/route-guard";
import { AccessDeniedPage } from "@/features/auth/access-denied-page";
import { LoginPage } from "@/features/auth/login-page";
import { AuctionsPage } from "@/features/auctions/auctions-page";
import { BudgetPage } from "@/features/budget/budget-page";
import { ContributionsPage } from "@/features/contributions/contributions-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ExpensesPage } from "@/features/expenses/expenses-page";
import { EventPlanPage } from "@/features/event-plan/event-plan-page";
import { PlaceholderPage } from "@/features/shared/placeholder-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { SponsorsPage } from "@/features/sponsors/sponsors-page";
import { TasksPage } from "@/features/tasks/tasks-page";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route element={<AppLayout />}>
        <Route element={<RouteGuard />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/contributions" element={<ContributionsPage />} />
          <Route path="/sponsors" element={<SponsorsPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/prasad" element={<PlaceholderPage title="Prasad Tracker" />} />
          <Route path="/volunteers" element={<PlaceholderPage title="Volunteers" />} />
          <Route path="/events" element={<Navigate to="/event-plan" replace />} />
          <Route path="/event-plan" element={<EventPlanPage />} />
          <Route path="/contacts" element={<PlaceholderPage title="Contacts" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
