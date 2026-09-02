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

  const [name, setName] = useState(initial?.name ?? '');
  const [dosage, setDosage] = useState(initial?.dosage ?? '');
  const [quantity, setQuantity] = useState(
    initial != null ? String(initial.quantity) : ''
  );
  const initialHours = initial?.intervalHours ?? 8;
  const isPreset = PRESETS.includes(initialHours);
  const [hours, setHours] = useState<number | null>(isPreset ? initialHours : null);
  const [custom, setCustom] = useState(isPreset ? '' : String(initialHours));
  const [startImmediately, setStartImmediately] = useState(!isEdit);
  const [error, setError] = useState('');

  // Keep form in sync when switching between different medications
  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setDosage(initial.dosage);
    setQuantity(String(initial.quantity));
    const h = initial.intervalHours ?? 8;
    if (PRESETS.includes(h)) {
      setHours(h);
      setCustom('');
    } else {
      setHours(null);
      setCustom(String(h));
    }
    setStartImmediately(false);
    setError('');
  }, [initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const qty = Number(quantity);
    const intervalHours = hours ?? Number(custom);

    if (!name.trim() || !dosage.trim()) {
      return setError('نام دارو و دوز را وارد کنید.');
    }
    // Allow quantity 0 when editing (empty stock); require > 0 on create
    if (!Number.isFinite(qty) || qty < 0 || (!isEdit && qty <= 0)) {
      return setError(isEdit ? 'تعداد نمی‌تواند منفی باشد.' : 'تعداد باید بیشتر از صفر باشد.');
    }
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
      return setError('بازه یادآوری معتبر نیست.');
    }

    onSubmit({
      name: name.trim(),
      dosage: dosage.trim(),
      quantity: qty,
      intervalHours,
      startImmediately: isEdit ? startImmediately : startImmediately,
    });
  };

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-bold">{isEdit ? 'ویرایش دارو' : 'افزودن دارو'}</h2>
        <button type="button" onClick={onCancel} className="rounded-lg bg-gray-700 px-3 py-2" aria-label="بستن">
          ✕
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <label className="block text-sm">
          نام دارو
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 p-3"
            placeholder="مثلاً Amoxicillin"
            autoFocus
          />
        </label>

        <label className="block text-sm">
          دوز
          <input
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 p-3"
            placeholder="500 mg"
          />
        </label>

        <label className="block text-sm">
          تعداد
          <input
            type="number"
            min={isEdit ? 0 : 1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 p-3"
            placeholder="30"
          />
        </label>

        <div>
          <p className="mb-2 text-sm">یادآوری هر چند ساعت؟</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setHours(v)}
                className={`rounded-lg border px-2 py-2 text-sm ${
                  hours === v ? 'border-cyan-400 bg-cyan-600' : 'border-gray-600 bg-gray-900'
                }`}
              >
                {v}h
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHours(null)}
              className={`rounded-lg border px-2 py-2 text-sm ${
                hours === null ? 'border-cyan-400 bg-cyan-600' : 'border-gray-600 bg-gray-900'
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {hours === null && (
          <input
            type="number"
            min={1}
            step={1}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Hours"
            className="w-full rounded-xl border border-cyan-700 bg-gray-900 p-3"
          />
        )}

        <label className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm">
          <input
            type="checkbox"
            checked={startImmediately}
            onChange={(e) => setStartImmediately(e.target.checked)}
            className="h-4 w-4"
          />
          {isEdit ? 'شروع / بازنشانی تایمر با ذخیره' : 'شروع اولین شمارش بلافاصله'}
        </label>

        <button className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-gray-950 hover:bg-emerald-400">
          {isEdit ? 'ذخیره تغییرات' : 'افزودن دارو'}
        </button>
      </form>
    </div>
  );
}
