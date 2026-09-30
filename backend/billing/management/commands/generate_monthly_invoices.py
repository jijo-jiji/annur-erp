"""Raise this month's invoices and mark overdue ones. Schedule it for the 1st of each month
(e.g. Windows Task Scheduler: python manage.py generate_monthly_invoices)."""
from django.core.management.base import BaseCommand
from billing import services


class Command(BaseCommand):
    help = "Raise monthly invoices for active students (skips students already invoiced for the month)"

    def add_arguments(self, parser):
        parser.add_argument('--month', help='YYYY-MM (default: this month)')
        parser.add_argument('--dry-run', action='store_true', help='List what would be invoiced without saving')

    def handle(self, *args, **options):
        from datetime import date
        overdue = services.mark_overdue()
        result = services.monthly_run(options['month'] or date.today(), dry_run=options['dry_run'])
        for row in result['rows']:
            detail = row.get('invoice_number') or row.get('reason') or f"RM{row.get('balance')}"
            self.stdout.write(f"{row['result']:8} {row['student_code']} {row['name']}: {detail}")
        self.stdout.write(self.style.SUCCESS(
            f"{result['month']:%B %Y}: {result['created']} dijana, {result['ready']} sedia, "
            f"{result['skipped']} dilangkau; {overdue} invois ditanda tertunggak."
        ))
