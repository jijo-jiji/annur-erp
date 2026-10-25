import { useState } from 'react';
import { Copy } from 'lucide-react';
import { waLink } from '../lib/format';
import { Button, Modal, Textarea, useToast, WhatsAppIcon } from './ui';

// A prepared WhatsApp message opens in a preview first, so staff can read and change the wording for this
// parent before WhatsApp opens. The template itself is edited in Tetapan → Mesej. `onSent` runs when
// WhatsApp is opened (for example to record that a reminder went out).
export default function WhatsAppButton({ phone, message, recipient, onSent, children, ...buttonProps }) {
  const notify = useToast();
  const [text, setText] = useState(null); // null while closed

  const open = () => {
    window.open(waLink(phone, text), '_blank', 'noopener,noreferrer');
    onSent?.();
    setText(null);
  };
  const copy = () => navigator.clipboard.writeText(text).then(() => notify('Mesej disalin.', 'info'), () => notify('Mesej tidak dapat disalin.', 'error'));

  return (
    <>
      <Button {...buttonProps} onClick={() => setText(message || '')}>{children}</Button>
      <Modal
        open={text !== null}
        onClose={() => setText(null)}
        title="Semak mesej WhatsApp"
        description={`Kepada ${recipient ? `${recipient} · ` : ''}${phone}. Ubah ayat jika perlu; perubahan ini untuk mesej ini sahaja.`}
        footer={
          <>
            <Button onClick={() => setText(null)}>Batal</Button>
            <Button icon={Copy} onClick={copy} disabled={!text}>Salin</Button>
            <Button variant="primary" onClick={open} disabled={!text?.trim()}>
              <WhatsAppIcon className="size-4" /> Buka WhatsApp
            </Button>
          </>
        }
      >
        <Textarea label="Mesej" value={text ?? ''} onChange={(e) => setText(e.target.value)} rows={10} />
      </Modal>
    </>
  );
}
