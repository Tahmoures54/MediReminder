interface BootScreenProps {
  error?: string | null;
  onRetry?: () => void;
}

export function BootScreen({ error, onRetry }: BootScreenProps) {
  if (error) {
    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-950 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white">
        <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-xl animate-scale-in">
          <div className="text-5xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-4 text-xl font-bold text-rose-300">راه‌اندازی برنامه انجام نشد</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            دسترسی به اعلان‌ها یا ذخیره‌سازی دستگاه با مشکل روبه‌رو شد. لطفاً دوباره تلاش کنید.
          </p>
          <p className="mt-4 break-words rounded-xl bg-slate-800 p-3 text-left text-xs leading-relaxed text-slate-500 font-mono">
            {error}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="tap-target mt-6 w-full rounded-2xl bg-cyan-500 px-4 py-3.5 text-[15px] font-bold text-slate-950 shadow-lg transition active:scale-[0.97] hover:bg-cyan-400 touch-manipulation"
            >
              🔄 تلاش مجدد
            </button>
          )}
          <p className="mt-4 text-xs text-slate-600">اگر مشکل ادامه داشت، حافظه مرورگر را پاک کنید یا برنامه را دوباره نصب کنید.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center bg-slate-950 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white">
      <div className="text-center">
        <div className="relative">
          <div className="text-6xl animate-pulse" aria-hidden="true">
            💊
          </div>
          <div className="absolute inset-0 animate-ping rounded-full bg-cyan-500/20 blur-xl" aria-hidden />
        </div>
        <h1 className="mt-6 text-xl font-bold text-cyan-200">یادآور دارو</h1>
        <p className="mt-2 text-sm text-slate-400">در حال بارگذاری…</p>
        <div className="mt-6 flex justify-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" />
        </div>
        <p className="mt-8 text-xs text-slate-600">نسخه نهایی — بهینه برای موبایل</p>
      </div>
    </div>
  );
}
