const today = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  month: "long",
  day: "2-digit",
  year: "2-digit",
});

export default function AdminTopbar() {
  return (
    <header className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-4 sm:px-8 sm:py-5">
      <p className="text-sm font-semibold text-gray-900 sm:text-lg">{today}</p>

      <div className="hidden flex-1 items-center justify-center px-8 md:flex">
        <div className="flex w-full max-w-md items-center gap-2 rounded-full bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Search for something
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-500" />
        </span>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-gray-900">Promise V.</p>
            <p className="text-xs text-primary-600">Super Admin</p>
          </div>
          <span className="h-9 w-9 shrink-0 rounded-full bg-primary-100" />
        </div>
      </div>
    </header>
  );
}
