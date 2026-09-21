import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Prevents a single render crash from blanking the entire medication app.
 * Final release: mobile-optimized error UI with safe areas and touch targets.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'خطای ناشناخته',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MediReminder] UI error:', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private reset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-950 p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] text-white">
        <div className="w-full max-w-md rounded-3xl border border-red-500/30 bg-slate-900 p-6 text-center shadow-xl animate-scale-in">
          <div className="text-5xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-4 text-xl font-bold text-red-300">خطایی در نمایش برنامه رخ داد</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            داده‌های دارو معمولاً روی دستگاه امن هستند. می‌توانید دوباره تلاش کنید یا صفحه را تازه کنید.
          </p>
          {this.state.message && (
            <p className="mt-4 break-words rounded-xl bg-slate-800 p-3 text-left font-mono text-xs leading-relaxed text-slate-500">
              {this.state.message}
            </p>
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
          <p className="mt-4 text-xs text-slate-600">اگر مشکل ادامه داشت، کش مرورگر را پاک کنید.</p>
        </div>
      </div>
    );
  }
}
