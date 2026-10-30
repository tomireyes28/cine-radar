export default function MovieDetailLoading() {
  return (
    <div className="text-zinc-100 pb-20">
      {/* Hero Banner Skeleton */}
      <div className="relative w-full h-[50vh] md:h-[55vh] bg-zinc-900/60 animate-pulse -mt-20 border-b border-zinc-800/50" />

      <div className="container mx-auto px-4 md:px-6 -mt-32 md:-mt-40 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start mb-10">
          {/* Poster Skeleton */}
          <div className="w-36 md:w-56 aspect-2/3 bg-zinc-800 rounded-xl shadow-2xl border border-white/10 shrink-0 animate-pulse mx-auto md:mx-0" />

          {/* Details Skeleton */}
          <div className="flex-1 space-y-4 w-full">
            <div className="h-8 md:h-12 bg-zinc-800 rounded-xl w-3/4 animate-pulse" />
            <div className="flex gap-2">
              <div className="h-6 w-16 bg-zinc-800/80 rounded-md animate-pulse" />
              <div className="h-6 w-20 bg-zinc-800/80 rounded-md animate-pulse" />
              <div className="h-6 w-24 bg-zinc-800/80 rounded-md animate-pulse" />
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-4 bg-zinc-800/60 rounded w-full animate-pulse" />
              <div className="h-4 bg-zinc-800/60 rounded w-5/6 animate-pulse" />
              <div className="h-4 bg-zinc-800/60 rounded w-2/3 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Date Selector Skeleton */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-xl shrink-0 animate-pulse"
            />
          ))}
        </div>

        {/* Cinema Group Cards Skeleton */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-900/40 border border-white/5 rounded-2xl p-6 space-y-4 animate-pulse"
            >
              <div className="h-6 bg-zinc-800 rounded w-48" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-12 w-20 bg-zinc-800/60 rounded-lg"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
