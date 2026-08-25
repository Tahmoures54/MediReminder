import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { MedicationCard } from './components/MedicationCard';
import { AddMedicationForm } from './components/AddMedicationForm';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NotificationPopup } from './components/NotificationPopup';
import { ReportModal } from './components/ReportModal';
import { db, Medication, HistoryRecord } from './db/database';
import { initAllPermissions, checkNotificationPermission } from './utils/permissions';
import { playAlarm, stopAlarm, triggerHaptics } from './utils/audio';

const APP_VERSION='2.0.0';
const FOLLOW_UP_MINUTES=10;

type AlertItem={medication:Medication; title:string; message:string};

function normalize(m:Medication):Medication{
  const now=Date.now(); const interval=Number(m.interval)||Number(m.intervalHours)*3600;
  let next=m.nextDoseAt;
  if(m.running && !next) next=now+Math.max(1,m.remaining||interval)*1000;
  const remaining=next&&m.running?Math.max(0,Math.ceil((next-now)/1000)):Math.max(0,m.remaining||0);
  return {...m, interval, intervalHours:Number(m.intervalHours)||1, remaining, running:Boolean(m.running), pendingDose:Boolean(m.pendingDose), history:m.history||[], createdAt:m.createdAt||now, updatedAt:m.updatedAt||now, nextDoseAt:next};
}

function statusFor(m:Medication, takenAt:number):HistoryRecord['status']{
  if(!m.lastTakenAt) return 'on-time';
  const delta=takenAt-m.lastTakenAt; const target=m.interval*1000;
  if(delta<target-30*60*1000) return 'early';
  if(delta>target+60*60*1000) return 'late';
  return 'on-time';
}

