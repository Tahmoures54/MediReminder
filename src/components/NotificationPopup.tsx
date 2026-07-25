import { useEffect, useRef } from 'react';

interface NotificationPopupProps {
  title: string;
  message: string;
  onClose: () => void;
  onRestart?: () => void;
}

export function NotificationPopup({
  title,
  message,
  onClose,
  onRestart,
}: NotificationPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // فوکوس اولیه روی دکمه اصلی
    const focusTimer = window.setTimeout(() => {
      if (onRestart && restartButtonRef.current) {
        restartButtonRef.current.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      }
    }, 30);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // حبس فوکوس داخل مودال
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (!focusableElements.length) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (activeElement === firstElement || !dialogRef.current.contains(activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (activeElement === lastElement || !dialogRef.current.contains(activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      if (previousFocusedElementRef.current) {
        previousFocusedElementRef.current.focus();
      }
    };
  }, [onClose, onRestart]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alarm-title"
        aria-describedby="alarm-message"
        aria-live="assertive"
        aria-atomic="true"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-cyan-600 to-blue-700 shadow-[0_0_40px_rgba(34,211,238,0.3)]"
      >
        {/* نوار هشدار بالا */}
        <div className="absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r from-orange-400 via-yellow-300 to-orange-400 animate-pulse" />

        <div className="p-8">
          {/* آیکون */}
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-white/10 p-4 shadow-lg ring-4 ring-white/10 animate-pulse">
              <span className="text-4xl drop-shadow-lg" aria-hidden="true">
                🔔
              </span>
            </div>
          </div>

          {/* عنوان */}
          <h3
            id="alarm-title"
            className="mb-3 text-center text-3xl font-extrabold text-white drop-shadow-md"
          >
            {title}
          </h3>

          {/* پیام */}
          <p
            id="alarm-message"
            className="mb-8 whitespace-pre-line text-center text-lg font-medium leading-relaxed text-blue-50"
          >
            {message}
          </p>

          {/* دکمه‌ها */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {onRestart && (
              <button
                ref={restartButtonRef}
                onClick={onRestart}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-4 text-lg font-bold text-white shadow-[0_4px_14px_0_rgba(34,197,94,0.4)] transition-all duration-300 hover:-translate-y-1 hover:bg-green-400 hover:shadow-[0_6px_20px_rgba(34,197,94,0.3)] active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-200/40"
                aria-label="Confirm dose and restart timer"
              >
                <span aria-hidden="true">▶</span>
                Restart Timer
              </button>
            )}

            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="flex-1 rounded-xl bg-white px-6 py-4 text-lg font-bold text-blue-900 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:bg-gray-100 active:scale-95 focus:outline-none focus:ring-4 focus:ring-white/40"
              aria-label="Close alert"
            >
              OK, Got it
            </button>
          </div>

          {/* متن کمکی برای دسترسی */}
          <p className="mt-4 text-center text-xs text-blue-100/70">
            Press <span className="font-semibold">Esc</span> to close this alert
          </p>
        </div>
      </div>
    </div>
  );
}
