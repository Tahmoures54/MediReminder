interface NotificationPopupProps {
  title: string;
  message: string;
  onClose: () => void;
  onRestart?: () => void;
}

export function NotificationPopup({ title, message, onClose, onRestart }: NotificationPopupProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl shadow-2xl max-w-md w-full border-4 border-white animate-bounce-in">
        <div className="p-6">
          <h3 className="text-3xl font-bold text-white mb-4 text-center">{title}</h3>
          <p className="text-white text-lg whitespace-pre-line mb-6 text-center font-semibold">
            {message}
          </p>
          
          <div className="flex gap-3">
            {onRestart && (
              <button
                onClick={onRestart}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 shadow-lg text-lg"
              >
                ▶ Restart Timer
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 bg-white hover:bg-gray-100 text-gray-800 font-bold py-4 px-6 rounded-lg transition-all duration-300 shadow-lg text-lg"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
