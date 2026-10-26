"""Mark absent the students who did not check in to classes that have ended (students/checkin.py). The screens do this when
the day's attendance is looked at; schedule it (e.g. every evening) if they may not be opened."""
from django.core.management.base import BaseCommand
from students import checkin


class Command(BaseCommand):
    help = "Confirm the QR check-in of classes that have ended: students not checked in are marked absent"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(f"{checkin.close_due()} kelas disahkan."))
