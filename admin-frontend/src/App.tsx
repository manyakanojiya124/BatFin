import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AdminLayout } from "./components/AdminLayout";
import { ProtectedAdminRoute } from "./components/ProtectedAdminRoute";
import { AdminLoginPage } from "./pages/auth/AdminLoginPage";
import { AdminPasswordChangePage } from "./pages/auth/AdminPasswordChangePage";
import { AdminDashboardPage } from "./pages/dashboard/AdminDashboardPage";
import { AdminBusinessDataPage } from "./pages/data/AdminBusinessDataPage";
import { AdminDatasetPage } from "./pages/data/AdminDatasetPage";
import { AdminSessionsPage } from "./pages/admins/AdminSessionsPage";
import { AdminUserDetailPage } from "./pages/admins/AdminUserDetailPage";
import { AdminUsersPage } from "./pages/admins/AdminUsersPage";
import { AdminAuditPage } from "./pages/audit/AdminAuditPage";
import { AdminBatchIssuePage } from "./pages/inventory/AdminBatchIssuePage";
import { AdminCreateAssetPage } from "./pages/inventory/AdminCreateAssetPage";
import { AdminInventoryDetailPage } from "./pages/inventory/AdminInventoryDetailPage";
import { AdminInventoryPage } from "./pages/inventory/AdminInventoryPage";
import { AdminPaymentDetailPage } from "./pages/payments/AdminPaymentDetailPage";
import { AdminPaymentsPage } from "./pages/payments/AdminPaymentsPage";
import { AdminSettingsPage } from "./pages/settings/AdminSettingsPage";
import { AdminTicketDetailPage } from "./pages/tickets/AdminTicketDetailPage";
import { AdminTicketsPage } from "./pages/tickets/AdminTicketsPage";
import { getAdminCsrf, getAdminMe } from "./services/api";
import { useAdminStore } from "./store/admin.store";

const AdminAnalyticsDashboardPage = lazy(() => import("./pages/analytics/AdminAnalyticsDashboardPage").then((module) => ({ default: module.AdminAnalyticsDashboardPage })));
const AdminAnalyticsPresentationPage = lazy(() => import("./pages/analytics/AdminAnalyticsPresentationPage").then((module) => ({ default: module.AdminAnalyticsPresentationPage })));
const AdminAnalyticsDashboardsPage = lazy(() => import("./pages/analytics/AdminAnalyticsDashboardsPage").then((module) => ({ default: module.AdminAnalyticsDashboardsPage })));
const AdminAnalyticsDatasetDetailPage = lazy(() => import("./pages/analytics/AdminAnalyticsDatasetDetailPage").then((module) => ({ default: module.AdminAnalyticsDatasetDetailPage })));
const AdminAnalyticsDatasetsPage = lazy(() => import("./pages/analytics/AdminAnalyticsDatasetsPage").then((module) => ({ default: module.AdminAnalyticsDatasetsPage })));
const AdminAnalyticsUploadPage = lazy(() => import("./pages/analytics/AdminAnalyticsUploadPage").then((module) => ({ default: module.AdminAnalyticsUploadPage })));
const AdminCustomersPage=lazy(()=>import("./pages/users/AdminCustomersPage").then(module=>({default:module.AdminCustomersPage})));
const AdminCustomerDetailPage=lazy(()=>import("./pages/users/AdminCustomerDetailPage").then(module=>({default:module.AdminCustomerDetailPage})));
const AdminPortfolioCustomerDetailPage=lazy(()=>import("./pages/users/AdminPortfolioCustomerDetailPage").then(module=>({default:module.AdminPortfolioCustomerDetailPage})));

let adminSessionBootstrap:ReturnType<typeof bootstrapAdminSession>|null=null;
function bootstrapAdminSession(){
  const existingCsrf=useAdminStore.getState().csrfToken;
  return Promise.all([getAdminMe(),existingCsrf?Promise.resolve({csrfToken:existingCsrf}):getAdminCsrf()]).then(([me,csrf])=>({me,csrf}));
}
function sharedAdminSessionBootstrap(){adminSessionBootstrap??=bootstrapAdminSession();return adminSessionBootstrap}

function App() {
  const setSession = useAdminStore((state) => state.setSession);
  const setInitialized = useAdminStore((state) => state.setInitialized);
  const clearSession = useAdminStore((state) => state.clearSession);

  useEffect(() => {
    let active = true;

    async function bootstrapSession() {
      try {
        const {me,csrf}=await sharedAdminSessionBootstrap();
        if (active) setSession(me.admin, csrf.csrfToken);
      } catch {
        adminSessionBootstrap=null;
        if (active) clearSession();
      } finally {
        if (active) setInitialized(true);
      }
    }

    void bootstrapSession();
    return () => {
      active = false;
    };
  }, [clearSession, setInitialized, setSession]);

  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background"><div className="size-12 animate-spin rounded-full border-4 border-green-100 border-t-primary" /></main>}>
    <Routes>
      <Route element={<AdminLoginPage />} path="/login" />
      <Route element={<ProtectedAdminRoute allowPasswordChange />}>
        <Route element={<AdminPasswordChangePage />} path="/change-password" />
      </Route>
      <Route element={<ProtectedAdminRoute />}>
        <Route element={<AdminAnalyticsPresentationPage />} path="/analytics/dashboards/:id/present" />
        <Route element={<AdminLayout />}>
          <Route element={<AdminDashboardPage />} path="/" />
          <Route element={<AdminCustomersPage />} path="/customers" />
          <Route element={<AdminPortfolioCustomerDetailPage />} path="/customers/portfolio/:id" />
          <Route element={<AdminCustomerDetailPage />} path="/customers/:id" />
          <Route element={<AdminInventoryPage />} path="/inventory" />
          <Route element={<AdminCreateAssetPage />} path="/inventory/new" />
          <Route element={<AdminBatchIssuePage />} path="/inventory/batches/new" />
          <Route element={<AdminInventoryDetailPage />} path="/inventory/:id" />
          <Route element={<AdminTicketsPage />} path="/tickets" />
          <Route element={<AdminTicketDetailPage />} path="/tickets/:id" />
          <Route element={<AdminPaymentsPage />} path="/payments" />
          <Route element={<AdminPaymentDetailPage />} path="/payments/:id" />
          <Route element={<AdminAuditPage />} path="/audit" />
          <Route element={<AdminUsersPage />} path="/admins" />
          <Route element={<AdminUserDetailPage />} path="/admins/:id" />
          <Route element={<AdminSessionsPage />} path="/sessions" />
          <Route element={<AdminSettingsPage />} path="/settings" />
          <Route element={<Navigate replace to="/analytics/datasets" />} path="/analytics" />
          <Route element={<AdminAnalyticsDatasetsPage />} path="/analytics/datasets" />
          <Route element={<AdminAnalyticsUploadPage />} path="/analytics/datasets/upload" />
          <Route element={<AdminAnalyticsDatasetDetailPage />} path="/analytics/datasets/:id" />
          <Route element={<AdminAnalyticsDashboardsPage />} path="/analytics/dashboards" />
          <Route element={<AdminAnalyticsDashboardPage />} path="/analytics/dashboards/:id" />
          <Route element={<AdminAnalyticsDashboardPage />} path="/analytics/dashboards/:id/edit" />
          <Route element={<AdminBusinessDataPage />} path="/data" />
          <Route element={<AdminDatasetPage />} path="/data/:datasetType" />
        </Route>
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
    </Suspense>
  );
}

export default App;
