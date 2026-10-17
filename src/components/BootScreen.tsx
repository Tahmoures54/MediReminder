import { APP_VERSION, IS_FINAL_RELEASE } from '../constants';

interface BootScreenProps {
  error?: string | null;
  onRetry?: () => void;
}

export function BootScreen({ error, onRetry }: BootScreenProps) {
  // Empty string is treated as a real error state — the caller asked for it.
  const hasError = error != null;

  if (hasError) {
    const message = error && error.length > 0 ? error : 'خطای نامشخص در راه‌اندازی برنامه';

    return (
      // overflow-y-auto lets long stack traces scroll; without it our global
      // `html, body { overflow: hidden }` would clip the error text.
      <div className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white">
        <div
          role="alert"
          aria-live="assertive"
          className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 text-center shadow-xl animate-scale-in"
        >
          <div className="text-5xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-4 text-xl font-bold text-rose-300">راه‌اندازی برنامه انجام نشد</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            دسترسی به اعلان‌ها یا ذخیره‌سازی دستگاه با مشکل روبه‌رو شد. لطفاً دوباره تلاش کنید.
          </p>
          <pre
            dir="auto"
            className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-800 p-3 text-start text-xs leading-relaxed text-slate-400 font-mono"
          >
            {message}
          </pre>
          <button
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
            className="tap-target mt-6 w-full rounded-2xl bg-cyan-500 px-4 py-3.5 text-[15px] font-bold text-slate-950 shadow-lg transition active:scale-[0.97] hover:bg-cyan-400 touch-manipulation"
          >
            🔄 تلاش مجدد
          </button>
          <p className="mt-4 text-xs text-slate-500">
            اگر مشکل ادامه داشت، حافظه مرورگر را پاک کنید یا برنامه را دوباره نصب کنید.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto bg-slate-950 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white"
    >
      <div className="text-center">
        <div className="relative inline-flex h-20 w-20 items-center justify-center">
          <div className="text-6xl animate-pulse" aria-hidden="true">
            💊
          </div>
          <div
            className="absolute inset-0 animate-ping rounded-full bg-cyan-500/20 blur-xl"
            aria-hidden="true"
          />
        </div>
        <h1 className="mt-6 text-xl font-bold text-cyan-200">یادآور دارو</h1>
        <p className="mt-2 text-sm text-slate-400">در حال بارگذاری…</p>
        <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" />
        </div>
        <p className="mt-8 text-xs text-slate-500">
          {IS_FINAL_RELEASE ? 'نسخه نهایی' : 'نسخه پیش‌انتشار'} · نسخه {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
