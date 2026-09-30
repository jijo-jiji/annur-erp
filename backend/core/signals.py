"""Keep uploaded files in step with the records they belong to."""
from django.db.models.signals import post_delete, pre_delete
from .models import Attachment

# Which attachment kinds belong to each model
OWNED_KINDS = {
    ('students', 'Student'): ('STUDENT_PHOTO',),
    ('students', 'StudentFeedback'): ('FEEDBACK',),
    ('teachers', 'StaffMember'): ('STAFF_PHOTO', 'STAFF_DOC'),
    ('expenses', 'PaymentVoucher'): ('VOUCHER', 'VOUCHER_SIGNATURE'),
    ('academic', 'LessonHandout'): ('HANDOUT',),
}


def remove_file(sender, instance, **kwargs):
    if instance.file:
        instance.file.delete(save=False)


def remove_owned(kinds):
    def handler(sender, instance, **kwargs):
        for attachment in Attachment.objects.filter(kind__in=kinds, object_id=instance.pk):
            attachment.delete()
    return handler


def connect():
    from django.apps import apps
    post_delete.connect(remove_file, sender=Attachment, dispatch_uid='attachment_remove_file')
    for (app, model), kinds in OWNED_KINDS.items():
        pre_delete.connect(remove_owned(kinds), sender=apps.get_model(app, model), weak=False,
                           dispatch_uid=f'attachments_of_{app}_{model}')
