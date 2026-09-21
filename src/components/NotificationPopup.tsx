import { useEffect, useRef, useId } from 'react';
import { Portal } from './Portal';

interface NotificationPopupProps {
  title: string;
  message: string;
  onClose: () => void;
  onRestart?: () => void;
  onSnooze?: (minutes: number) => void;
  isMedicationAlert?: boolean;
  closeOnOverlayClick?: boolean;
}

export function NotificationPopup({
  title,
  message,
  onClose,
  onRestart,
  onSnooze,
  isMedicationAlert = true,
  closeOnOverlayClick = false,
}: NotificationPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restartButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    previousFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    // Prevent background scroll, account for scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusTimer = window.setTimeout(() => {
      if (onRestart && restartButtonRef.current) {
        restartButtonRef.current.focus();
      } else if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      }
    }, 50);

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
      document.body.style.paddingRight = previousPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);

      if (previousFocusedElementRef.current) {
        previousFocusedElementRef.current.focus();
      }
    };
  }, [onClose, onRestart, onSnooze]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[500] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 pb-[calc(1rem+var(--sab))] pt-[calc(1rem+var(--sat))] touch-manipulation"
        onClick={closeOnOverlayClick ? onClose : undefined}
        style={{ paddingLeft: 'max(1rem, var(--sal))', paddingRight: 'max(1rem, var(--sar))' }}
      >
        <div
          ref={dialogRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          aria-live="assertive"
          aria-atomic="true"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-red-400/40 bg-gradient-to-br from-red-700 via-rose-700 to-orange-700 shadow-[0_0_50px_rgba(239,68,68,0.45)] animate-pop-in max-h-[90dvh] overflow-y-auto custom-scrollbar"
        >
          <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-yellow-300 via-orange-400 to-yellow-300 animate-pulse" />

          <div className="p-6 sm:p-8">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-white/15 p-4 shadow-lg ring-4 ring-white/20 animate-pulse">
                <span className="text-5xl drop-shadow-lg" aria-hidden="true">
                  💊
                </span>
              </div>
            </div>

            <h3
              id={titleId}
              className="mb-3 text-center text-2xl sm:text-3xl font-extrabold text-white drop-shadow-md text-balance"
            >
              {title}
            </h3>

            <p
              id={messageId}
              className="mb-6 sm:mb-8 whitespace-pre-line text-center text-base sm:text-lg font-medium leading-relaxed text-orange-50"
            >
              {message}
            </p>

            {isMedicationAlert && (
              <p className="mb-4 text-center text-sm font-bold text-yellow-200 animate-pulse">
                🔔 زنگ تا تأیید مصرف ادامه دارد — دقیق و مکرر
              </p>
            )}

            <div className="flex flex-col gap-3">
              {onRestart && (
                <button
                  ref={restartButtonRef}
                  type="button"
                  onClick={onRestart}
                  className="tap-target flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-6 py-4 text-base sm:text-lg font-bold text-white shadow-[0_4px_14px_0_rgba(34,197,94,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-green-400 hover:shadow-[0_6px_20px_rgba(34,197,94,0.4)] active:scale-[0.98] active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-green-200/40 touch-manipulation"
                  aria-label="تأیید مصرف دارو و راه‌اندازی مجدد تایمر"
                >
                  <span aria-hidden="true">✅</span>
                  مصرف کردم
                </button>
              )}

              {onSnooze && isMedicationAlert && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onSnooze(10)}
                    className="tap-target rounded-xl bg-amber-500/95 px-4 py-4 text-sm sm:text-base font-bold text-white shadow-md transition-all hover:bg-amber-400 active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-amber-200/30 touch-manipulation"
                    aria-label="به تعویق انداختن به مدت ۱۰ دقیقه"
                  >
                    ⏰ ۱۰ دقیقه
                  </button>
                  <button
                    type="button"
                    onClick={() => onSnooze(30)}
                    className="tap-target rounded-xl bg-amber-500/95 px-4 py-4 text-sm sm:text-base font-bold text-white shadow-md transition-all hover:bg-amber-400 active:scale-[0.97] focus:outline-none focus:ring-4 focus:ring-amber-200/30 touch-manipulation"
                    aria-label="به تعویق انداختن به مدت ۳۰ دقیقه"
                  >
                    ⏰ ۳۰ دقیقه
                  </button>
                </div>
              )}

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="tap-target w-full rounded-xl bg-white/90 px-6 py-4 text-base sm:text-lg font-bold text-red-900 shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-white active:scale-[0.98] active:translate-y-0 focus:outline-none focus:ring-4 focus:ring-white/40 touch-manipulation"
                aria-label="بستن هشدار — یادآوری دوباره می‌آید"
              >
                بعداً — یادآوری کن
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-orange-100/80">
              برای بستن کلید Esc یا دکمه بازگشت موبایل را بزنید
            </p>
          </div>
        </div>
      </div>
    </Portal>
  );
}
