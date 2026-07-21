import { Medication, HistoryRecord } from '../db/database';

interface ReportModalProps {
  medication: Medication;
  onClose: () => void;
}

export function ReportModal({ medication, onClose }: ReportModalProps) {
  // اگر تاریخچه‌ای نبود یک آرایه خالی در نظر می‌گیریم
  const history = medication.history || [];
  
  // مرتب‌سازی تاریخچه از جدید به قدیم (۵ تای آخر)
  const sortedHistory = [...history]
    .sort((a, b) => b.takenAt - a.takenAt)
    .slice(0, 5); // فقط ۵ رکورد آخر را نشان می‌دهیم که شلوغ نشود

  // محاسبه درصد پایبندی (مصرف‌های به‌موقع)
  const calculateScore = () => {
    if (history.length === 0) return 0;
    const onTimeCount = history.filter(h => h.status === 'on-time').length;
    return Math.round((onTimeCount / history.length) * 100);
  };

  const score = calculateScore();

  // تبدیل Timestamp به تاریخ و ساعت خوانا
  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    
    const isToday = date.getDate() === today.getDate() && 
                    date.getMonth() === today.getMonth() && 
                    date.getFullYear() === today.getFullYear();

    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) {
      return `Today at ${timeString}`;
    }
    
    return `${date.toLocaleDateString()} - ${timeString}`;
  };

  // تعیین استایل و آیکون بر اساس وضعیت
  const getStatusDisplay = (status: HistoryRecord['status']) => {
    switch (status) {
      case 'on-time':
        return { icon: '🟢', text: 'On Time', color: 'text-green-400', bg: 'bg-green-400/10' };
      case 'early':
        return { icon: '🟡', text: 'Early', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
      case 'late':
        return { icon: '🔴', text: 'Late', color: 'text-red-400', bg: 'bg-red-400/10' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl border border-gray-700 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            📊 {medication.name} Report
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2"
          >
            ✕
          </button>
        </div>

        {/* Score Card */}
        <div className="bg-gray-900 rounded-xl p-4 mb-6 border border-gray-700 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm mb-1">Overall Adherence</p>
            <p className="text-sm">
              {score >= 80 ? '🌟 Excellent' : score >= 50 ? '👍 Good' : '⚠️ Needs Attention'}
            </p>
          </div>
          <div className={`text-3xl font-bold ${
            score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {history.length > 0 ? `${score}%` : '-'}
          </div>
        </div>

        {/* History List */}
        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pr-2">
          <h3 className="text-gray-400 text-sm font-semibold mb-2">Last 5 Doses:</h3>
          
          {sortedHistory.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No doses recorded yet. <br/>Start the timer to track your history.
            </div>
          ) : (
            sortedHistory.map((record, index) => {
              const display = getStatusDisplay(record.status);
              return (
                <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${display.bg} border border-gray-700/50`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{display.icon}</span>
                    <span className="text-gray-200 text-sm font-medium">
                      {formatDateTime(record.takenAt)}
                    </span>
                  </div>
                  <span className={`text-sm font-bold ${display.color}`}>
                    {display.text}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300"
        >
          Close Report
        </button>

      </div>
    </div>
  );
}
