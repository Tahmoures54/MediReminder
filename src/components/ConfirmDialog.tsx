import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // مدیریت کلید Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // فوکوس اولیه روی دکمه تأیید
  useEffect(() => {
    confirmButtonRef.current?.focus();
  }, []);

  // جلوگیری از اسکرول صفحه پس‌زمینه هنگام باز بودن دیالوگ
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // مدیریت فوکوس برای Trap (ساده با نگه‌داشتن فوکوس در دیالوگ)
  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel} // بستن با کلیک روی پس‌زمینه
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700 animate-scale-in"
        onClick={(e) => e.stopPropagation()} // جلوگیری از بسته شدن با کلیک داخل دیالوگ
        onKeyDown={handleDialogKeyDown}
      >
        <div className="p-6">
          <h3 id="confirm-title" className="text-2xl font-bold text-white mb-4">
            {title}
          </h3>
          <p
            id="confirm-message"
            className="text-gray-300 whitespace-pre-line mb-6 leading-relaxed"
          >
            {message}
          </p>

          <div className="flex gap-3">
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={onConfirm}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-green-500/30 active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-300/30"
            >
              بله
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg active:scale-95 focus:outline-none focus:ring-4 focus:ring-gray-300/20"
            >
              انصراف
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
