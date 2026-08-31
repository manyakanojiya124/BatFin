import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAdminStore } from "../store/admin.store";

export function ProtectedAdminRoute({
  allowPasswordChange = false,
}: {
  allowPasswordChange?: boolean;
}) {
  const admin = useAdminStore((state) => state.admin);
  const initialized = useAdminStore((state) => state.initialized);
  const location = useLocation();

  if (!initialized) {
    return (
      <main className="grid min-h-screen place-items-center bg-background">
        <div className="size-12 animate-spin rounded-full border-4 border-green-100 border-t-primary" />
      </main>
    );
  }

  if (!admin) {
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }

  if (admin.mustChangePassword && !allowPasswordChange) {
    return <Navigate replace to="/change-password" />;
  }

  if (!admin.mustChangePassword && allowPasswordChange) {
    return <Navigate replace to="/" />;
  }

  return <Outlet />;
}
