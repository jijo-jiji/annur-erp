from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_message_templates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='attachment',
            name='kind',
            field=models.CharField(choices=[('STUDENT_PHOTO', 'Gambar Pelajar'), ('FEEDBACK', 'Maklum Balas (gambar/video)'), ('STAFF_PHOTO', 'Gambar Staf'), ('STAFF_DOC', 'Dokumen Sokongan Staf'), ('VOUCHER', 'Lampiran Baucar'), ('VOUCHER_SIGNATURE', 'Tandatangan Penerima'), ('HANDOUT', 'Fail Nota / Modul'), ('RESULT_SLIP', 'Slip Keputusan Peperiksaan')], max_length=20),
        ),
    ]
