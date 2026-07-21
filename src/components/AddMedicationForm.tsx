import { useState } from 'react';
import { Medication } from '../db/database';

interface AddMedicationFormProps {
  onSubmit: (medication: Omit<Medication, 'id' | 'remaining' | 'running'>) => void;
  onCancel: () => void;
}

const PRESET_INTERVALS = [
  { label: '4 hours', value: 4 },
  { label: '6 hours', value: 6 },
  { label: '8 hours', value: 8 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
  { label: '48 hours', value: 48 },
  { label: '72 hours', value: 72 },
  { label: '1 week (168 hours)', value: 168 },
];

export function AddMedicationForm({ onSubmit, onCancel }: AddMedicationFormProps) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [intervalHours, setIntervalHours] = useState<number | null>(null);
  const [customInterval, setCustomInterval] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !dosage.trim() || !quantity.trim()) {
      alert('Please fill all fields correctly.\nName, dosage, and quantity are required.');
      return;
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      alert('Please enter a valid quantity.');
      return;
    }

    let hours = intervalHours;
    if (showCustom) {
      const customHours = parseInt(customInterval);
      if (isNaN(customHours) || customHours <= 0) {
        alert('Please enter a valid custom interval in hours.');
        return;
      }
      hours = customHours;
    }

    if (!hours) {
      alert('Please select a valid interval or enter custom hours.');
      return;
    }

    onSubmit({
      name: name.trim(),
      dosage: dosage.trim(),
      quantity: qty,
      intervalHours: hours,
      interval: hours * 3600, // Convert to seconds
    });

    // Reset form
    setName('');
    setDosage('');
    setQuantity('');
    setIntervalHours(null);
    setCustomInterval('');
    setShowCustom(false);
  };

  return (
    <div className="bg-gray-800 rounded-2xl p-5 shadow-xl border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Add New Medication</h2>
        <button
          onClick={onCancel}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-all duration-300"
        >
          ✖ Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="Medication name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <input
            type="text"
            placeholder="Dosage (e.g., 500mg)"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            className="w-full bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <input
            type="number"
            placeholder="Quantity (pills)"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="0"
            className="w-full bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="block text-gray-300 text-sm font-bold mb-2">
            Select Interval
          </label>
          <div className="grid grid-cols-2 gap-2">
            {PRESET_INTERVALS.map((interval) => (
              <button
                key={interval.value}
                type="button"
                onClick={() => {
                  setIntervalHours(interval.value);
                  setShowCustom(false);
                }}
                className={`py-2 px-4 rounded-lg font-semibold transition-all duration-300 ${
                  intervalHours === interval.value && !showCustom
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {interval.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCustom(!showCustom)}
              className={`py-2 px-4 rounded-lg font-semibold transition-all duration-300 ${
                showCustom
                  ? 'bg-cyan-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Custom...
            </button>
          </div>
        </div>

        {showCustom && (
          <div>
            <input
              type="number"
              placeholder="Enter custom hours"
              value={customInterval}
              onChange={(e) => setCustomInterval(e.target.value)}
              min="1"
              className="w-full bg-gray-700 text-white placeholder-gray-400 border border-gray-600 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>
        )}

        <button
          type="submit"
          className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-300 shadow-lg shadow-green-500/30"
        >
          ✅ Add Medication
        </button>
      </form>
    </div>
  );
}
