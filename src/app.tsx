import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { RouteGuard } from "@/components/layout/route-guard";
import { AccessDeniedPage } from "@/features/auth/access-denied-page";
import { LoginPage } from "@/features/auth/login-page";
import { BudgetPage } from "@/features/budget/budget-page";
import { ContributionsPage } from "@/features/contributions/contributions-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ExpensesPage } from "@/features/expenses/expenses-page";
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
          <Route path="/procurement" element={<PlaceholderPage title="Procurement" />} />
          <Route path="/prasad" element={<PlaceholderPage title="Prasad Tracker" />} />
          <Route path="/volunteers" element={<PlaceholderPage title="Volunteers" />} />
          <Route path="/event-plan" element={<PlaceholderPage title="Event Plan" />} />
          <Route path="/run-sheet" element={<PlaceholderPage title="Run Sheet" />} />
          <Route path="/inventory" element={<PlaceholderPage title="Inventory" />} />
          <Route path="/vendors" element={<PlaceholderPage title="Vendors" />} />
          <Route path="/contacts" element={<PlaceholderPage title="Contacts" />} />
          <Route path="/risks" element={<PlaceholderPage title="Safety / Risks" />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
