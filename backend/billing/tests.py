from django.test import TestCase
from business_config.models import PricingTier, BusinessSetting
from academic.models import Classroom, TimeSlot, ClassTimetable
from teachers.models import Teacher
from business_config.models import SubjectMaster

class PricingAndCapacityTests(TestCase):
    def setUp(self):
        BusinessSetting.objects.create(key="REGISTRATION_FEE", value="30.00")
        PricingTier.objects.create(level_category="SECONDARY", subject_count=4, price_per_subject=60.00, total_price=240.00)
        PricingTier.objects.create(level_category="SECONDARY", subject_count=5, price_per_subject=55.00, total_price=275.00)
        PricingTier.objects.create(level_category="SECONDARY", subject_count=6, price_per_subject=55.00, total_price=330.00)
        PricingTier.objects.create(level_category="SECONDARY", subject_count=7, price_per_subject=50.00, total_price=350.00)
        PricingTier.objects.create(level_category="SECONDARY", subject_count=8, price_per_subject=50.00, total_price=400.00)
        PricingTier.objects.create(level_category="DARJAH_5", subject_count=2, price_per_subject=50.00, total_price=100.00)
        PricingTier.objects.create(level_category="DARJAH_6", subject_count=4, price_per_subject=50.00, total_price=200.00)

    def test_secondary_pricing_tiers(self):
        tier_4 = PricingTier.objects.get(level_category="SECONDARY", subject_count=4)
        self.assertEqual(tier_4.total_price, 240.00)

        tier_5 = PricingTier.objects.get(level_category="SECONDARY", subject_count=5)
        self.assertEqual(tier_5.total_price, 275.00)

        tier_8 = PricingTier.objects.get(level_category="SECONDARY", subject_count=8)
        self.assertEqual(tier_8.total_price, 400.00)

    def test_primary_pricing_packages(self):
        d5 = PricingTier.objects.get(level_category="DARJAH_5")
        self.assertEqual(d5.total_price, 100.00)

        d6 = PricingTier.objects.get(level_category="DARJAH_6")
        self.assertEqual(d6.total_price, 200.00)

    def test_seat_capacity_availability(self):
        sub = SubjectMaster.objects.create(code="FZ_TEST", name="Fizik Test", level_category="UPPER_SEC")
        slot = TimeSlot.objects.create(day="JUMAAT", start_time="09:00", end_time="10:30", period_label="Pagi")
        cl = ClassTimetable.objects.create(
            slot=slot, subject=sub, form_level="F4", section="A", max_seats=20, current_enrolled=18
        )
        self.assertEqual(cl.available_seats, 2)
        cl.current_enrolled = 22
        self.assertEqual(cl.available_seats, -2)