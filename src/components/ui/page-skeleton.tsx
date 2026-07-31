import { Layout } from "@/components/layout/Layout";
import { Skeleton } from "@/components/ui/skeleton";

interface PageSkeletonProps {
  statsCount?: number;
  rows?: number;
  columns?: number;
}

export function PageSkeleton({ statsCount = 4, rows = 6, columns = 5 }: PageSkeletonProps) {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {statsCount > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: statsCount }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        )}

        <Skeleton className="h-10 w-full max-w-xs" />

        <div className="rounded-lg border">
          <div className="flex gap-4 border-b px-4 py-3">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex gap-4 border-b px-4 py-4 last:border-0">
              {Array.from({ length: columns }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
