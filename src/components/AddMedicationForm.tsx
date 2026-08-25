import { useState } from 'react';

interface Props {
  onSubmit: (data: { name: string; dosage: string; intervalHours: number; quantity: number; startImmediately: boolean }) => void;
  onCancel: () => void;
}

const PRESETS = [4, 6, 8, 12, 24, 48, 72, 168];

export function AddMedicationForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState('');
  const [hours, setHours] = useState<number | null>(8);
  const [custom, setCustom] = useState('');
  const [startImmediately, setStartImmediately] = useState(true);
  const [error, setError] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const qty = Number(quantity); const intervalHours = hours ?? Number(custom);
    if (!name.trim() || !dosage.trim()) return setError('نام دارو و دوز را وارد کنید.');
    if (!Number.isFinite(qty) || qty <= 0) return setError('تعداد باید بیشتر از صفر باشد.');
    if (!Number.isFinite(intervalHours) || intervalHours <= 0) return setError('بازه یادآوری معتبر نیست.');
    onSubmit({ name: name.trim(), dosage: dosage.trim(), quantity: qty, intervalHours, startImmediately });
  };

  return <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 shadow-xl">
    <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">افزودن دارو</h2><button type="button" onClick={onCancel} className="rounded-lg bg-gray-700 px-3 py-2">✕</button></div>
    <form onSubmit={submit} className="space-y-4">
      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <label className="block text-sm">نام دارو<input value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 p-3" placeholder="مثلاً Amoxicillin" /></label>
      <label className="block text-sm">دوز<input value={dosage} onChange={e=>setDosage(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 p-3" placeholder="500 mg" /></label>
      <label className="block text-sm">تعداد<input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-600 bg-gray-900 p-3" placeholder="30" /></label>
      <div><p className="mb-2 text-sm">یادآوری هر چند ساعت؟</p><div className="grid grid-cols-4 gap-2">{PRESETS.map(v=><button key={v} type="button" onClick={()=>setHours(v)} className={`rounded-lg border px-2 py-2 text-sm ${hours===v?'border-cyan-400 bg-cyan-600':'border-gray-600 bg-gray-900'}`}>{v}h</button>)}<button type="button" onClick={()=>setHours(null)} className={`rounded-lg border px-2 py-2 text-sm ${hours===null?'border-cyan-400 bg-cyan-600':'border-gray-600 bg-gray-900'}`}>Custom</button></div></div>
      {hours===null && <input type="number" min="1" step="1" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="Hours" className="w-full rounded-xl border border-cyan-700 bg-gray-900 p-3" />}
      <label className="flex items-center gap-3 rounded-xl border border-gray-700 bg-gray-900 p-3 text-sm"><input type="checkbox" checked={startImmediately} onChange={e=>setStartImmediately(e.target.checked)} className="h-4 w-4" /> شروع اولین شمارش بلافاصله</label>
      <button className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-gray-950 hover:bg-emerald-400">افزودن دارو</button>
    </form>
  </div>;
}
