import { useEffect, useRef } from 'react';

interface NotificationPopupProps {
  title: string;
  message: string;
  onClose: () => void;
  onRestart?: () => void;
  onSnooze?: (minutes: number) => void;
  isMedicationAlert?: boolean;
}

export function NotificationPopup({
  title,
  message,
  onClose,
  onRestart,
  onSnooze,
  isMedicationAlert = true,
}: NotificationPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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

        <div className="p-6 sm:p-8">
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
            className="mb-3 text-center text-2xl sm:text-3xl font-extrabold text-white drop-shadow-md"
          >
            {title}
          </h3>

          {/* پیام */}
          <p
            id="alarm-message"
            className="mb-6 sm:mb-8 whitespace-pre-line text-center text-base sm:text-lg font-medium leading-relaxed text-blue-50"
          >
            {message}
          </p>

          {/* دکمه‌ها */}
          <div className="flex flex-col gap-3">
            {onRestart && (
              <button
                ref={restartButtonRef}
                onClick={onRestart}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-4 text-base sm:text-lg font-bold text-white shadow-[0_4px_14px_0_rgba(34,197,94,0.4)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-green-400 hover:shadow-[0_6px_20px_rgba(34,197,94,0.3)] active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-200/40"
                aria-label="Confirm dose taken and restart timer"
              >
                <span aria-hidden="true">✅</span>
                مصرف کردم · Taken
              </button>
            )}

            {onSnooze && isMedicationAlert && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSnooze(10)}
                  className="rounded-xl bg-amber-500/95 px-4 py-3.5 text-sm sm:text-base font-bold text-white shadow-md transition-all hover:bg-amber-400 active:scale-95 focus:outline-none focus:ring-4 focus:ring-amber-200/30"
                  aria-label="Snooze for 10 minutes"
                >
                  ⏰ ۱۰ دقیقه
                </button>
                <button
                  type="button"
                  onClick={() => onSnooze(30)}
                  className="rounded-xl bg-amber-500/95 px-4 py-3.5 text-sm sm:text-base font-bold text-white shadow-md transition-all hover:bg-amber-400 active:scale-95 focus:outline-none focus:ring-4 focus:ring-amber-200/30"
                  aria-label="Snooze for 30 minutes"
                >
                  ⏰ ۳۰ دقیقه
                </button>
              </div>
            )}

            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="w-full rounded-xl bg-white px-6 py-3.5 text-base sm:text-lg font-bold text-blue-900 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-100 active:scale-95 focus:outline-none focus:ring-4 focus:ring-white/40"
              aria-label="Dismiss alert"
            >
              بعداً · Dismiss
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-blue-100/70">
            برای بستن <span className="font-semibold">Esc</span> را بزنید
          </p>
        </div>
      </div>
    </div>
  );
}