export default function App(){
  const [medications,setMedications]=useState<Medication[]>([]);
  const [showAdd,setShowAdd]=useState(false); const [alert,setAlert]=useState<AlertItem|null>(null);
  const [confirm,setConfirm]=useState<{title:string;message:string;onConfirm:()=>void}|null>(null);
  const [report,setReport]=useState<Medication|null>(null);
  const [permission,setPermission]=useState('unknown'); const [isNative,setIsNative]=useState(false);
  const medsRef=useRef<Medication[]>([]); const alertId=useRef<number|null>(null); const syncKey=useRef('');
  useEffect(()=>{medsRef.current=medications},[medications]);

  const persist=useCallback(async(m:Medication)=>{await db.updateMedication(m)},[]);
  const load=useCallback(async()=>{const all=(await db.getAllMedications()).map(normalize); setMedications(all);},[]);

  const openAlert=useCallback((m:Medication)=>{if(alertId.current===m.id)return; alertId.current=m.id??null; setAlert({medication:m,title:'زمان مصرف دارو',message:`وقت مصرف ${m.name} (${m.dosage}) فرا رسیده است.`}); playAlarm(); triggerHaptics();},[]);
  const closeAlert=useCallback(()=>{stopAlarm();alertId.current=null;setAlert(null)},[]);

  useEffect(()=>{(async()=>{setIsNative(Capacitor.isNativePlatform()); const p=await initAllPermissions(); setPermission(p.notification?'granted':await checkNotificationPermission()); await load();})();},[load]);

  // Recalculate from absolute timestamps; timers are only for UI, never the source of truth.
  useEffect(()=>{const tick=async()=>{const now=Date.now(); const current=medsRef.current; let changed=false; const next=current.map(m=>{const n=normalize(m); if(n.running && n.nextDoseAt && n.nextDoseAt<=now){changed=true; const due={...n,running:false,pendingDose:true,remaining:0,updatedAt:now}; openAlert(due); return due;} if(n.running && n.remaining!==m.remaining){changed=true; return n;} return n;}); if(changed){setMedications(next); await Promise.all(next.filter((m,i)=>m!==current[i]).map(persist));}}; tick(); const id=window.setInterval(tick,1000); return()=>window.clearInterval(id)},[openAlert,persist]);

  // Native notification is scheduled from nextDoseAt only, so a one-second UI refresh never re-schedules it.
  useEffect(()=>{if(!isNative)return; const key=medications.map(m=>`${m.id}:${m.running}:${m.nextDoseAt}:${m.pendingDose}`).join('|'); if(key===syncKey.current)return; syncKey.current=key;(async()=>{try{const ids=medications.flatMap(m=>[0,1,2,3].map(slot=>Math.max(1,(m.id??0)*10+slot+100))); await LocalNotifications.cancel({notifications:ids.map(id=>({id}))}); const list=medications.filter(m=>m.running&&m.nextDoseAt&&m.nextDoseAt>Date.now()).flatMap(m=>[0,1,2,3].map(slot=>({id:Math.max(1,(m.id??0)*10+slot+100),title:slot===0?'💊 زمان مصرف دارو':'🔔 یادآوری مجدد دارو',body:`${m.name} — ${m.dosage}`,schedule:{at:new Date(m.nextDoseAt!+slot*10*60*1000)},channelId:'medication-alarms',sound:'medication_alarm.wav',extra:{medicationId:m.id,reminderSlot:slot}}))); if(list.length)await LocalNotifications.schedule({notifications:list});}catch(e){console.warn('Notification sync failed',e)}})()},[medications,isNative]);

  useEffect(()=>{if(!isNative)return; const listeners=[LocalNotifications.addListener('localNotificationReceived',n=>{const id=Number(n.extra?.medicationId); const m=medsRef.current.find(x=>x.id===id); if(m)openAlert({...m,pendingDose:true,running:false,remaining:0});}),LocalNotifications.addListener('localNotificationActionPerformed',e=>{const id=Number(e.notification.extra?.medicationId); const m=medsRef.current.find(x=>x.id===id); if(m)openAlert({...m,pendingDose:true,running:false,remaining:0});})]; return()=>{listeners.forEach(p=>p.then(x=>x.remove()))}},[isNative,openAlert]);

  const takeDose=useCallback(async(m:Medication)=>{const now=Date.now(); const record:HistoryRecord={id:crypto.randomUUID(),takenAt:now,scheduledAt:m.nextDoseAt,status:statusFor(m,now),snoozeCount:m.snoozeCount||0}; const updated:Medication={...m,quantity:Math.max(0,m.quantity-1),history:[...(m.history||[]),record],lastTakenAt:now,pendingDose:false,snoozeCount:0,running:true,nextDoseAt:now+m.interval*1000,remaining:m.interval,updatedAt:now}; setMedications(v=>v.map(x=>x.id===m.id?updated:x)); await persist(updated); closeAlert()},[closeAlert,persist]);
  const snooze=useCallback(async(m:Medication)=>{const now=Date.now(); const updated={...m,pendingDose:false,running:true,snoozeCount:(m.snoozeCount||0)+1,nextDoseAt:now+FOLLOW_UP_MINUTES*60*1000,remaining:FOLLOW_UP_MINUTES*60,updatedAt:now}; setMedications(v=>v.map(x=>x.id===m.id?updated:x)); await persist(updated); closeAlert()},[closeAlert,persist]);
  const toggle=async(m:Medication)=>{const now=Date.now(); const running=!m.running; const updated={...m,running,pendingDose:false,nextDoseAt:running?now+Math.max(1,m.remaining||m.interval)*1000:undefined,remaining:running?Math.max(1,m.remaining||m.interval):m.remaining,updatedAt:now}; setMedications(v=>v.map(x=>x.id===m.id?updated:x)); await persist(updated);};
  const reset=async(m:Medication)=>{const updated={...m,running:false,pendingDose:false,nextDoseAt:undefined,remaining:m.interval,snoozeCount:0,updatedAt:Date.now()};setMedications(v=>v.map(x=>x.id===m.id?updated:x));await persist(updated)};
  const add=async(d:{name:string;dosage:string;intervalHours:number;quantity:number;startImmediately:boolean})=>{const now=Date.now();const interval=d.intervalHours*3600;const m:Medication={name:d.name,dosage:d.dosage,quantity:d.quantity,intervalHours:d.intervalHours,interval,remaining:d.startImmediately?interval:interval,running:d.startImmediately,pendingDose:false,nextDoseAt:d.startImmediately?now+interval*1000:undefined,createdAt:now,updatedAt:now,history:[]};const id=await db.addMedication(m);setMedications(v=>[...v,{...m,id}]);setShowAdd(false)};
  const remove=(m:Medication)=>setConfirm({title:'حذف دارو',message:`آیا از حذف «${m.name}» مطمئن هستید؟`,onConfirm:async()=>{if(m.id)await db.deleteMedication(m.id);setMedications(v=>v.filter(x=>x.id!==m.id));setConfirm(null);if(alert?.medication.id===m.id)closeAlert()}});

  const exportBackup=async()=>{const payload=await db.exportBackup();const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`MediReminder-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url)};
  const importBackup=()=>{const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{const payload=JSON.parse(await file.text());await db.importBackup(payload);await load();alertId.current=null;setAlert(null)}catch(e){setConfirm({title:'پشتیبان نامعتبر',message:'فایل انتخاب‌شده قابل بازیابی نیست.',onConfirm:()=>setConfirm(null)})}};input.click()};

  const activeCount=useMemo(()=>medications.filter(m=>m.running).length,[medications]); const dueCount=useMemo(()=>medications.filter(m=>m.pendingDose).length,[medications]);
  return <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-slate-950 text-white"><div className="mx-auto max-w-lg px-4 py-6">
    <header className="mb-6"><div className="flex items-start justify-between gap-3"><div><h1 className="text-3xl font-black text-cyan-300">💊 MediReminder</h1><p className="mt-1 text-sm text-gray-400">یادآوری، ثبت و پیگیری مصرف دارو</p></div><span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">v{APP_VERSION}</span></div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-gray-800 p-3"><b className="block text-xl">{medications.length}</b><span className="text-xs text-gray-400">دارو</span></div><div className="rounded-xl bg-gray-800 p-3"><b className="block text-xl text-cyan-300">{activeCount}</b><span className="text-xs text-gray-400">فعال</span></div><div className="rounded-xl bg-gray-800 p-3"><b className="block text-xl text-red-300">{dueCount}</b><span className="text-xs text-gray-400">نیازمند اقدام</span></div></div>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>setShowAdd(true)} className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-gray-950">+ افزودن دارو</button><button onClick={exportBackup} className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm">⬇ پشتیبان</button><button onClick={importBackup} className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-sm">⬆ بازیابی</button></div>
      {permission!=='granted'&&<p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">اعلان‌ها فعال نیستند. برای یادآوری مطمئن، مجوز اعلان و صدای دستگاه را فعال کنید.</p>}
    </header>
    {showAdd&&<div className="mb-5"><AddMedicationForm onSubmit={add} onCancel={()=>setShowAdd(false)}/></div>}
    <div className="space-y-4">{medications.length===0?<div className="rounded-2xl border border-dashed border-gray-700 p-12 text-center"><div className="text-6xl">💊</div><h2 className="mt-4 text-xl font-bold">هنوز دارویی ثبت نشده</h2><p className="mt-2 text-sm text-gray-400">اولین دارو را اضافه کنید و یادآوری را شروع کنید.</p></div>:medications.map((m,i)=><MedicationCard key={m.id} medication={m} index={i+1} onToggle={()=>toggle(m)} onReset={()=>reset(m)} onDelete={()=>remove(m)} onShowReport={()=>setReport(m)} onTake={()=>takeDose(m)} onSnooze={()=>snooze(m)}/>)}</div>
    <footer className="mt-8 pb-8 text-center text-xs text-gray-500">داده‌های دارو روی همین دستگاه نگهداری می‌شوند. MediReminder ابزار یادآوری است و جایگزین توصیه پزشک نیست.</footer>
  </div>
  {alert&&<NotificationPopup title={alert.title} message={alert.message} onClose={closeAlert} onRestart={()=>takeDose(alert.medication)} onSnooze={()=>snooze(alert.medication)} isMedicationAlert/>}
  {report&&<ReportModal medication={report} onClose={()=>setReport(null)}/>} {confirm&&<ConfirmDialog title={confirm.title} message={confirm.message} onConfirm={confirm.onConfirm} onCancel={()=>setConfirm(null)}/>}</div>;
}
