import { BatteryCharging, Home, UserRound, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";

interface BottomNavigationProps {
  active: "home" | "assets" | "payments" | "profile";
}

const sharedItemClass =
  "flex min-w-[64px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition duration-200 min-[360px]:min-w-[68px] min-[360px]:px-3";

function navItemClass(isActive: boolean) {
  return `${sharedItemClass} ${
    isActive
      ? "bg-primary-container text-white"
      : "text-on-surface-variant hover:bg-surface-container"
  }`;
}

export function BottomNavigation({ active }: BottomNavigationProps) {
  return (
    <nav
      aria-label="Primary navigation"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex h-20 max-w-3xl items-center justify-around rounded-t-2xl bg-white px-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] min-[360px]:px-2 md:hidden"
    >
      <NavLink className={navItemClass(active === "home")} to="/dashboard">
        <Home
          aria-hidden="true"
          className="size-5"
          fill={active === "home" ? "currentColor" : "none"}
          strokeWidth={2}
        />
        <span className={active === "home" ? "font-bold" : ""}>Home</span>
      </NavLink>
      <NavLink className={navItemClass(active === "assets")} to="/assets">
        <BatteryCharging
          aria-hidden="true"
          className="size-5"
          fill={active === "assets" ? "currentColor" : "none"}
          strokeWidth={2}
        />
        <span className={active === "assets" ? "font-bold" : ""}>Assets</span>
      </NavLink>
      <NavLink className={navItemClass(active === "payments")} to="/ledger">
        <WalletCards
          aria-hidden="true"
          className="size-5"
          fill={active === "payments" ? "currentColor" : "none"}
          strokeWidth={2}
        />
        <span className={active === "payments" ? "font-bold" : ""}>Payments</span>
      </NavLink>
      <NavLink className={navItemClass(active === "profile")} to="/profile">
        <UserRound
          aria-hidden="true"
          className="size-5"
          fill={active === "profile" ? "currentColor" : "none"}
          strokeWidth={2}
        />
        <span className={active === "profile" ? "font-bold" : ""}>Profile</span>
      </NavLink>
    </nav>
  );
}
