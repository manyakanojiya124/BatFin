import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { BrandLogo } from "../../components/BrandLogo";
import { useAuthStore } from "../../store/auth.store";

export function SplashPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      navigate(token ? "/dashboard" : "/login", { replace: true });
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [navigate, token]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-deep-forest px-8">
      <div className="splash-orb splash-orb-left" />
      <div className="splash-orb splash-orb-right" />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <div className="splash-logo-shell rounded-[28px] bg-white/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <BrandLogo variant="hero" />
        </div>
        <p className="splash-tagline mt-7 text-center text-sm font-medium tracking-wide text-primary-fixed-dim">
          Powering every journey
        </p>
      </div>
    </main>
  );
}
