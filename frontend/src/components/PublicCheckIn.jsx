import { useEffect, useState } from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { publicCheckInApi } from '../api/client';
import { describeError } from '../lib/apiErrors';
import { CENTRE } from '../lib/config';
import { BrandMark } from './Sidebar';
import { Button, Card, cx, Input } from './ui';

// QR check-in on a student's phone (Phase I): #/hadir/<room> from the QR in a classroom, or #/hadir with the code only.
// Code on the whiteboard → own name → last 4 IC digits the first time on this phone → Hadir or Lewat.
// The server keeps the rules (backend/students/checkin.py); this phone keeps only a random number of its own, so it is
// not asked for the IC digits again.

const DEVICE_KEY = 'annur_checkin_device';
function deviceId() {
  const make = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = make(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    return make(); // storage blocked: asked for the IC digits each time
  }
}

const STATUS = { PRESENT: { label: 'Hadir', tone: 'text-brand-700' }, LATE: { label: 'Lewat', tone: 'text-amber-700' } };

export default function PublicCheckIn({ room }) {
  const [roomInfo, setRoomInfo] = useState(null);
  const [roomError, setRoomError] = useState('');
  const [code, setCode] = useState('');
  const [klass, setKlass] = useState(null);
  const [picked, setPicked] = useState(null);
  const [ic, setIc] = useState('');
  const [askIc, setAskIc] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (room) publicCheckInApi.room(room).then(setRoomInfo).catch((err) => setRoomError(err.data?.detail || 'Kod QR bilik ini tidak dikenali.'));
  }, [room]);

  const failed = (err) => setError(err.status === 429 ? 'Terlalu banyak cubaan. Cuba lagi sebentar lagi.' : Object.values(err.data || {}).flat().join(' ') || describeError(err));

  const openClass = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { setKlass(await publicCheckInApi.code(code, room)); } catch (err) { failed(err); } finally { setBusy(false); }
  };

  const checkIn = async (student, digits) => {
    setError('');
    setBusy(true);
    try {
      const res = await publicCheckInApi.mark({ code, room: room || undefined, student: student.id, device: deviceId(), ...(digits ? { ic_last4: digits } : {}) });
      setDone(res);
    } catch (err) {
      if (err.data?.needs_ic) { setAskIc(true); setPicked(student); } else failed(err);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="mb-6 flex items-center gap-3">
      <BrandMark />
      <div>
        <p className="font-semibold text-gray-900">{CENTRE.name}</p>
        <p className="text-[13px] text-gray-500">Kedatangan{roomInfo ? ` · ${roomInfo.room}` : ''}</p>
      </div>
    </div>
  );
  const open = roomInfo?.classes.filter((c) => c.state === 'OPEN') ?? [];
  const next = roomInfo?.classes.find((c) => c.state === 'SOON');

  if (done) {
    const st = STATUS[done.status] ?? STATUS.PRESENT;
    return (
      <div className="mx-auto max-w-md">
        {header}
        <Card className="p-6 text-center">
          <CheckCircle2 className={cx('mx-auto size-14', st.tone)} />
          <p className={cx('mt-3 text-3xl font-bold', st.tone)}>{st.label}</p>
          <p className="mt-2 text-lg font-medium text-gray-900">{done.name}</p>
          <p className="text-sm text-gray-600">{done.class.subject} · {done.class.start}–{done.class.end} · {done.time}</p>
          {done.already && <p className="mt-3 text-sm text-gray-500">Kedatangan anda sudah direkod tadi.</p>}
          <Button size="lg" className="mt-6 w-full" onClick={() => { setDone(null); setPicked(null); setAskIc(false); setIc(''); }}>Pelajar lain</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      {header}
      {roomError && <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{roomError}</p>}

      {!klass ? (
        <form onSubmit={openClass}>
          <Card className="p-5">
            <h1 className="text-xl font-semibold text-gray-900">Rekod kedatangan</h1>
            {roomInfo && (open.length ? (
              <p className="mt-1 text-sm text-gray-600">Kelas sekarang: <span className="font-medium text-gray-900">{open.map((c) => `${c.subject} (${c.start}–${c.end})`).join(', ')}</span></p>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                <Clock className="size-4" /> {next ? `Kelas seterusnya ${next.subject}, imbasan dibuka ${next.opens}.` : 'Tiada kelas dibuka dalam bilik ini sekarang.'}
              </p>
            ))}
            <Input
              className="mt-4" label="Kod kelas" required inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" placeholder="4 digit"
              hint="Kod tertulis di papan putih." value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Card>
          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={busy || code.length !== 4}>{busy ? 'Menyemak…' : 'Teruskan'}</Button>
        </form>
      ) : askIc && picked ? (
        <form onSubmit={(e) => { e.preventDefault(); checkIn(picked, ic); }}>
          <Card className="p-5">
            <h1 className="text-xl font-semibold text-gray-900">{picked.name}</h1>
            <p className="mt-1 text-sm text-gray-600">Kali pertama di telefon ini: masukkan 4 digit akhir No. K/P anda. Selepas ini telefon ini diingati.</p>
            <Input className="mt-4" label="4 digit akhir No. K/P" required inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}"
              value={ic} onChange={(e) => setIc(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </Card>
          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={busy || ic.length !== 4}>{busy ? 'Menyemak…' : 'Rekod kehadiran'}</Button>
          <Button size="lg" className="mt-2 w-full" onClick={() => { setAskIc(false); setPicked(null); setError(''); }}>Bukan nama saya</Button>
        </form>
      ) : (
        <>
          <Card className="p-5">
            <h1 className="text-xl font-semibold text-gray-900">{klass.subject}</h1>
            <p className="text-sm text-gray-600">{klass.start}–{klass.end}{klass.room ? ` · ${klass.room}` : ''} · lewat selepas {klass.late_after}</p>
            <p className="mt-3 text-sm font-medium text-gray-700">Tekan nama anda:</p>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {klass.students.map((s) => (
                <button key={s.id} type="button" disabled={busy} onClick={() => checkIn(s)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-left text-base font-medium text-gray-900 hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60">
                  {s.name}
                </button>
              ))}
            </div>
          </Card>
          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button size="lg" className="mt-4 w-full" onClick={() => { setKlass(null); setError(''); }}>Tukar kod kelas</Button>
        </>
      )}
    </div>
  );
}
