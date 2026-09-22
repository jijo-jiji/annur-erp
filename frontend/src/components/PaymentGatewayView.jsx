import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, CheckCircle2, Landmark, Loader2, Lock, Printer, QrCode } from 'lucide-react';
import { CENTRE } from '../data/demo';
import { useStore } from '../store';
import { invoiceBalance } from '../lib/domain';
import { rm, todayISO } from '../lib/format';
import { InvoiceLines, ReceiptDocument } from './BillingView';
import { BrandMark } from './Sidebar';
import { Button, Card, cx, EmptyState } from './ui';

// Simulated payment gateway for client demos. No money moves and no bank or
// card details are collected: the "bank" step is a single confirm button.

const BANKS = ['Maybank', 'CIMB', 'Bank Islam', 'Bank Rakyat', 'RHB', 'Public Bank', 'BSN', 'AmBank', 'Hong Leong Bank', 'Affin Bank'];

export default function PaymentGatewayView({ invoiceNo }) {
  const { invoices, students, recordPayment } = useStore();
  const inv = invoices.find((i) => i.no === invoiceNo);
  const s = students.find((x) => x.id === inv?.studentId);
  const [method, setMethod] = useState('FPX');
  const [bank, setBank] = useState('');
  const [step, setStep] = useState('choose'); // choose → bank → processing → done
  const [receipt, setReceipt] = useState(null);
  const [qr, setQr] = useState('');
  const amount = inv ? invoiceBalance(inv) : 0;

  useEffect(() => {
    if (method !== 'DUITNOW_QR' || !inv) return;
    QRCode.toDataURL(`DEMO-DUITNOW|${CENTRE.name}|${inv.no}|${amount.toFixed(2)}`, { width: 360, margin: 1 }).then(setQr);
  }, [method, inv, amount]);

  const pay = () => {
    setStep('processing');
    setTimeout(() => {
      const ref = `${method === 'FPX' ? 'FPX' : 'DN'}${Date.now().toString().slice(-10)}`;
      const r = recordPayment(inv.no, { amount, method, ref, date: todayISO(), by: 'Pembayaran dalam talian' });
      setReceipt(r);
      setStep('done');
    }, 1600);
  };

  return (
    <div className="min-h-dvh bg-gray-100">
      <div className="bg-amber-100 px-4 py-2 text-center text-[13px] font-medium text-amber-900">
        Mod demo — ini simulasi gerbang pembayaran. Tiada wang sebenar dipindahkan.
      </div>
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-semibold text-gray-900">{CENTRE.name}</p>
            <p className="flex items-center gap-1 text-[13px] text-gray-500">
              <Lock className="size-3" /> Pembayaran selamat
            </p>
          </div>
        </div>

        {!inv ? (
          <Card>
            <EmptyState title="Invois tidak ditemui">Sila semak pautan pembayaran anda.</EmptyState>
          </Card>
        ) : step === 'done' ? (
          <Card className="overflow-hidden">
            <div className="flex flex-col items-center px-6 pb-4 pt-8 text-center">
              <CheckCircle2 className="size-12 text-brand-600" />
              <h1 className="mt-3 text-xl font-semibold text-gray-900">Pembayaran berjaya</h1>
              <p className="mt-1 text-sm text-gray-600">
                {rm(receipt.amount)} diterima untuk {s?.name}. Resit juga boleh dilihat dalam portal ibu bapa.
              </p>
            </div>
            <div className="border-t border-gray-200 p-5">
              <ReceiptDocument receipt={receipt} />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
              <Button as="a" href="#/portal" icon={ArrowLeft}>
                Ke portal
              </Button>
              <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                Cetak resit
              </Button>
            </div>
          </Card>
        ) : amount === 0 ? (
          <Card>
            <EmptyState icon={CheckCircle2} title="Invois ini telah dibayar sepenuhnya">
              <a href="#/portal" className="text-brand-700 hover:underline">
                Kembali ke portal
              </a>
            </EmptyState>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="text-[13px] text-gray-500">
                {inv.no} · {s?.name}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tnum">{rm(amount)}</p>
            </div>
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
              <InvoiceLines inv={inv} />
            </div>

            {step === 'choose' && (
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kaedah bayaran">
                  {[
                    { id: 'FPX', label: 'Perbankan dalam talian', sub: 'FPX', icon: Landmark },
                    { id: 'DUITNOW_QR', label: 'DuitNow QR', sub: 'Imbas dengan aplikasi bank', icon: QrCode },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={method === m.id}
                      onClick={() => setMethod(m.id)}
                      className={cx(
                        'flex items-start gap-3 rounded-md border p-3 text-left',
                        method === m.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-gray-300 hover:border-gray-400',
                      )}
                    >
                      <m.icon className="mt-0.5 size-5 text-gray-600" />
                      <span>
                        <span className="block text-sm font-medium text-gray-900">{m.label}</span>
                        <span className="block text-xs text-gray-500">{m.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {method === 'FPX' ? (
                  <>
                    <p className="text-sm font-medium text-gray-900">Pilih bank</p>
                    <div className="grid grid-cols-2 gap-2">
                      {BANKS.map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBank(b)}
                          className={cx(
                            'rounded-md border px-3 py-2 text-left text-sm',
                            bank === b ? 'border-brand-600 bg-brand-50 font-medium text-brand-900' : 'border-gray-300 text-gray-700 hover:border-gray-400',
                          )}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    <Button variant="primary" size="lg" className="w-full" disabled={!bank} onClick={() => setStep('bank')}>
                      Teruskan ke {bank || 'bank'}
                    </Button>
                  </>
                ) : (
                  <div className="text-center">
                    {qr ? <img src={qr} alt="Kod QR DuitNow (demo)" className="mx-auto size-48" /> : <div className="mx-auto size-48 rounded bg-gray-100" />}
                    <p className="mt-2 text-[13px] text-gray-500">Imbas dengan aplikasi bank anda, kemudian tekan butang di bawah.</p>
                    <Button variant="primary" size="lg" className="mt-4 w-full" onClick={pay}>
                      Saya telah membayar
                    </Button>
                  </div>
                )}
              </div>
            )}

            {step === 'bank' && (
              <div className="space-y-4 p-5">
                <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">{bank} (simulasi)</p>
                  <p className="mt-1">
                    Dalam sistem sebenar, anda akan dibawa ke laman bank untuk log masuk dan meluluskan pembayaran {rm(amount)} kepada {CENTRE.name}.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => setStep('choose')}>
                    Batal
                  </Button>
                  <Button variant="primary" className="flex-1" onClick={pay}>
                    Luluskan pembayaran
                  </Button>
                </div>
              </div>
            )}

            {step === 'processing' && (
              <div className="flex flex-col items-center gap-3 px-5 py-12 text-sm text-gray-600">
                <Loader2 className="size-8 animate-spin text-brand-600" />
                Memproses pembayaran…
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
