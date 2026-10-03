import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, Textarea } from './ui';

// A small form in a dialog, described by a list of fields:
// { name, label, type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox', options, required, hint }
// onSubmit receives the values; if it throws, the dialog stays open (the reason is shown as a toast).
// onChange (optional) is told the values as they change, for fields that depend on another field.
export default function FormModal({ title, description, fields, initial = {}, submitLabel = 'Simpan', danger, onSubmit, onChange, onClose }) {
  const [values, setValues] = useState(initial);
  const changed = useRef(onChange);
  useEffect(() => { changed.current = onChange; });
  useEffect(() => { changed.current?.(values); }, [values]);
  const [busy, setBusy] = useState(false);
  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(values);
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="form-modal" variant={danger ? 'danger' : 'primary'} disabled={busy}>
            {busy ? 'Menyimpan…' : submitLabel}
          </Button>
        </>
      }
    >
      <form id="form-modal" onSubmit={submit} className="space-y-4">
        {fields.map((f) => {
          const common = { label: f.label, required: f.required, hint: f.hint };
          if (f.type === 'select') {
            return (
              <Select key={f.name} {...common} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">{f.placeholder ?? 'Pilih'}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
                ))}
              </Select>
            );
          }
          if (f.type === 'textarea') return <Textarea key={f.name} {...common} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />;
          if (f.type === 'checkbox') return <Checkbox key={f.name} label={f.label} description={f.hint} checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />;
          return <Input key={f.name} {...common} type={f.type ?? 'text'} min={f.min} max={f.max} step={f.step} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />;
        })}
      </form>
    </Modal>
  );
}
