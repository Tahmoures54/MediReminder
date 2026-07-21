import { Medication } from '../db/database';
import { formatTime } from '../utils/audio';

interface MedicationCardProps {
  medication: Medication;
  index: number;
  onToggle: () => void;
  onReset: () => void;
  onDelete: () => void;
  onShowReport: () => void; // این پراپ برای دکمه گزارش اضافه شد
}

export function MedicationCard({ medication, index, onToggle, onReset, onDelete, onShowReport }: MedicationCardProps) {
  const progress = medication.remaining / medication.interval;
  const isLowStock = medication.quantity <= 5;

  return (
    <div className={`relative bg-gray-800 rounded-2xl p-5 shadow-xl border-l-4 ${
      medication.running ? 'border-cyan-400' : 'border-gray-600'
    } transition-all duration-300`}>
      
      {/* Header & Top Right Actions */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-gray-400 text-sm">#{index}</span>
            {medication.name}
          </h3>
          <p className="text-gray-300 text-sm mt-1">
            💊 Dosage: {medication.dosage}
          </p>
          <p className={`text-sm mt-1 ${isLowStock ? 'text-red-400 font-bold' : 'text-gray-300'}`}>
            📦 Remaining: {medication.quantity} {isLowStock && '⚠️'}
          </p>
        </div>

        {/* دکمه گزارش و چراغ چشمک‌زن */}
        <div className="flex items-center gap-3">
          {medication.running && (
            <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" title="Timer is running" />
          )}
          <button
            onClick={onShowReport}
            className="bg-gray-700 hover:bg-gray-600 text-xl p-2 rounded-lg transition-colors duration-300 flex items-center justify-center shadow-lg"
            title="View History Report"
          >
            📊
          </button>
        </div>
      </div>

      {/* Timer Display */}
      <div className={`text-5xl font-bold text-center my-4 ${
        medication.running ? 'text-cyan-400' : 'text-gray-500'
      } transition-colors duration-300`}>
        {formatTime(medication.remaining)}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
        <div
          className={`h-full transition-all duration-1000 ${
            medication.running ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : 'bg-gray-600'
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onToggle}
          className={`flex-1 font-bold py-3 px-4 rounded-lg transition-all duration-300 ${
            medication.running
              ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30'
              : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30'
          }`}
        >
          {medication.running ? '⏸ Pause' : '▶ Start'}
        </button>
        
        <button
          onClick={onReset}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300"
        >
          ↺ Reset
        </button>
        
        <button
          onClick={onDelete}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg shadow-red-500/30"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
