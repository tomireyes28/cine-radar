export default function Loading() {
  return (
    <div className="container mx-auto px-4 md:px-6">
      {/* Header Skeleton */}
      <section className="mt-8 md:mt-12 mb-6">
        <div className="h-10 md:h-12 w-64 bg-zinc-800/60 rounded-xl animate-pulse mb-3" />
        <div className="h-5 w-48 bg-zinc-800/40 rounded-lg animate-pulse" />
      </section>

      {/* Filter Chips Skeleton */}
      <div className="space-y-4 mb-8">
        <div>
          <div className="h-3 w-16 bg-zinc-800/60 rounded mb-2 animate-pulse" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-8 w-20 bg-zinc-900 border border-zinc-800 rounded-full shrink-0 animate-pulse"
              />
            ))}
          </div>
        </div>
        <div>
          <div className="h-3 w-16 bg-zinc-800/60 rounded mb-2 animate-pulse" />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-8 w-24 bg-zinc-900 border border-zinc-800 rounded-full shrink-0 animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Search Bar Skeleton */}
      <div className="max-w-xl mx-auto mb-8">
        <div className="h-12 w-full bg-zinc-900/80 border border-zinc-800 rounded-xl animate-pulse" />
      </div>

      {/* Movie Cards Grid Skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6 mb-24">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden animate-pulse"
          >
            <div className="aspect-2/3 bg-zinc-800/50" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-zinc-800 rounded w-3/4" />
              <div className="h-3 bg-zinc-800/60 rounded w-1/2" />
              <div className="h-8 bg-zinc-800/40 rounded-lg mt-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
