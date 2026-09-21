import { useEffect, useState } from 'react';
import type { Medication } from '../db/database';

interface FormData {
  name: string;
  condition: string;
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
const MAX_INTERVAL_HOURS = 720;

function presetLabel(hours: number): string {
  if (hours === 168) return 'هفتگی';
  if (hours === 72) return '۳ روز';
  if (hours === 48) return '۲ روز';
  return `${hours} ساعت`;
}

export function AddMedicationForm({ initial, onSubmit, onCancel }: Props) {
  const isEdit = Boolean(initial?.id);

  const getInitialFormState = (med?: Medication) => {
    if (!med) {
      return {
        name: '',
        condition: '',
        dosage: '',
        quantity: '',
        hours: 8,
        custom: '',
        startImmediately: true,
      };
    }
    const h = med.intervalHours ?? 8;
    const isPreset = PRESETS.includes(h);
    return {
      name: med.name,
      condition: med.condition ?? '',
      dosage: med.dosage,
      quantity: String(med.quantity),
      hours: isPreset ? h : null,
      custom: isPreset ? '' : String(h),
      startImmediately: false,
    };
  };

  const initialForm = getInitialFormState(initial);
  const [name, setName] = useState(initialForm.name);
  const [condition, setCondition] = useState(initialForm.condition);
  const [dosage, setDosage] = useState(initialForm.dosage);
  const [quantity, setQuantity] = useState(initialForm.quantity);
  const [hours, setHours] = useState<number | null>(initialForm.hours);
  const [custom, setCustom] = useState(initialForm.custom);
  const [startImmediately, setStartImmediately] = useState(initialForm.startImmediately);
  const [error, setError] = useState('');

  useEffect(() => {
    const newState = getInitialFormState(initial);
    setName(newState.name);
    setCondition(newState.condition);
    setDosage(newState.dosage);
    setQuantity(newState.quantity);
    setHours(newState.hours);
    setCustom(newState.custom);
    setStartImmediately(newState.startImmediately);
    setError('');
  }, [initial?.id]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !dosage.trim()) {
      return setError('نام دارو و دوز را وارد کنید.');
    }

    if (quantity.trim() === '') {
      return setError('تعداد را وارد کنید.');
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0 || (!isEdit && qty <= 0)) {
      return setError(isEdit ? 'تعداد نمی‌تواند منفی باشد.' : 'تعداد باید بیشتر از صفر باشد.');
    }

    const intervalHours = hours ?? Number(custom);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
      return setError('بازه یادآوری معتبر نیست.');
    }
    if (intervalHours > MAX_INTERVAL_HOURS) {
      return setError('بازه یادآوری نمی‌تواند بیشتر از ۳۰ روز باشد.');
    }

    onSubmit({
      name: name.trim(),
      condition: condition.trim(),
      dosage: dosage.trim(),
      quantity: qty,
      intervalHours,
      startImmediately,
    });
  };

  // Scroll into view on mobile when focused
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Delay to allow keyboard to appear
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  return (
    <div className="rounded-3xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{isEdit ? 'ویرایش دارو' : 'افزودن دارو'}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="tap-target rounded-xl border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10 active:scale-95 touch-manipulation"
          aria-label="بستن فرم"
        >
          ✕
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        {error && (
          <div
            role="alert"
            className="animate-slide-in-from-top rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm leading-relaxed text-red-300"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="med-name" className="block text-sm font-medium text-slate-300">
            نام دارو <span className="text-rose-400">*</span>
          </label>
          <input
            id="med-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={handleFocus}
            className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            placeholder="مثلاً Amoxicillin"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            enterKeyHint="next"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="med-condition" className="block text-sm font-medium text-slate-300">
            بیماری مرتبط <span className="text-xs font-normal text-slate-500">(اختیاری)</span>
          </label>
          <input
            id="med-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            onFocus={handleFocus}
            className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            placeholder="مثلاً فشار خون یا دیابت"
            autoComplete="off"
            inputMode="text"
            enterKeyHint="next"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="med-dosage" className="block text-sm font-medium text-slate-300">
              دوز <span className="text-rose-400">*</span>
            </label>
            <input
              id="med-dosage"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              onFocus={handleFocus}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="500 mg"
              autoComplete="off"
              inputMode="text"
              enterKeyHint="next"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="med-quantity" className="block text-sm font-medium text-slate-300">
              تعداد <span className="text-rose-400">*</span>
            </label>
            <input
              id="med-quantity"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantity}
              onChange={(e) => {
                // Only allow numbers
                const v = e.target.value.replace(/[^0-9]/g, '');
                setQuantity(v);
              }}
              onFocus={handleFocus}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="30"
              enterKeyHint="next"
            />
          </div>
        </div>

        <div>
          <p className="mb-2.5 text-sm font-medium text-slate-300">یادآوری هر چند ساعت؟</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setHours(v)}
                className={`tap-target rounded-xl border px-2 py-3 text-sm font-medium transition-all touch-manipulation active:scale-[0.96] ${
                  hours === v
                    ? 'border-cyan-400 bg-cyan-600 text-white shadow-md shadow-cyan-900/30'
                    : 'border-slate-600 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:border-slate-500'
                }`}
              >
                {presetLabel(v)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHours(null)}
              className={`tap-target rounded-xl border border-dashed px-2 py-3 text-sm font-medium transition-all touch-manipulation active:scale-[0.96] ${
                hours === null
                  ? 'border-cyan-400 bg-cyan-600 text-white shadow-md'
                  : 'border-slate-500 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              سفارشی
            </button>
          </div>
        </div>

        {hours === null && (
          <div className="animate-slide-in-from-top space-y-1.5">
            <label htmlFor="custom-hours" className="block text-sm font-medium text-slate-300">
              بازه سفارشی (ساعت)
            </label>
            <input
              id="custom-hours"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ''))}
              onFocus={handleFocus}
              placeholder="مثلاً ۱۰"
              className="w-full rounded-xl border border-cyan-700 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              enterKeyHint="done"
            />
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm transition hover:bg-slate-900 active:scale-[0.99] touch-manipulation">
          <input
            type="checkbox"
            checked={startImmediately}
            onChange={(e) => setStartImmediately(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-600 bg-slate-900 accent-cyan-500"
          />
          <span className="leading-relaxed text-slate-300">
            {isEdit ? 'شروع / بازنشانی تایمر با ذخیره' : 'شروع اولین شمارش بلافاصله'}
            <span className="mt-1 block text-xs text-slate-500">
              {isEdit ? 'تایمر با بازه جدید دوباره شروع می‌شود' : 'اگر خاموش باشد، بعداً دستی شروع کنید'}
            </span>
          </span>
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 text-[15px] font-bold text-slate-200 transition active:scale-[0.97] hover:bg-white/10 touch-manipulation"
          >
            انصراف
          </button>
          <button
            type="submit"
            className="flex-[1.5] rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 py-4 text-[15px] font-bold text-slate-950 shadow-lg shadow-emerald-900/30 transition active:scale-[0.97] hover:from-emerald-300 hover:to-emerald-500 touch-manipulation"
          >
            {isEdit ? 'ذخیره تغییرات' : 'افزودن دارو'}
          </button>
        </div>
      </form>
    </div>
  );
}
