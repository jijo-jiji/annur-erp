import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { staffApi, studentsApi } from '../api/client';
import { can } from '../lib/permissions';
import { cikgu, date, todayISO } from '../lib/format';
import { REPORT_CATEGORIES, REPORT_STATUS } from '../lib/reports';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Textarea, useToast } from './ui';

// Two-way reports (Phase H), entered by staff (client decision 7):
// - a teacher's report about a student (behaviour, homework, attendance, academic), on the student's profile;
// - a student's or parent's report about a teacher, which is a complaint in Guru → Aduan & tindakan, also listed here
//   for the student it came from (Supervisor and Management only, as the complaints are).
// Each has its details, comments, a status and the action taken.

export function StudentReportsPanel({ student, role, classes }) {
  const notify = useToast();
  const [reports, setReports] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [dialog, setDialog] = useState(null);
  const seesComplaints = can(role, 'teachers.pay'); // complaints about teachers stay with Supervisor and Management

  const load = useCallback(() => {
    studentsApi.reports({ student: student.pk }).then(setReports).catch(() => setReports([]));
    if (seesComplaints) staffApi.getComplaints({ student: student.pk }).then(setComplaints).catch(() => setComplaints([]));
  }, [student.pk, seesComplaints]);
  useEffect(() => { load(); }, [load]);

  const run = async (work, done) => {
    await work();
    notify(done);
    setDialog(null);
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Laporan guru tentang pelajar"
          description="Apa yang guru perhatikan tentang pelajar ini, direkod oleh staf, dengan tindakan susulan."
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'add' })}>Laporan guru</Button>}
        />
        {!reports ? <p className="px-5 py-6 text-sm text-gray-500">Memuatkan…</p> : reports.length === 0 ? <EmptyState title="Tiada laporan guru" /> : (
          <ul className="divide-y divide-gray-100">
            {reports.map((r) => (
              <ReportItem
                key={r.id}
                title={`${r.category_label}${r.teacher_name ? ` · ${cikgu(r.teacher_name)}` : ''}`}
                meta={[date(r.date), r.class_code, `direkod oleh ${r.recorded_by}`].filter(Boolean).join(' · ')}
                item={r}
                onUpdate={() => setDialog({ type: 'action', report: r })}
                onComment={(text) => studentsApi.commentReport(r.id, text).then(load)}
              />
            ))}
          </ul>
        )}
      </Card>

      {seesComplaints && (
        <Card>
          <CardHeader
            title="Aduan pelajar / ibu bapa tentang guru"
            description="Direkod di Guru → Aduan & tindakan dan dikaitkan dengan pelajar ini."
            actions={<Button size="sm" as="a" href="#/teachers?tab=complaints">Buka Aduan</Button>}
          />
          {complaints.length === 0 ? <EmptyState title="Tiada aduan daripada pelajar ini" /> : (
            <ul className="divide-y divide-gray-100">
              {complaints.map((c) => (
                <ReportItem
                  key={c.id}
                  title={`${cikgu(c.teacher_name)}${c.category ? ` · ${c.category}` : ''}`}
                  meta={[date(c.date_reported), `${c.complainant_label}: ${c.complained_by}`].join(' · ')}
                  item={{ ...c, details: c.description }}
                  onComment={(text) => staffApi.commentComplaint(c.id, text).then(load)}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {dialog?.type === 'add' && (
        <FormModal
          title={`Laporan guru: ${student.name}`}
          submitLabel="Simpan laporan"
          initial={{ timetable_class: '', category: 'ACADEMIC', date: todayISO(), details: '' }}
          fields={[
            { name: 'timetable_class', label: 'Kelas', type: 'select', options: [{ value: '', label: 'Bukan kelas tertentu' }, ...classes.map((c) => ({ value: c.id, label: c.label }))] },
            { name: 'category', label: 'Jenis laporan', type: 'select', required: true, options: REPORT_CATEGORIES },
            { name: 'date', label: 'Tarikh', type: 'date', required: true },
            { name: 'details', label: 'Butiran', type: 'textarea', required: true, hint: 'Apa yang guru perhatikan, dan cadangan tindakan.' },
          ]}
          onSubmit={(v) => run(() => studentsApi.addReport({ ...v, student: student.pk, timetable_class: v.timetable_class ? Number(v.timetable_class) : null }), 'Laporan guru disimpan.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'action' && (
        <FormModal
          title="Kemas kini tindakan laporan"
          description={`${dialog.report.category_label} · ${date(dialog.report.date)}`}
          initial={{ status: dialog.report.status, action_taken: dialog.report.action_taken || '', action_pic: dialog.report.action_pic || '', action_date: dialog.report.action_date || todayISO() }}
          fields={[
            { name: 'status', label: 'Status', type: 'select', required: true, options: Object.entries(REPORT_STATUS).map(([value, s]) => ({ value, label: s.label })) },
            { name: 'action_taken', label: 'Tindakan diambil', type: 'textarea' },
            { name: 'action_pic', label: 'Pegawai bertanggungjawab (PIC)' },
            { name: 'action_date', label: 'Tarikh tindakan', type: 'date' },
          ]}
          onSubmit={(v) => run(() => studentsApi.updateReport(dialog.report.id, { ...v, action_date: v.action_date || null }), 'Tindakan laporan dikemas kini.')}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

// One report or complaint: details, status, action taken, comments and a box to add one
export function ReportItem({ title, meta, item, onUpdate, onComment }) {
  const notify = useToast();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const comments = item.comments || [];
  const status = REPORT_STATUS[item.status];
  const send = async (e) => {
    e.preventDefault();
    try {
      await onComment(text.trim());
      setText('');
    } catch (err) {
      notify(err?.data?.text || err.message, 'error');
    }
  };
  return (
    <li className="px-5 py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{title}</p>
          <p className="text-[13px] text-gray-500">{meta}</p>
        </div>
        <div className="flex items-center gap-2">
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          {onUpdate && <Button size="sm" onClick={onUpdate}>Kemas kini</Button>}
        </div>
      </div>
      <p className="mt-1.5 whitespace-pre-line text-gray-700">{item.details}</p>
      {item.action_taken && (
        <p className="mt-1.5 text-gray-700"><span className="font-medium">Tindakan:</span> {item.action_taken}
          <span className="text-[13px] text-gray-500"> {[item.action_pic, item.action_date && date(item.action_date)].filter(Boolean).join(' · ')}</span></p>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 flex items-center gap-1 text-[13px] font-medium text-gray-600 hover:text-gray-900">
        <MessageSquare className="size-3.5" /> Komen ({comments.length})
      </button>
      {open && (
        <div className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
          {comments.map((c, i) => (
            <p key={i} className="text-[13px] text-gray-700"><span className="font-medium text-gray-900">{c.by}</span> <span className="text-gray-500">{date(String(c.at).slice(0, 10))}</span>: {c.text}</p>
          ))}
          <form onSubmit={send} className="flex items-end gap-2">
            <Textarea label="Komen baharu" rows={1} className="flex-1" value={text} onChange={(e) => setText(e.target.value)} />
            <Button type="submit" size="sm" disabled={!text.trim()}>Hantar</Button>
          </form>
        </div>
      )}
    </li>
  );
}
