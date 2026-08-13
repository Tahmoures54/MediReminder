interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700 animate-scale-in"
      >
        <div className="p-6">
          <h3 id="confirm-title" className="text-2xl font-bold text-white mb-4">
            {title}
          </h3>
          <p className="text-gray-300 whitespace-pre-line mb-6 leading-relaxed">{message}</p>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-green-500/30 active:scale-95 focus:outline-none focus:ring-4 focus:ring-green-300/30"
            >
              بله
            </button>
            <button
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
