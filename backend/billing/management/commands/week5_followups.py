"""Make the week-5 fee follow-up tasks for Supervisor (billing/followups.py). The dashboard and the follow-up list
make them too; schedule this daily if the screens may go unopened (e.g. Task Scheduler or cron:
python manage.py week5_followups)."""
from django.core.management.base import BaseCommand
from billing import followups, services


class Command(BaseCommand):
    help = "Turn monthly invoices still unpaid in week 5 into follow-up tasks for Supervisor"

    def handle(self, *args, **options):
        services.mark_overdue()
        made = followups.generate()
        self.stdout.write(self.style.SUCCESS(f"{made} tugasan susulan minggu 5 dibuat; {followups.open_tasks().count()} masih terbuka."))
