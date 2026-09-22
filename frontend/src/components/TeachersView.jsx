import { useState } from 'react';
import { GraduationCap, Printer, Search } from 'lucide-react';
import { CENTRE, CURRENT_MONTH } from '../data/demo';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { DAYS } from '../data/demo';
import { classLabel } from '../lib/domain';
import { DAY_LABEL, initials, monthLabel, rm, timeRange, waLink } from '../lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, SearchInput, Table, Tabs, Td, Th, WhatsAppIcon } from './ui';

const WEEKS_PER_MONTH = 4;

export default function TeachersView({ role }) {
  const showPay = can(role, 'teachers.pay');
  const { teachers, classes } = useStore();
  const [tab, setTab] = useState('ALL');
  const [q, setQ] = useState('');
  const [slip, setSlip] = useState(null);

  const sessions = (code) => classes.filter((c) => c.teacher === code).length;
  const needle = q.trim().toLowerCase();
  const rows = teachers.filter(
    (t) => (tab === 'ALL' || t.type === tab) && (!needle || `${t.name} ${t.code} ${t.subjects}`.toLowerCase().includes(needle)),
  );
  const count = (type) => teachers.filter((t) => t.type === type).length;
  const monthlyTotal = teachers.reduce((a, t) => a + sessions(t.code) * WEEKS_PER_MONTH * t.rate, 0);

  return (
    <>
      <PageHeader
        title={showPay ? 'Guru & elaun' : 'Guru'}
        description={
          showPay
            ? `Kadar elaun bagi setiap sesi 1 jam 30 minit · Anggaran elaun ${monthLabel(CURRENT_MONTH)}: ${rm(monthlyTotal)}`
            : 'Guru tetap, guru ganti dan jadual mengajar mingguan.'
        }
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'ALL', label: 'Semua', count: teachers.length },
            { value: 'PERMANENT', label: 'Guru tetap', count: count('PERMANENT') },
            { value: 'REPLACEMENT', label: 'Guru ganti', count: count('REPLACEMENT') },
          ]}
        />
        <SearchInput icon={Search} value={q} onChange={setQ} placeholder="Cari guru atau subjek" className="w-full sm:w-72" />
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Tiada guru ditemui" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Guru</Th>
                <Th className="hidden xl:table-cell">Subjek</Th>
                <Th className="text-right">Kelas / minggu</Th>
                {showPay ? (
                  <>
                    <Th className="text-right">Kadar / sesi</Th>
                    <Th className="text-right">Anggaran sebulan</Th>
                    <Th className="w-0">
                      <span className="sr-only">Tindakan</span>
                    </Th>
                  </>
                ) : (
                  <Th>Hari mengajar</Th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const n = sessions(t.code);
                return (
                  <tr key={t.code} className="hover:bg-gray-50">
                    <Td className="min-w-64">
                      <div className="flex items-center gap-3">
                        <Avatar text={initials(t.name)} />
                        <div>
                          <p className="font-medium text-gray-900">
                            Cikgu {t.name} <span className="font-normal text-gray-400">· {t.code}</span>
                          </p>
                          <p className="text-[13px] text-gray-500">
                            <span className="xl:hidden">{t.subjects} · </span>
                            {t.phone}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="hidden text-gray-700 xl:table-cell">{t.subjects}</Td>
                    <Td className="text-right tnum">{n || <span className="text-gray-400">—</span>}</Td>
                    {showPay ? (
                      <>
                        <Td className="text-right tnum">{rm(t.rate)}</Td>
                        <Td className="text-right font-medium tnum">{n ? rm(n * WEEKS_PER_MONTH * t.rate) : <Badge>Atas panggilan</Badge>}</Td>
                        <Td className="whitespace-nowrap">
                          <Button size="sm" onClick={() => setSlip(t)} disabled={!n}>
                            Slip elaun
                          </Button>
                        </Td>
                      </>
                    ) : (
                      <Td className="text-gray-700">
                        {n ? (
                          DAYS.filter((d) => classes.some((c) => c.teacher === t.code && c.day === d))
                            .map((d) => DAY_LABEL[d])
                            .join(', ')
                        ) : (
                          <Badge>Atas panggilan</Badge>
                        )}
                      </Td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      {showPay && (
      <p className="mt-3 text-[13px] text-gray-500">
        Anggaran dikira daripada jadual semasa ({WEEKS_PER_MONTH} minggu sebulan). Kelas batal dan ganti perlu disemak sebelum bayaran.
      </p>
      )}

      <SlipModal teacher={slip} onClose={() => setSlip(null)} />
    </>
  );
}

function SlipModal({ teacher: t, onClose }) {
  const { classes, subjects } = useStore();
  if (!t) return null;
  const taught = classes.filter((c) => c.teacher === t.code);
  const total = taught.length * WEEKS_PER_MONTH * t.rate;
  const summary = `Assalamualaikum Cikgu ${t.name}.\n\nRingkasan elaun ${monthLabel(CURRENT_MONTH)}:\n${taught.length} kelas × ${WEEKS_PER_MONTH} minggu × ${rm(t.rate)} = ${rm(total)}\n\nTerima kasih atas khidmat cikgu.\n— ${CENTRE.name}`;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Slip elaun guru"
      footer={
        <>
          <Button as="a" href={waLink(t.phone, summary)} target="_blank" rel="noreferrer">
            <WhatsAppIcon /> Hantar ringkasan
          </Button>
          <Button variant="primary" icon={Printer} onClick={() => window.print()}>
            Cetak
          </Button>
        </>
      }
    >
      <div className="print-area space-y-5 bg-white">
        <div className="flex justify-between gap-4 border-b border-gray-200 pb-4">
          <div>
            <p className="font-semibold text-gray-900">{CENTRE.name}</p>
            <p className="text-[13px] text-gray-500">{CENTRE.address}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">Slip elaun</p>
            <p className="font-semibold text-gray-900">{monthLabel(CURRENT_MONTH)}</p>
          </div>
        </div>
        <div className="text-sm">
          <p className="font-medium text-gray-900">
            Cikgu {t.name} ({t.code})
          </p>
          <p className="text-gray-500">{t.type === 'PERMANENT' ? 'Guru tetap' : 'Guru ganti'} · Kadar {rm(t.rate)} / sesi</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2 font-medium">Kelas</th>
              <th className="py-2 font-medium">Jadual</th>
              <th className="py-2 text-right font-medium">Sesi</th>
              <th className="py-2 text-right font-medium">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {taught.map((c) => (
              <tr key={c.id} className="border-b border-gray-100">
                <td className="py-2 text-gray-900">{classLabel(c, subjects)}</td>
                <td className="py-2 text-gray-600">
                  {DAY_LABEL[c.day]}, {timeRange(c.start, c.end)}
                </td>
                <td className="py-2 text-right tnum">{WEEKS_PER_MONTH}</td>
                <td className="py-2 text-right tnum">{rm(WEEKS_PER_MONTH * t.rate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="pt-3 font-semibold text-gray-900">
                Jumlah elaun
              </td>
              <td className="pt-3 text-right font-semibold tnum">{taught.length * WEEKS_PER_MONTH}</td>
              <td className="pt-3 text-right font-semibold tnum">{rm(total)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-gray-500">Bayaran ke akaun bank guru yang berdaftar. Slip ini dijana oleh sistem.</p>
      </div>
    </Modal>
  );
}
