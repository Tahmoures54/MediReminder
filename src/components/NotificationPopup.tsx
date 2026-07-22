import { useEffect } from 'react';

interface NotificationPopupProps {
  title: string;
  message: string;
  onClose: () => void;
  onRestart?: () => void;
}

export function NotificationPopup({ title, message, onClose, onRestart }: NotificationPopupProps) {
  
  // پشتیبانی از کیبورد برای بستن هشدار با کلید Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      // پس‌زمینه تاریک با افکت تاری (Blur)
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      // ویژگی‌های فوق‌العاده مهم برای صفحه‌خوان‌ها در زمان آلارم
      role="alertdialog" 
      aria-modal="true"
      aria-labelledby="alarm-title"
      aria-describedby="alarm-message"
    >
      <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-3xl shadow-[0_0_40px_rgba(34,211,238,0.3)] max-w-md w-full border border-white/20 animate-bounce-in relative overflow-hidden">
        
        {/* نوار رنگی بالای کارت برای جلب توجه بیشتر */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-orange-400 to-yellow-400 animate-pulse" />

        <div className="p-8">
          
          {/* آیکون هشدار برای جلب توجه بصری */}
          <div className="flex justify-center mb-4">
            <div className="bg-white/10 p-4 rounded-full animate-pulse">
              <span className="text-4xl drop-shadow-lg" aria-hidden="true">🔔</span>
            </div>
          </div>

          <h3 id="alarm-title" className="text-3xl font-extrabold text-white mb-3 text-center drop-shadow-md">
            {title}
          </h3>
          
          <p id="alarm-message" className="text-blue-50 text-lg whitespace-pre-line mb-8 text-center font-medium leading-relaxed">
            {message}
          </p>
          
          {/* استفاده از flex-col برای گوشی‌های کوچک و flex-row برای سایزهای بزرگتر */}
          <div className="flex flex-col sm:flex-row gap-3">
            {onRestart && (
              <button
                onClick={onRestart}
                className="flex-1 bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-[0_4px_14px_0_rgba(34,197,94,0.4)] hover:shadow-[0_6px_20px_rgba(34,197,94,0.3)] hover:-translate-y-1 text-lg flex items-center justify-center gap-2 active:scale-95"
              >
                <span aria-hidden="true">▶</span> Restart Timer
              </button>
            )}
            
            <button
              onClick={onClose}
              className="flex-1 bg-white hover:bg-gray-100 text-blue-900 font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-lg hover:-translate-y-1 text-lg active:scale-95"
            >
              OK, Got it
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
