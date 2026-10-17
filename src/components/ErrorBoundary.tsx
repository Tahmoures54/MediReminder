import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional hook so the app can forward caught errors to diagnostics. */
  onError?: (error: unknown, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  message: string;
  /** Bumped on reset to force children to remount — see reset(). */
  remountKey: number;
}

const MAX_MESSAGE_LEN = 800;

function extractMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    const s = JSON.stringify(error);
    return s && s !== '{}' ? s : 'خطای ناشناخته';
  } catch {
    return 'خطای ناشناخته';
  }
}

/**
 * Catches render-time errors so a single broken child cannot blank the app.
 *
 * NOTE: Error boundaries do NOT catch errors in event handlers, async code,
 * or themselves. Those must be handled by try/catch at the call site.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', remountKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    const raw = extractMessage(error);
    const message =
      raw.length > MAX_MESSAGE_LEN ? `${raw.slice(0, MAX_MESSAGE_LEN)}…` : raw;
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[MediReminder] UI error:', error, info.componentStack);
    try {
      this.props.onError?.(error, info);
    } catch (e) {
      console.warn('[MediReminder] onError handler failed', e);
    }
  }

  private reload = () => {
    const ok = window.confirm(
      'با بارگذاری مجدد، هر فرم نیمه‌کاره‌ای پاک می‌شود. ادامه می‌دهید؟'
    );
    if (ok) window.location.reload();
  };

  private reset = () => {
    // Resetting hasError alone would re-render the same subtree that just
    // threw. Bumping remountKey forces React to remount children fresh,
    // which clears any stale internal state that caused the crash.
    this.setState((s) => ({
      hasError: false,
      message: '',
      remountKey: s.remountKey + 1,
    }));
  };

  render() {
    if (!this.state.hasError) {
      return (
        <Fragment key={this.state.remountKey}>{this.props.children}</Fragment>
      );
    }

    return (
      // overflow-y-auto is required: after the global CSS fix, html/body are
      // overflow:hidden and a long error message would otherwise be clipped.
      <div className="flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white">
        <div
          role="alert"
          aria-live="assertive"
          className="w-full max-w-md rounded-3xl border border-red-500/30 bg-slate-900 p-6 text-center shadow-xl animate-scale-in"
        >
          <div className="text-5xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-4 text-xl font-bold text-red-300">
            خطایی در نمایش برنامه رخ داد
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            داده‌های دارو معمولاً روی دستگاه امن هستند. می‌توانید دوباره تلاش کنید یا صفحه را تازه کنید.
          </p>
          {this.state.message && (
            <pre
              dir="auto"
              className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-800 p-3 text-start font-mono text-xs leading-relaxed text-slate-400"
            >
              {this.state.message}
            </pre>
          )}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="tap-target flex-1 rounded-2xl bg-cyan-600 py-3.5 text-[15px] font-bold text-white shadow-md transition hover:bg-cyan-500 active:scale-[0.97] touch-manipulation"
            >
              🔄 تلاش مجدد
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="tap-target flex-1 rounded-2xl bg-slate-700 py-3.5 text-[15px] font-bold text-white transition hover:bg-slate-600 active:scale-[0.97] touch-manipulation"
            >
              ↻ بارگذاری مجدد
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            اگر مشکل ادامه داشت، کش مرورگر را پاک کنید یا برنامه را دوباره نصب کنید.
          </p>
        </div>
      </div>
    );
  }
}
