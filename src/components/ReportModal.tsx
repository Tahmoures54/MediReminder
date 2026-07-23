import { useEffect } from 'react';
import { Medication, HistoryRecord } from '../db/database';

interface ReportModalProps {
  medication: Medication;
  onClose: () => void;
}

export function ReportModal({ medication, onClose }: ReportModalProps) {
  const history = medication.history || [];
  
  const sortedHistory = [...history]
    .sort((a, b) => b.takenAt - a.takenAt)
    .slice(0, 5); 

  const calculateScore = () => {
    if (history.length === 0) return 0;
    const onTimeCount = history.filter(h => h.status === 'on-time').length;
    return Math.round((onTimeCount / history.length) * 100);
  };

  const score = calculateScore();

  // بستن مودال با دکمه Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleShareReport = async () => {
    const lastDose = history.length > 0 ? formatDateTime(history[0].takenAt) : 'N/A';
    const reportText = `📊 Medication Report: ${medication.name}
💊 Dosage: ${medication.dosage}
⭐ Adherence: ${history.length > 0 ? score + '%' : 'No data'}
📦 Total Doses: ${history.length}
🕒 Last Dose: ${lastDose}
🔗 Track with MediReminder: ${window.location.origin}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `${medication.name} - Medication Report`,
          text: reportText,
          url: window.location.origin,
        });
      } else {
        await navigator.clipboard.writeText(reportText);
        alert('📋 Report copied to clipboard! You can paste it to share.');
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Share failed:', error);
        try {
          await navigator.clipboard.writeText(reportText);
          alert('📋 Report copied to clipboard (sharing not supported).');
        } catch (clipErr) {
          alert('⚠️ Unable to share or copy report. Please try again.');
        }
      }
    }
  };

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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl border border-gray-700 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 id="modal-title" className="text-xl font-bold text-white flex items-center gap-2">
            📊 {medication.name} Report
          </h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleShareReport}
              className="bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors p-2.5 rounded-lg flex items-center justify-center"
              title="Share with Doctor"
              aria-label="Share Report"
            >
              📤
            </button>
            <button 
              onClick={onClose}
              className="bg-gray-700/50 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors p-2.5 rounded-lg flex items-center justify-center"
              title="Close"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
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
        <div className="space-y-3 mb-6 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
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
                    <span className="text-xl" aria-hidden="true">{display.icon}</span>
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
