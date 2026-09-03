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
      <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-gray-900 p-6 text-center shadow-xl">
          <div className="text-4xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-3 text-xl font-bold text-red-300">خطایی در نمایش برنامه رخ داد</h1>
          <p className="mt-2 text-sm text-gray-400">
            داده‌های دارو معمولاً روی دستگاه امن هستند. می‌توانید صفحه را تازه کنید یا دوباره تلاش کنید.
          </p>
          {this.state.message && (
            <p className="mt-3 break-words rounded-lg bg-gray-800 p-2 text-xs text-gray-500">{this.state.message}</p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={this.reset}
              className="flex-1 rounded-xl bg-cyan-600 py-3 font-bold text-white hover:bg-cyan-500"
            >
              تلاش مجدد
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="flex-1 rounded-xl bg-gray-700 py-3 font-bold text-white hover:bg-gray-600"
            >
              بارگذاری مجدد
            </button>
          </div>
        </div>
      </div>
    );
  }
}
