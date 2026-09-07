import { useEffect, useState } from 'react';
import type { Medication } from '../db/database';

interface FormData {
  name: string;
  dosage: string;
  intervalHours: number;
  quantity: number;
  startImmediately: boolean;
}

interface Props {
  /** When provided, form works in edit mode. */
  initial?: Medication;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
}

const PRESETS = [4, 6, 8, 12, 24, 48, 72, 168];

export function AddMedicationForm({ initial, onSubmit, onCancel }: Props) {
  const isEdit = Boolean(initial?.id);

  // Helper to initialize or reset form states
  const getInitialFormState = (med?: Medication) => {
    if (!med) {
      // Add mode defaults
      return {
        name: '',
        dosage: '',
        quantity: '',
        hours: 8, // default preset
        custom: '',
        startImmediately: true,
      };
    }
    // Edit mode
    const h = med.intervalHours ?? 8;
    const isPreset = PRESETS.includes(h);
    return {
      name: med.name,
      dosage: med.dosage,
      quantity: String(med.quantity),
      hours: isPreset ? h : null,
      custom: isPreset ? '' : String(h),
      startImmediately: false,
    };
  };

  const initialForm = getInitialFormState(initial);
  const [name, setName] = useState(initialForm.name);
  const [dosage, setDosage] = useState(initialForm.dosage);
  const [quantity, setQuantity] = useState(initialForm.quantity);
  const [hours, setHours] = useState<number | null>(initialForm.hours);
  const [custom, setCustom] = useState(initialForm.custom);
  const [startImmediately, setStartImmediately] = useState(initialForm.startImmediately);
  const [error, setError] = useState('');

  // Sync form when initial changes (including switching to add mode)
  useEffect(() => {
    const newState = getInitialFormState(initial);
    setName(newState.name);
    setDosage(newState.dosage);
    setQuantity(newState.quantity);
    setHours(newState.hours);
    setCustom(newState.custom);
    setStartImmediately(newState.startImmediately);
    setError('');
  }, [initial?.id]); // Depend on id only to avoid unnecessary resets

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    // Validate name and dosage
    if (!name.trim() || !dosage.trim()) {
      return setError('نام دارو و دوز را وارد کنید.');
    }

    // Validate quantity: non-empty, finite, non-negative, and >0 in add mode
    if (quantity.trim() === '') {
      return setError('تعداد را وارد کنید.');
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0 || (!isEdit && qty <= 0)) {
      return setError(isEdit ? 'تعداد نمی‌تواند منفی باشد.' : 'تعداد باید بیشتر از صفر باشد.');
    }

    // Validate interval hours
    const intervalHours = hours ?? Number(custom);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
      return setError('بازه یادآوری معتبر نیست.');
    }

    onSubmit({
      name: name.trim(),
      dosage: dosage.trim(),
      quantity: qty,
      intervalHours,
      startImmediately,
    });
  };

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">{isEdit ? 'ویرایش دارو' : 'افزودن دارو'}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-gray-700 px-3 py-2 hover:bg-gray-600"
          aria-label="بستن"
        >
          ✕
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="med-name" className="block text-sm">
            نام دارو
          </label>
          <input
            id="med-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-900 p-3"
            placeholder="مثلاً Amoxicillin"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="med-dosage" className="block text-sm">
            دوز
          </label>
          <input
            id="med-dosage"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-900 p-3"
            placeholder="500 mg"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="med-quantity" className="block text-sm">
            تعداد
          </label>
          <input
            id="med-quantity"
            type="number"
            min={isEdit ? 0 : 1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-600 bg-gray-900 p-3"
            placeholder="30"
          />
        </div>

        <div>
          <p className="mb-2 text-sm">یادآوری هر چند ساعت؟</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setHours(v)}
                className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                  hours === v
                    ? 'border-cyan-400 bg-cyan-600 text-white'
                    : 'border-gray-600 bg-gray-900 hover:bg-gray-700'
                }`}
              >
                {v}h
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHours(null)}
              className={`rounded-lg border border-dashed px-2 py-2 text-sm transition-colors ${
                hours === null
                  ? 'border-cyan-400 bg-cyan-600 text-white'
                  : 'border-gray-500 bg-gray-900 hover:bg-gray-700'
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {hours === null && (
          <div className="space-y-1">
            <label htmlFor="custom-hours" className="block text-sm">
              بازه سفارشی (ساعت)
            </label>
            <input
              id="custom-hours"
              type="number"
              min={1}
              step={1}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Hours"
              className="mt-1 w-full rounded-xl border border-cyan-700 bg-gray-900 p-3"
            />
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm">
          <input
            type="checkbox"
            checked={startImmediately}
            onChange={(e) => setStartImmediately(e.target.checked)}
            className="h-4 w-4 accent-cyan-500"
          />
          {isEdit ? 'شروع / بازنشانی تایمر با ذخیره' : 'شروع اولین شمارش بلافاصله'}
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-gray-950 transition-colors hover:bg-emerald-400"
        >
          {isEdit ? 'ذخیره تغییرات' : 'افزودن دارو'}
        </button>
      </form>
    </div>
  );
}
