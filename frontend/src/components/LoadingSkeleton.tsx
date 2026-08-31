export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer rounded-xl bg-surface-container ${className}`}
    />
  );
}

export function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8">
      <div className="flex flex-col items-center">
        <LoadingSkeleton className="size-24 rounded-full" />
        <LoadingSkeleton className="mt-5 h-9 w-52" />
        <LoadingSkeleton className="mt-3 h-7 w-28 rounded-full" />
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <LoadingSkeleton className="h-72 rounded-[20px]" />
        <LoadingSkeleton className="h-72 rounded-[20px]" />
      </div>
    </div>
  );
}
