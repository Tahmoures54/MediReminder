import { useEffect, useRef, useState } from 'react';
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
  /** May return a Promise; the form disables submit while it is pending. */
  onSubmit: (data: FormData) => void | Promise<void>;
  onCancel: () => void;
}

const PRESETS = [4, 6, 8, 12, 24, 48, 72, 168];
const MAX_INTERVAL_HOURS = 720;
const MAX_QUANTITY = 10_000;

/** Convert Persian (۰-۹), Arabic-Indic (٠-٩), and fullwidth (０-９) digits to ASCII. */
function toAsciiDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d)));
}

/** Strip everything except ASCII digits after normalizing Persian/Arabic numerals. */
function digitsOnly(input: string): string {
  return toAsciiDigits(input).replace(/[^0-9]/g, '');
}

function presetLabel(hours: number): string {
  if (hours === 168) return 'هفتگی';
  if (hours === 72) return '۳ روز';
  if (hours === 48) return '۲ روز';
  return `${hours} ساعت`;
}

interface FormState {
  name: string;
  condition: string;
  dosage: string;
  quantity: string;
  hours: number | null;
  custom: string;
  startImmediately: boolean;
}

function getInitialFormState(med?: Medication): FormState {
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
}

export function AddMedicationForm({ initial, onSubmit, onCancel }: Props) {
  const isEdit = Boolean(initial?.id);

  // Lazy init: getInitialFormState runs once, not on every keystroke.
  const [name, setName] = useState<string>(() => getInitialFormState(initial).name);
  const [condition, setCondition] = useState<string>(() => getInitialFormState(initial).condition);
  const [dosage, setDosage] = useState<string>(() => getInitialFormState(initial).dosage);
  const [quantity, setQuantity] = useState<string>(() => getInitialFormState(initial).quantity);
  const [hours, setHours] = useState<number | null>(() => getInitialFormState(initial).hours);
  const [custom, setCustom] = useState<string>(() => getInitialFormState(initial).custom);
  const [startImmediately, setStartImmediately] = useState<boolean>(
    () => getInitialFormState(initial).startImmediately
  );
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<'name' | 'dosage' | 'quantity' | 'interval' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Stable reference so a parent re-render doesn't retrigger the reset.
  // We intentionally react only to `initial.id` changes (switching meds).
  const initialIdRef = useRef(initial?.id);
  useEffect(() => {
    if (initialIdRef.current === initial?.id) return;
    initialIdRef.current = initial?.id;
    const s = getInitialFormState(initial);
    setName(s.name);
    setCondition(s.condition);
    setDosage(s.dosage);
    setQuantity(s.quantity);
    setHours(s.hours);
    setCustom(s.custom);
    setStartImmediately(s.startImmediately);
    setError('');
    setErrorField(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setErrorField(null);

    if (!name.trim() || !dosage.trim()) {
      const which = !name.trim() ? 'name' : 'dosage';
      setErrorField(which);
      setError('نام دارو و دوز را وارد کنید.');
      return;
    }

    if (quantity.trim() === '') {
      setErrorField('quantity');
      setError('تعداد را وارد کنید.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      setErrorField('quantity');
      setError('تعداد واردشده معتبر نیست.');
      return;
    }
    if (!isEdit && qty <= 0) {
      setErrorField('quantity');
      setError('تعداد باید بیشتر از صفر باشد.');
      return;
    }
    if (qty > MAX_QUANTITY) {
      setErrorField('quantity');
      setError(`تعداد نمی‌تواند بیشتر از ${MAX_QUANTITY} باشد.`);
      return;
    }

    const intervalHours = hours ?? Number(custom);
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
      setErrorField('interval');
      setError('بازه یاددآوری معتبر نیست.');
      return;
    }
    if (intervalHours > MAX_INTERVAL_HOURS) {
      setErrorField('interval');
      setError('بازه یادآوری نمی‌تواند بیشتر از ۳۰ روز باشد.');
      return;
    }

    const payload: FormData = {
      name: name.trim(),
      condition: condition.trim(),
      dosage: dosage.trim(),
      quantity: qty,
      intervalHours,
      startImmediately,
    };

    // Await so double-tap cannot create two medications.
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      console.error('[AddMedicationForm] onSubmit failed', err);
      setError('ثبت انجام نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    window.setTimeout(() => {
      if (!target.isConnected || document.activeElement !== target) return;

      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const rect = target.getBoundingClientRect();
      const margin = 20;

      if (rect.top < viewportTop + margin || rect.bottom > viewportBottom - margin) {
        target.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      }
    }, 250);
  };

  const describedBy = (field: typeof errorField) =>
    error && errorField === field ? 'form-error' : undefined;

  return (
    <div className="rounded-3xl border border-slate-700/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-5 shadow-xl shadow-black/30 backdrop-blur-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{isEdit ? 'ویرایش دارو' : 'افزودن دارو'}</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="tap-target rounded-xl border border-white/10 bg-white/5 text-sm text-slate-200 transition hover:bg-white/10 active:scale-95 touch-manipulation disabled:opacity-50"
          aria-label="بستن فرم"
        >
          ✕
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        {!isEdit && (
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.07] p-3 text-xs leading-relaxed text-cyan-50/90">
            فاصله یادآوری را مطابق دستور پزشک یا داروساز وارد کنید. برنامه خودش زمان یا مقدار درمان را تعیین نمی‌کند.
          </div>
        )}
        {error && (
          <div
            id="form-error"
            role="alert"
            aria-live="polite"
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
            aria-invalid={errorField === 'name' || undefined}
            aria-describedby={describedBy('name')}
            className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            placeholder="مثلاً Amoxicillin"
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
              aria-invalid={errorField === 'dosage' || undefined}
              aria-describedby={describedBy('dosage')}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="500 mg"
              autoComplete="off"
              inputMode="text"
              enterKeyHint="next"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="med-quantity" className="block text-sm font-medium text-slate-300">
              تعداد دوزهای موجود <span className="text-rose-400">*</span>
            </label>
            <p className="text-xs leading-relaxed text-slate-500">
              تعداد نوبت‌های مصرف باقی‌مانده؛ با هر «مصرف کردم» یک دوز کم می‌شود.
            </p>
            <input
              id="med-quantity"
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(digitsOnly(e.target.value))}
              onFocus={handleFocus}
              aria-invalid={errorField === 'quantity' || undefined}
              aria-describedby={describedBy('quantity')}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3.5 text-[16px] text-white placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="مثلاً ۳۰ نوبت"
              enterKeyHint="next"
            />
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-slate-200">فاصله بین یادآوری‌ها</p>
          <p className="mb-2.5 text-xs leading-relaxed text-slate-500">
            مثلاً با انتخاب ۸ ساعت، اولین یادآوری حدود ۸ ساعت پس از شروع شمارش می‌رسد.
          </p>
          <div
            role="group"
            aria-label="فاصله بین یادآوری‌ها"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setHours(v)}
                aria-pressed={hours === v}
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
              aria-pressed={hours === null}
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
              value={custom}
              onChange={(e) => setCustom(digitsOnly(e.target.value))}
              onFocus={handleFocus}
              placeholder="مثلاً ۱۰"
              aria-invalid={errorField === 'interval' || undefined}
              aria-describedby={describedBy('interval')}
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
            {isEdit ? 'شروع / بازنشانی یادآوری با ذخیره' : 'فعال‌کردن یادآوری بعد از ذخیره'}
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              {isEdit
                ? 'شمارش با فاصله جدید از همین لحظه شروع می‌شود'
                : 'روشن: اولین یادآوری پس از پایان فاصله انتخابی می‌رسد. خاموش: دارو ثبت می‌شود اما باید یادآوری را بعداً دستی شروع کنید.'}
            </span>
          </span>
        </label>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="tap-target flex-1 rounded-2xl border border-white/10 bg-white/5 py-4 text-[15px] font-bold text-slate-200 transition active:scale-[0.97] hover:bg-white/10 touch-manipulation disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="tap-target flex-[1.5] rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 py-4 text-[15px] font-bold text-slate-950 shadow-lg shadow-emerald-900/30 transition active:scale-[0.97] hover:from-emerald-300 hover:to-emerald-500 touch-manipulation disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'در حال ذخیره…' : isEdit ? 'ذخیره تغییرات' : 'ثبت دارو'}
          </button>
        </div>
      </form>
    </div>
  );
}
