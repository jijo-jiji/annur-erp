"""PDF receipts and payslips (j-status.doc: payment record with PDF receipt; payslip PDF)."""
from io import BytesIO
from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

CENTRE = 'PUSAT TUISYEN AN NUR'
ADDRESS = 'Tingkat 1&2, PT 105 Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan'
PHONE = '013-983 8085'

INK = colors.HexColor('#0f172a')
MUTED = colors.HexColor('#64748b')
RULE = colors.HexColor('#cbd5e1')
ACCENT = colors.HexColor('#3730a3')

TITLE = ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=13, leading=16, alignment=1, textColor=INK)
SUB = ParagraphStyle('sub', fontName='Helvetica', fontSize=8, leading=10, alignment=1, textColor=MUTED)
DOC = ParagraphStyle('doc', fontName='Helvetica-Bold', fontSize=11, leading=14, alignment=1, textColor=ACCENT, spaceBefore=4)
BODY = ParagraphStyle('body', fontName='Helvetica', fontSize=9, leading=12, textColor=INK)
SMALL = ParagraphStyle('small', fontName='Helvetica', fontSize=7.5, leading=10, textColor=MUTED)
WATERMARK = ParagraphStyle('wm', fontName='Helvetica-Bold', fontSize=10, leading=12, alignment=1, textColor=colors.HexColor('#b91c1c'))


def money(value):
    return f"RM {float(value or 0):,.2f}"


def _esc(text):
    return str(text if text not in (None, '') else '-').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _header(doc_title):
    return [Paragraph(CENTRE, TITLE), Paragraph(_esc(ADDRESS), SUB), Paragraph(f"Tel: {PHONE}", SUB), Paragraph(doc_title, DOC), Spacer(1, 4 * mm)]


def _details(rows, width):
    table = Table([[Paragraph(_esc(k), SMALL), Paragraph(f"<b>{_esc(v)}</b>", BODY)] for k, v in rows],
                  colWidths=[width * 0.35, width * 0.65])
    table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.3, RULE),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    return table


def _total(label, amount, width):
    table = Table([[Paragraph(f"<b>{label}</b>", BODY), Paragraph(f"<b>{money(amount)}</b>", ParagraphStyle('t', parent=BODY, alignment=2, fontSize=11))]],
                  colWidths=[width * 0.6, width * 0.4])
    table.setStyle(TableStyle([
        ('LINEABOVE', (0, 0), (-1, 0), 1, INK), ('LINEBELOW', (0, 0), (-1, 0), 1, INK),
        ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table


def _build(story, pagesize, title):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=pagesize, leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=12 * mm, bottomMargin=12 * mm, title=title, author=CENTRE)
    doc.build(story)
    return buf.getvalue(), doc.width


def receipt_pdf(receipt):
    """Official receipt for one payment."""
    invoice = receipt.invoice
    student = receipt.student
    kind = receipt.get_payment_type_display()
    if receipt.payment_month:
        kind += f" ({receipt.payment_month:%m/%Y})"
    width = A5[0] - 28 * mm
    story = _header('RESIT RASMI')
    story.append(_details([
        ('No. Resit', receipt.receipt_number),
        ('Tarikh', receipt.payment_date.strftime('%d/%m/%Y')),
        ('Pelajar', f"{student.full_name} ({student.student_id})"),
        ('Invois', invoice.invoice_number),
        ('Jenis bayaran', kind),
        ('Kaedah', receipt.get_payment_method_display()),
        ('No. rujukan', receipt.reference_number),
        ('Diterima oleh', receipt.received_by),
    ], width))
    story.append(Spacer(1, 4 * mm))
    story.append(_total('JUMLAH DITERIMA', receipt.amount_paid, width))
    story.append(Spacer(1, 3 * mm))
    if receipt.overpaid_amount and receipt.overpaid_amount > 0:
        story.append(Paragraph(f"Lebihan {money(receipt.overpaid_amount)} disimpan sebagai kredit pelajar.", BODY))
    story.append(Paragraph(f"Baki invois selepas bayaran: {money(invoice.balance_due)}", BODY))
    if receipt.notes:
        story.append(Paragraph(f"Catatan: {_esc(receipt.notes)}", BODY))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph('Resit ini dijana oleh komputer dan tidak memerlukan tandatangan.', SMALL))
    data, _ = _build(story, A5, f"Resit {receipt.receipt_number}")
    return data


def payslip_pdf(payment, sessions):
    """Monthly teacher payslip with the sessions behind the pay."""
    teacher = payment.teacher
    width = A4[0] - 28 * mm
    story = _header('SLIP GAJI GURU')
    if payment.status not in ('APPROVED', 'PAID'):
        story.append(Paragraph(f"DRAF: {payment.get_status_display().upper()}, BELUM DILULUSKAN MANAGEMENT", WATERMARK))
        story.append(Spacer(1, 3 * mm))
    story.append(_details([
        ('Guru', f"{teacher.full_name} ({teacher.teacher_code})"),
        ('Jenis', teacher.get_teacher_type_display()),
        ('Bulan', payment.month.strftime('%m/%Y')),
        ('Bank', ' '.join(filter(None, [teacher.bank_name, teacher.bank_account]))),
        ('Disahkan oleh', payment.verified_by),
        ('Diluluskan oleh', payment.decided_by if payment.status in ('APPROVED', 'PAID') else ''),
    ], width))
    story.append(Spacer(1, 5 * mm))

    rows = [['Tarikh', 'Kelas', 'Peranan', 'RM']]
    for s in sessions:
        role = s['role'] + (f" ({s['for_teacher']})" if s['for_teacher'] else '')
        rows.append([s['date'].strftime('%d/%m/%Y'), s['class_code'], role, f"{float(s['amount']):.2f}"])
    table = Table(rows, colWidths=[width * 0.18, width * 0.3, width * 0.37, width * 0.15], repeatRows=1)
    table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 8), ('FONT', (0, 1), (-1, -1), 'Helvetica', 8.5),
        ('TEXTCOLOR', (0, 0), (-1, 0), MUTED), ('LINEBELOW', (0, 0), (-1, 0), 0.6, INK),
        ('LINEBELOW', (0, 1), (-1, -1), 0.3, RULE), ('ALIGN', (3, 0), (3, -1), 'RIGHT'),
        ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(table)
    story.append(Spacer(1, 4 * mm))
    summary = [('Jumlah dikira', f"{payment.sessions} sesi", payment.calculated_amount)]
    if payment.adjustment:
        summary.append(('Pelarasan', payment.adjustment_note, payment.adjustment))
    sum_table = Table([[Paragraph(a, BODY), Paragraph(_esc(b), SMALL), Paragraph(money(c), ParagraphStyle('r', parent=BODY, alignment=2))] for a, b, c in summary],
                      colWidths=[width * 0.3, width * 0.45, width * 0.25])
    story.append(sum_table)
    story.append(_total('JUMLAH BAYARAN', payment.amount_payable, width))
    if payment.status == 'PAID':
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(
            f"Dibayar {payment.paid_date:%d/%m/%Y} melalui {payment.get_payment_method_display()}"
            f"{' (rujukan ' + _esc(payment.payment_reference) + ')' if payment.payment_reference else ''} oleh {_esc(payment.paid_by)}.", BODY))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph('Slip ini dijana oleh komputer.', SMALL))
    data, _ = _build(story, A4, f"Slip gaji {teacher.teacher_code} {payment.month:%Y-%m}")
    return data


def pdf_response(data, filename):
    response = HttpResponse(data, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['Cache-Control'] = 'private, no-store'
    return response
