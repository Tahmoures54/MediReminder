interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full border border-gray-700 animate-scale-in">
        <div className="p-6">
          <h3 className="text-2xl font-bold text-white mb-4">{title}</h3>
          <p className="text-gray-300 whitespace-pre-line mb-6">{message}</p>
          
          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-green-500/30"
            >
              Yes
            </button>
            <button
              onClick={onCancel}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 shadow-lg shadow-red-500/30"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
