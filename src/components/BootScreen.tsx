interface BootScreenProps {
  error?: string | null;
  onRetry?: () => void;
}

export function BootScreen({ error, onRetry }: BootScreenProps) {
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-xl">
          <div className="text-4xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-3 text-xl font-bold text-rose-300">راه‌اندازی برنامه انجام نشد</h1>
          <p className="mt-2 text-sm text-slate-400">
            دسترسی به اعلان‌ها یا ذخیره‌سازی دستگاه با مشکل روبه‌رو شد.
          </p>
          <p className="mt-3 break-words rounded-lg bg-slate-800 p-2 text-xs text-slate-500">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 w-full rounded-2xl bg-cyan-500 px-4 py-3 font-bold text-slate-950 hover:bg-cyan-400"
            >
              تلاش مجدد
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="text-center">
        <div className="text-5xl animate-pulse" aria-hidden="true">
          💊
        </div>
        <p className="mt-4 text-sm text-slate-400">در حال بارگذاری…</p>
      </div>
    </div>
  );
}
