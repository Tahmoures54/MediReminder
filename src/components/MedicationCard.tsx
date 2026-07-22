import { Medication } from '../db/database';
import { formatTime } from '../utils/audio';

interface MedicationCardProps {
  medication: Medication;
  index: number;
  onToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
  onShowReport: () => void;
}

export function MedicationCard({
  medication,
  index,
  onToggle,
  onReset,
  onDelete,
  onShowReport
}: MedicationCardProps) {
  // بهسازی: جلوگیری از خطای تقسیم بر صفر و محاسبه دقیق درصد برای نوار پیشرفت
  const progressPercentage = medication.interval > 0 
    ? Math.min((medication.remaining / medication.interval) * 100, 100) 
    : 0;
    
  const isLowStock = medication.quantity <= 5;

  return (
    <div className={`relative bg-gray-800 rounded-2xl p-5 shadow-xl border-l-4 transition-all duration-300 hover:shadow-2xl ${
      medication.running ? 'border-cyan-400' : 'border-gray-600'
    }`}>
      
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-gray-400 text-sm">#{index}</span>
            {medication.name}
          </h3>
          <p className="text-gray-300 text-sm mt-1">
            💊 Dosage: {medication.dosage}
          </p>
          <p className={`text-sm mt-1 ${isLowStock ? 'text-red-400 font-bold animate-pulse' : 'text-gray-300'}`}>
            📦 Remaining: {medication.quantity} {isLowStock && '⚠️'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {medication.running && (
            <div 
              className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.8)]" 
              title="Timer is running" 
              aria-hidden="true"
            />
          )}
          
          <button
            onClick={onShowReport}
            aria-label="View history report for this medication"
            className="bg-gray-700 hover:bg-gray-600 text-lg p-2.5 rounded-lg transition-all duration-200 flex items-center justify-center shadow-lg hover:scale-105"
            title="View History Report"
          >
            📊
          </button>
        </div>
      </div>

      {/* اضافه شدن aria-live برای خوانده شدن محترمانه زمان توسط دستیار صوتی */}
      <div 
        className={`text-5xl font-bold text-center my-4 transition-all duration-300 ${
          medication.running ? 'text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'text-gray-500'
        }`}
        aria-live="polite"
      >
        {formatTime(medication.remaining)}
      </div>

      {/* بهسازی نوار پیشرفت با استانداردهای Accessibility */}
      <div 
        className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-4"
        role="progressbar" 
        aria-valuenow={progressPercentage} 
        aria-valuemin={0} 
        aria-valuemax={100}
      >
        <div
          className={`h-full transition-all duration-1000 ${
            medication.running ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : 'bg-gray-600'
          }`}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onToggle}
          aria-label={medication.running ? "Pause timer" : "Start timer"}
          className={`flex-1 font-bold py-3 px-4 rounded-lg transition-all duration-300 ${
            medication.running
              ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50'
              : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-[1.02]'
          }`}
        >
          {medication.running ? '⏸ Pause' : '▶ Start'}
        </button>
        
        <button
          onClick={onReset}
          aria-label="Reset timer"
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 hover:scale-105"
        >
          ↺ Reset
        </button>
        
        <button
          onClick={onDelete}
          aria-label="Delete medication"
          title="Delete medication"
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
