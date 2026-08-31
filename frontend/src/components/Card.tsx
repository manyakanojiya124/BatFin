import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  as?: "section" | "div" | "article";
  tone?: "default" | "dark";
}

export function Card({
  as: Element = "section",
  children,
  className = "",
  tone = "default",
  ...props
}: CardProps) {
  return (
    <Element
      className={`rounded-card shadow-card ${tone === "dark" ? "bg-deep-forest text-white" : "bg-white"} ${className}`}
      {...props}
    >
      {children}
    </Element>
  );
}
