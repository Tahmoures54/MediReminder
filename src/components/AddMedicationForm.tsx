import { useState } from 'react';
import { Medication } from '../db/database';

interface AddMedicationFormProps {
  onSubmit: (medication: Omit<Medication, 'id' | 'remaining' | 'running' | 'history'>) => void;
  onCancel: () => void;
}

const PRESET_INTERVALS = [
  { label: '۴ ساعت', value: 4 },
  { label: '۶ ساعت', value: 6 },
  { label: '۸ ساعت', value: 8 },
  { label: '۱۲ ساعت', value: 12 },
  { label: '۲۴ ساعت', value: 24 },
  { label: '۴۸ ساعت', value: 48 },
  { label: '۷۲ ساعت', value: 72 },
  { label: '۱ هفته', value: 168 },
];

export function AddMedicationForm({ onSubmit, onCancel }: AddMedicationFormProps) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [intervalHours, setIntervalHours] = useState<number | null>(null);
  const [customInterval, setCustomInterval] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setError('لطفاً تعداد معتبر وارد کنید (بیشتر از صفر).');
      return;
    }

    let hours = intervalHours;
    if (showCustom) {
      const customHours = parseInt(customInterval, 10);
      if (isNaN(customHours) || customHours <= 0) {
        setError('لطفاً بازه زمانی معتبر به ساعت وارد کنید.');
        return;
      }
      hours = customHours;
    }

    if (!hours) {
      setError('لطفاً یک بازه زمانی انتخاب کنید یا مقدار دلخواه وارد کنید.');
      return;
    }

    if (!name.trim()) {
      setError('نام دارو الزامی است.');
      return;
    }

    if (!dosage.trim()) {
      setError('دوز دارو الزامی است.');
      return;
    }

    onSubmit({
      name: name.trim(),
      dosage: dosage.trim(),
      quantity: qty,
      intervalHours: hours,
      interval: hours * 3600,
    });

    setName('');
    setDosage('');
    setQuantity('');
    setIntervalHours(null);
    setCustomInterval('');
    setShowCustom(false);
  };

  return (
    <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 max-w-md w-full mx-auto" dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">افزودن دارو</h2>
        <button
          onClick={onCancel}
          type="button"
          aria-label="انصراف از افزودن دارو"
          className="bg-gray-700 hover:bg-red-500/20 text-gray-300 hover:text-red-400 p-2 rounded-lg transition-colors duration-300"
        >
          ✖
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div
            className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="med-name" className="block text-gray-300 text-sm font-bold mb-2">
            نام دارو
          </label>
          <input
            id="med-name"
            type="text"
            required
            placeholder="مثال: آموکسی‌سیلین"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            className="w-full bg-gray-900 text-white placeholder-gray-500 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label htmlFor="med-dosage" className="block text-gray-300 text-sm font-bold mb-2">
            دوز
          </label>
          <input
            id="med-dosage"
            type="text"
            required
            placeholder="مثال: ۵۰۰ میلی‌گرم"
            value={dosage}
            onChange={(e) => {
              setDosage(e.target.value);
              setError(null);
            }}
            className="w-full bg-gray-900 text-white placeholder-gray-500 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label htmlFor="med-quantity" className="block text-gray-300 text-sm font-bold mb-2">
            تعداد کل (قرص / دوز)
          </label>
          <input
            id="med-quantity"
            type="number"
            required
            min="1"
            inputMode="numeric"
            placeholder="مثال: ۳۰"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setError(null);
            }}
            className="w-full bg-gray-900 text-white placeholder-gray-500 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-bold mb-2">
            هر چند وقت یک‌بار یادآوری شود؟
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRESET_INTERVALS.map((interval) => (
              <button
                key={interval.value}
                type="button"
                onClick={() => {
                  setIntervalHours(interval.value);
                  setShowCustom(false);
                  setCustomInterval('');
                  setError(null);
                }}
                className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 border ${
                  intervalHours === interval.value && !showCustom
                    ? 'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_10px_rgba(8,145,178,0.5)]'
                    : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {interval.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setShowCustom(true);
                setIntervalHours(null);
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 border ${
                showCustom
                  ? 'bg-cyan-600 border-cyan-500 text-white shadow-[0_0_10px_rgba(8,145,178,0.5)]'
                  : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              دلخواه...
            </button>
          </div>
        </div>

        {showCustom && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <label htmlFor="med-custom-interval" className="block text-gray-300 text-sm font-bold mb-2">
              بازه دلخواه (ساعت)
            </label>
            <input
              id="med-custom-interval"
              type="number"
              required={showCustom}
              min="1"
              inputMode="numeric"
              placeholder="مثال: ۵"
              value={customInterval}
              onChange={(e) => {
                setCustomInterval(e.target.value);
                setError(null);
              }}
              className="w-full bg-gray-900 text-white placeholder-gray-500 border border-cyan-700/50 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            />
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold py-4 px-6 rounded-xl text-lg transition-all duration-300 shadow-[0_4px_14px_0_rgba(16,185,129,0.4)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 active:scale-95 mt-4"
        >
          ثبت دارو
        </button>
      </form>
    </div>
  );
}
