interface BrandLogoProps {
  variant?: "compact" | "auth" | "hero";
  className?: string;
}

const sizeClasses = {
  compact: "w-24 sm:w-28",
  auth: "w-28 sm:w-32",
  hero: "w-56 sm:w-64 md:w-80",
};

export function BrandLogo({
  className = "",
  variant = "compact",
}: BrandLogoProps) {
  return (
    <img
      alt="BatFIN"
      className={`block h-auto max-w-full shrink-0 object-contain ${sizeClasses[variant]} ${className}`}
      draggable={false}
      src="/LOGO.png"
    />
  );
}
