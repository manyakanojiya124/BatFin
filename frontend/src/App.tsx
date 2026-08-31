import { Navigate, Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { AddAssetPage } from "./pages/assets/AddAssetPage";
import { AssetDetailPage } from "./pages/assets/AssetDetailPage";
import { AssetsPage } from "./pages/assets/AssetsPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SplashPage } from "./pages/auth/SplashPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { AssetHealthPage } from "./pages/health/AssetHealthPage";
import { LedgerPage } from "./pages/ledger/LedgerPage";
import { PaymentsPage } from "./pages/payments/PaymentsPage";
import { PlansPage } from "./pages/plans/PlansPage";
import { ProfilePage } from "./pages/profile/ProfilePage";
import { SupportPage } from "./pages/support/SupportPage";

function App() {
  return (
    <Routes>
      <Route element={<SplashPage />} path="/" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardPage />} path="/dashboard" />
        <Route element={<AssetsPage />} path="/assets" />
        <Route element={<AddAssetPage />} path="/assets/add" />
        <Route element={<AssetDetailPage />} path="/assets/:id" />
        <Route element={<AssetHealthPage />} path="/assets/:id/health" />
        <Route element={<PlansPage />} path="/plans" />
        <Route element={<LedgerPage />} path="/ledger" />
        <Route element={<PaymentsPage />} path="/payments" />
        <Route element={<SupportPage />} path="/support" />
        <Route element={<ProfilePage />} path="/profile" />
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

export default App;
