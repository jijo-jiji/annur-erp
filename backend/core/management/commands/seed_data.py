from django.core.management.base import BaseCommand
from datetime import date
from business_config.models import SubjectMaster, PricingTier, BusinessSetting, TeacherRateSetting
from teachers.models import Teacher
from academic.models import Classroom, TimeSlot, ClassTimetable, ClassRescheduleLog
from students.models import Student
from billing.models import Invoice, PaymentReceipt
from expenses.models import Vendor, PaymentVoucher

class Command(BaseCommand):
    help = "Seed database with all real operational data from Pusat Tuisyen An Nur documents"

    def handle(self, *args, **options):
        self.stdout.write("Starting database seeding...")

        # 1. Business Settings
        settings_data = [
            ("REGISTRATION_FEE", "30.00", "Bayaran pendaftaran sekali semasa pendaftaran (RM30)"),
            ("SESSION_DURATION_MINUTES", "90", "Tempoh standard setiap sesi pembelajaran (1 jam 30 minit)"),
            ("DEFAULT_CLASS_CAPACITY", "20", "Kapasiti maksimum pelajar bagi setiap bilik kelas"),
            ("MONTHLY_DUE_DAY", "7", "Tarikh akhir pembayaran yuran bulanan setiap awal bulan"),
            ("UNPAID_TERMINATION_MONTHS", "2", "Tempoh tunggakan maksimum sebelum diberhentikan tanpa makluman"),
            ("WITHDRAWAL_NOTICE_WEEKS", "2", "Tempoh notis pemberitahuan sebelum berhenti tuisyen"),
            ("CENTER_NAME", "Pusat Tuisyen An Nur Telipot", "Nama rasmi pusat tuisyen"),
            ("CENTER_PHONE", "013-9838085", "Nombor telefon hotline tuisyen"),
            ("CENTER_ADDRESS", "Tingkat 1, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan", "Alamat pusat"),
        ]
        for key, val, desc in settings_data:
            BusinessSetting.objects.update_or_create(key=key, defaults={"value": val, "description": desc})

        # 2. Teacher Rate Settings
        TeacherRateSetting.objects.update_or_create(
            teacher_type="PERMANENT",
            defaults={"base_rate_per_session": 60.00, "annual_increment_pct": 5.00, "description": "Kadar asas Cikgu Permanent per 1.5 jam"}
        )
        TeacherRateSetting.objects.update_or_create(
            teacher_type="REPLACEMENT",
            defaults={"base_rate_per_session": 55.00, "annual_increment_pct": 3.00, "description": "Kadar asas Cikgu Ganti per 1.5 jam"}
        )

        # 3. Subject Master
        subjects_data = [
            # Upper Secondary (Form 4 - 5)
            ("FZ", "Fizik", "UPPER_SEC", "SAINS"),
            ("KIM", "Kimia", "UPPER_SEC", "SAINS"),
            ("BIO", "Biologi", "UPPER_SEC", "SAINS"),
            ("ADDMT", "Matematik Tambahan", "UPPER_SEC", "SAINS"),
            ("BI", "Bahasa Inggeris", "UPPER_SEC", "TERAS"),
            ("BM", "Bahasa Melayu", "UPPER_SEC", "TERAS"),
            ("MATH", "Matematik", "UPPER_SEC", "TERAS"),
            ("SAINS", "Sains Teras", "UPPER_SEC", "SASTERA"),
            ("SEJ", "Sejarah", "UPPER_SEC", "TERAS"),
            ("ACC", "Prinsip Perakaunan", "UPPER_SEC", "SASTERA"),
            # Lower Secondary (Form 1 - 3)
            ("SAINS_L", "Sains (Menengah Rendah)", "LOWER_SEC", "TERAS"),
            ("MATH_L", "Matematik (Menengah Rendah)", "LOWER_SEC", "TERAS"),
            ("BI_L", "Bahasa Inggeris (Menengah Rendah)", "LOWER_SEC", "TERAS"),
            ("BM_L", "Bahasa Melayu (Menengah Rendah)", "LOWER_SEC", "TERAS"),
            ("GEO_L", "Geografi", "LOWER_SEC", "TERAS"),
            ("SEJ_L", "Sejarah (Menengah Rendah)", "LOWER_SEC", "TERAS"),
            # Primary (Darjah 5 - 6)
            ("SAINS_P", "Sains Sekolah Rendah", "PRIMARY", "TERAS"),
            ("MATH_P", "Matematik Sekolah Rendah", "PRIMARY", "TERAS"),
            ("BI_P", "Bahasa Inggeris Sekolah Rendah", "PRIMARY", "TERAS"),
            ("BM_P", "Bahasa Melayu Sekolah Rendah", "PRIMARY", "TERAS"),
        ]
        sub_dict = {}
        for code, name, level, stream in subjects_data:
            sub, _ = SubjectMaster.objects.update_or_create(
                code=code,
                defaults={"name": name, "level_category": level, "stream": stream, "is_active": True}
            )
            sub_dict[code] = sub

        # 4. Pricing Tiers (Pakej Yuran)
        PricingTier.objects.all().delete()
        pricing_data = [
            ("SECONDARY", 4, 60.00, 240.00, "Sekolah Menengah 4 Subjek (RM60/sub)"),
            ("SECONDARY", 5, 55.00, 275.00, "Sekolah Menengah 5 Subjek (RM55/sub)"),
            ("SECONDARY", 6, 55.00, 330.00, "Sekolah Menengah 6 Subjek (RM55/sub)"),
            ("SECONDARY", 7, 50.00, 350.00, "Sekolah Menengah 7 Subjek (RM50/sub)"),
            ("SECONDARY", 8, 50.00, 400.00, "Sekolah Menengah 8 Subjek (RM50/sub)"),
            ("DARJAH_5", 2, 50.00, 100.00, "Darjah 5 Pakej 2 Subjek"),
            ("DARJAH_6", 4, 50.00, 200.00, "Darjah 6 Pakej 4 Subjek"),
            ("WALK_IN", 1, 25.00, 25.00, "Kadar Walk-in per sesi"),
        ]
        for cat, count, pps, tot, desc in pricing_data:
            PricingTier.objects.create(
                level_category=cat, subject_count=count, price_per_subject=pps, total_price=tot, description=desc
            )

        # 5. Classrooms
        classrooms = ["Bilik Al-Farabi", "Bilik Ibnu Sina", "Bilik Al-Khawarizmi", "Bilik Ibnu Khaldun", "Bilik Al-Biruni"]
        cr_objs = []
        for cname in classrooms:
            cr, _ = Classroom.objects.update_or_create(name=cname, defaults={"capacity": 20, "is_active": True})
            cr_objs.append(cr)

        # 6. Teachers (Elaun Guru 2026)
        teachers_data = [
            # Permanent
            ("NAK", "Cikgu Nik Ahmad Khan", "019-9110001", "PERMANENT", 65.00, ["FZ"]),
            ("AZ", "Cikgu Azahari", "019-9110002", "PERMANENT", 60.00, ["SAINS_L", "SAINS"]),
            ("D", "Cikgu Diana", "019-9110003", "PERMANENT", 60.00, ["BIO"]),
            ("F", "Cikgu Fadzlul", "019-9110004", "PERMANENT", 60.00, ["MATH_L"]),
            ("G", "Cikgu Ghazani", "019-9110005", "PERMANENT", 60.00, ["BM", "BM_L"]),
            ("HK", "Cikgu Hakimi", "019-9110006", "PERMANENT", 60.00, ["MATH"]),
            ("K", "Cikgu Kamal", "019-9110007", "PERMANENT", 60.00, ["BM_L", "BM_P"]),
            ("SAF", "Cikgu Safran", "019-9110008", "PERMANENT", 60.00, ["MATH", "MATH_L"]),
            ("SF", "Cikgu Saiful", "019-9110009", "PERMANENT", 65.00, ["KIM", "MATH_L"]),
            ("Z", "Cikgu Zakir", "019-9110010", "PERMANENT", 60.00, ["BI", "BI_L", "ADDMT"]),
            ("AZM", "Cikgu Zamri", "019-9110011", "PERMANENT", 65.00, ["ADDMT", "BIO"]),
            ("HS", "Cikgu Hasmini", "019-9110012", "PERMANENT", 55.00, ["SAINS_P"]),
            ("AM", "Cikgu Amin", "019-9110013", "PERMANENT", 60.00, ["BIO", "SAINS"]),
            ("A", "Cikgu Anis Sabreena", "019-9110014", "PERMANENT", 55.00, ["BI_P", "BI_L"]),
            ("FQ", "Cikgu Faqihah", "019-9110015", "PERMANENT", 55.00, ["MATH_P"]),
            ("M", "Cikgu Maheran", "019-9110016", "PERMANENT", 60.00, ["SEJ", "SEJ_L"]),
            ("AT", "Cikgu Atiqah", "019-9110017", "PERMANENT", 60.00, ["ACC"]),
            # Replacement Teachers
            ("ROS", "Cikgu Roslan", "019-9220001", "REPLACEMENT", 55.00, ["SEJ", "BM"]),
            ("JUL", "Dr Juliana", "019-9220002", "REPLACEMENT", 55.00, ["SAINS"]),
            ("ELY", "Cikgu Elyas", "019-9220003", "REPLACEMENT", 55.00, ["KIM", "SAINS"]),
            ("BAH", "Cikgu Bahirah", "019-9220004", "REPLACEMENT", 55.00, ["BI"]),
            ("SUL", "Cikgu Sulia", "019-9220005", "REPLACEMENT", 55.00, ["SEJ"]),
            ("BAL", "Cikgu Balkhis", "019-9220006", "REPLACEMENT", 55.00, ["KIM", "BIO", "FZ"]),
        ]
        t_dict = {}
        for code, name, phone, t_type, rate, q_subs in teachers_data:
            t, _ = Teacher.objects.update_or_create(
                teacher_code=code,
                defaults={
                    "full_name": name,
                    "phone_number": phone,
                    "teacher_type": t_type,
                    "rate_per_session": rate,
                    "is_active": True,
                    "bank_name": "Maybank",
                    "bank_account": "164000123456"
                }
            )
            for qs in q_subs:
                if qs in sub_dict:
                    t.subjects_qualified.add(sub_dict[qs])
            t_dict[code] = t

        # 7. Time Slots (Jadual Master 2026)
        slots_data = [
            # JUMAAT
            ("JUMAAT", "09:00", "10:30", "Pagi 9.00 - 10.30"),
            ("JUMAAT", "10:40", "12:10", "Pagi 10.40 - 12.10"),
            ("JUMAAT", "15:00", "16:30", "Petang 3.00 - 4.30"),
            ("JUMAAT", "16:45", "18:15", "Petang 4.45 - 6.15"),
            # SABTU
            ("SABTU", "09:00", "10:30", "Pagi 9.00 - 10.30"),
            ("SABTU", "10:45", "12:15", "Pagi 10.45 - 12.15"),
            ("SABTU", "12:30", "14:00", "Tengahari 12.30 - 2.00"),
            ("SABTU", "14:15", "15:45", "Petang 2.15 - 3.45"),
            ("SABTU", "16:00", "17:30", "Petang 4.00 - 5.30"),
            # MALAM (Isnin - Khamis)
            ("ISNIN", "20:30", "22:00", "Malam 8.30 - 10.00"),
            ("SELASA", "20:30", "22:00", "Malam 8.30 - 10.00"),
            ("RABU", "20:30", "22:00", "Malam 8.30 - 10.00"),
            ("KHAMIS", "20:30", "22:00", "Malam 8.30 - 10.00"),
        ]
        slot_map = {}
        for day, st, et, lbl in slots_data:
            ts, _ = TimeSlot.objects.update_or_create(
                day=day, start_time=st, end_time=et, defaults={"period_label": lbl}
            )
            slot_map[f"{day}_{st}"] = ts

        # 8. Master Timetable Classes (Jadual Master 2026 Feb26)
        classes_data = [
            # JUMAAT Pagi 9.00 - 10.30
            ("JUMAAT_09:00", "FZ", "F4", "A", "NAK", 16),
            ("JUMAAT_09:00", "MATH_L", "F3", "A", "F", 18),
            ("JUMAAT_09:00", "SEJ_L", "F3", "B", "M", 14),
            ("JUMAAT_09:00", "BI_L", "F2", "A", "Z", 15),
            ("JUMAAT_09:00", "BM_P", "S6", "A", "K", 12),
            # JUMAAT Pagi 10.40 - 12.10
            ("JUMAAT_10:40", "BI", "F4", "A", "Z", 19),
            ("JUMAAT_10:40", "SEJ_L", "F3", "A", "M", 20),
            ("JUMAAT_10:40", "BM_L", "F3", "B", "K", 15),
            ("JUMAAT_10:40", "MATH_L", "F2", "A", "F", 17),
            ("JUMAAT_10:40", "BI_P", "S6", "A", "A", 14),
            # JUMAAT Petang 3.00 - 4.30
            ("JUMAAT_15:00", "ADDMT", "F5", "A", "Z", 21), # Exceed by 1 seat (-1)
            ("JUMAAT_15:00", "BI", "F5", "B", "Z", 18),
            ("JUMAAT_15:00", "SEJ", "F5", "C", "M", 16),
            ("JUMAAT_15:00", "ACC", "F4", "A", "AT", 15),
            ("JUMAAT_15:00", "BIO", "F4", "A", "AM", 17),
            # JUMAAT Petang 4.45 - 6.15
            ("JUMAAT_16:45", "SEJ", "F5", "B", "M", 19),
            ("JUMAAT_16:45", "ACC", "F5", "A", "AT", 14),
            ("JUMAAT_16:45", "SAINS", "F5", "C", "AM", 18),
            ("JUMAAT_16:45", "FZ", "F5", "C", "NAK", 20),
            ("JUMAAT_16:45", "ADDMT", "F4", "A", "Z", 22), # Exceed by 2 seats (-2)
            # SABTU Pagi 9.00 - 10.30
            ("SABTU_09:00", "MATH_P", "S6", "A", "FQ", 15),
            ("SABTU_09:00", "BI", "F4", "B", "Z", 17),
            ("SABTU_09:00", "KIM", "F4", "B", "SF", 16),
            ("SABTU_09:00", "SAINS_L", "F3", "A", "AZ", 19),
            ("SABTU_09:00", "MATH_L", "F3", "B", "SAF", 14),
            # SABTU Pagi 10.45 - 12.15
            ("SABTU_10:45", "SAINS_P", "S6", "A", "HS", 13),
            ("SABTU_10:45", "BM_L", "F2", "A", "K", 16),
            ("SABTU_10:45", "ADDMT", "F4", "B", "AZ", 18),
            ("SABTU_10:45", "BI_L", "F3", "A", "Z", 19),
            ("SABTU_10:45", "SAINS_L", "F3", "B", "AZ", 15),
            # SABTU Tengahari 12.30 - 2.00
            ("SABTU_12:30", "BM", "F5", "A", "G", 20),
            ("SABTU_12:30", "SAINS_L", "F2", "A", "AZ", 16),
            ("SABTU_12:30", "ADDMT", "F5", "B", "AZ", 18),
            ("SABTU_12:30", "FZ", "F4", "B", "NAK", 17),
            ("SABTU_12:30", "BM_L", "F3", "A", "K", 15),
            # SABTU Petang 2.15 - 3.45
            ("SABTU_14:15", "SAINS", "F5", "A", "AM", 18),
            ("SABTU_14:15", "KIM", "F5", "A", "SF", 19),
            ("SABTU_14:15", "FZ", "F5", "B", "NAK", 16),
            ("SABTU_14:15", "ADDMT", "F5", "C", "AZ", 15),
            ("SABTU_14:15", "SEJ", "F4", "A", "M", 20),
            # SABTU Petang 4.00 - 5.30
            ("SABTU_16:00", "SEJ", "F5", "A", "M", 20),
            ("SABTU_16:00", "FZ", "F5", "A", "NAK", 21),
            ("SABTU_16:00", "KIM", "F5", "B", "SF", 17),
            ("SABTU_16:00", "ACC", "F5", "B", "AT", 16),
            ("SABTU_16:00", "SAINS", "F4", "A", "AM", 18),
            # MALAM ISNIN
            ("ISNIN_20:30", "BIO", "F5", "B", "D", 17),
            ("ISNIN_20:30", "SAINS", "F5", "B", "AM", 18),
            ("ISNIN_20:30", "MATH", "F4", "A", "HK", 20),
            ("ISNIN_20:30", "BI_L", "F3", "B", "Z", 15),
            ("ISNIN_20:30", "SEJ", "F4", "B", "M", 16),
            # MALAM SELASA
            ("SELASA_20:30", "BI", "F5", "A", "Z", 19),
            ("SELASA_20:30", "MATH", "F5", "C", "HK", 16),
            ("SELASA_20:30", "BM", "F4", "A", "G", 18),
            ("SELASA_20:30", "BIO", "F4", "B", "AM", 15),
            # MALAM RABU
            ("RABU_20:30", "MATH", "F5", "A", "HK", 20),
            ("RABU_20:30", "BM", "F5", "B", "G", 17),
            ("RABU_20:30", "KIM", "F5", "C", "SF", 16),
            ("RABU_20:30", "SAINS", "F4", "B", "AM", 18),
            # MALAM KHAMIS
            ("KHAMIS_20:30", "BIO", "F5", "A", "D", 18),
            ("KHAMIS_20:30", "MATH", "F5", "B", "HK", 19),
            ("KHAMIS_20:30", "KIM", "F4", "A", "SF", 18),
            ("KHAMIS_20:30", "MATH", "F4", "B", "SAF", 17),
        ]
        cr_idx = 0
        all_created_classes = []
        for slot_k, sub_c, f_lvl, sec, t_code, enrolled in classes_data:
            if slot_k in slot_map and sub_c in sub_dict and t_code in t_dict:
                cl, _ = ClassTimetable.objects.update_or_create(
                    slot=slot_map[slot_k],
                    subject=sub_dict[sub_c],
                    form_level=f_lvl,
                    section=sec,
                    defaults={
                        "teacher": t_dict[t_code],
                        "classroom": cr_objs[cr_idx % len(cr_objs)],
                        "max_seats": 20,
                        "current_enrolled": enrolled
                    }
                )
                all_created_classes.append(cl)
                cr_idx += 1

        # 9. Reschedule Logs (from WhatsApp Image - Catatan Pembatalan dan Gantian Kelas)
        if all_created_classes:
            resched_samples = [
                (all_created_classes[0], "DEC '25", date(2025, 12, 9), date(2025, 12, 30), False, "PH", "Hari Krismas (PH)", True),
                (all_created_classes[1], "DEC '25", date(2025, 12, 10), date(2025, 12, 31), False, "PH", "Hari Krismas (PH)", True),
                (all_created_classes[2], "JAN '26", date(2026, 1, 23), date(2026, 1, 30), False, "MARKING_PAPER", "Cg marking paper", True),
                (all_created_classes[3], "JAN '26", date(2026, 1, 24), date(2026, 1, 31), False, "TIME_MISTAKE", "Cg silap tgk masa batal 30 min", True),
                (all_created_classes[4], "JAN '26", None, date(2026, 1, 31), True, "EXTRA_SESSION", "Sesi intensif kelas tambahan exam", True),
            ]
            for cl, m_lbl, tb, tg, is_ext, r_type, rem, apprv in resched_samples:
                ClassRescheduleLog.objects.get_or_create(
                    timetable_class=cl,
                    month_label=m_lbl,
                    tarikh_batal=tb,
                    tarikh_ganti=tg,
                    defaults={
                        "is_extra_class": is_ext,
                        "reason_type": r_type,
                        "remarks": rem,
                        "supervisor_approved": apprv,
                        "whatsapp_notification_sent": True
                    }
                )

        # 10. Sample Students with full checklists
        sample_students = [
            ("AN-2026-001", "Ahmad Daniyal bin Razali", "090514-03-5511", "MONTHLY", "F5", "SAINS", "SMK Telipot", "011-23456781", "Razali bin Mahmud", "012-9876541", "Jurutera", "PARENT_1", True, True, True, True, True),
            ("AN-2026-002", "Nur Aisyah binti Mohd Zaki", "090822-03-6622", "MONTHLY", "F5", "SAINS", "SMK Zainab 1", "011-23456782", "Mohd Zaki bin Salleh", "012-9876542", "Guru", "PARENT_1", True, True, True, True, True),
            ("AN-2026-003", "Muhammad Haziq bin Imran", "100311-03-7733", "MONTHLY", "F4", "SAINS", "SMK Sultan Ismail", "011-23456783", "Imran bin Abdullah", "012-9876543", "Peniaga", "PARENT_1", True, True, True, True, False),
            ("AN-2026-004", "Farah Nadiah binti Azman", "110425-03-8844", "MONTHLY", "F3", "GENERAL", "SMK Maktab Sultan Ismail", "011-23456784", "Azman bin Yusof", "012-9876544", "Pegawai Bank", "PARENT_1", True, True, True, False, False),
            ("AN-2026-005", "Amirul Hakim bin Shukri", "140212-03-9955", "MONTHLY", "S6", "GENERAL", "SK Telipot", "011-23456785", "Shukri bin Ramli", "012-9876545", "Pensyarah", "PARENT_1", True, True, True, True, True),
        ]
        for sid, name, ic, stype, flvl, strm, sch, sph, p1n, p1p, p1occ, pref, l, tel, sp, at, sy in sample_students:
            stud, _ = Student.objects.update_or_create(
                student_id=sid,
                defaults={
                    "full_name": name,
                    "ic_number": ic,
                    "student_type": stype,
                    "form_level": flvl,
                    "stream": strm,
                    "school_name": sch,
                    "phone_number": sph,
                    "join_date": date(2026, 1, 2),
                    "parent1_name": p1n,
                    "parent1_phone": p1p,
                    "parent1_occupation": p1occ,
                    "parent2_name": "Puan Halimah",
                    "parent2_phone": "013-8889999",
                    "preferred_contact": pref,
                    "checklist_ledger": l,
                    "checklist_whatsapp": tel,
                    "checklist_senarai_pelajar": sp,
                    "checklist_kedatangan": at,
                    "checklist_sistem_pembayaran": sy,
                    "status": "ACTIVE"
                }
            )
            # Enroll in 4 relevant classes
            matching_classes = [c for c in all_created_classes if c.form_level == flvl][:4]
            stud.enrolled_classes.set(matching_classes)

            # Create sample Invoice & Receipt
            inv, _ = Invoice.objects.update_or_create(
                invoice_number=f"INV-2026-{sid[-3:]}",
                defaults={
                    "student": stud,
                    "billing_month": date(2026, 3, 1),
                    "registration_fee": 30.00 if sid == "AN-2026-001" else 0.00,
                    "monthly_fee": 240.00 if flvl.startswith("F") else 200.00,
                    "total_payable": 270.00 if sid == "AN-2026-001" else (240.00 if flvl.startswith("F") else 200.00),
                    "total_paid": 270.00 if sid == "AN-2026-001" else (240.00 if flvl.startswith("F") else 200.00),
                    "balance_due": 0.00,
                    "status": "PAID",
                    "due_date": date(2026, 3, 7)
                }
            )
            PaymentReceipt.objects.update_or_create(
                receipt_number=f"REC-2026-{sid[-3:]}",
                defaults={
                    "invoice": inv,
                    "student": stud,
                    "payment_date": date(2026, 3, 4),
                    "amount_paid": inv.total_payable,
                    "payment_method": "DUITNOW_QR",
                    "reference_number": f"DNT-998822{sid[-3:]}",
                    "whatsapp_sent": True,
                    "received_by": "Admin 1 (Pejabat)"
                }
            )

        # 11. Payment Vouchers & Vendors
        v1, _ = Vendor.objects.update_or_create(
            vendor_id="VND-001",
            defaults={
                "vendor_name": "Pustaka Sri Telipot",
                "pic_name": "Encik Razak",
                "phone_number": "09-7441234",
                "bank_name": "CIMB Bank",
                "bank_account": "8600112233",
                "tin_number": "C-1234567890",
                "status": "ACTIVE"
            }
        )
        PaymentVoucher.objects.update_or_create(
            pv_number="PV26-0301",
            defaults={
                "date": date(2026, 3, 2),
                "vendor": v1,
                "category": "Alat Tulis & Buku Modul",
                "amount": 350.00,
                "items_description": "Pembelian kertas A4 10 rim dan modul latihan Fizik F5",
                "tier_level": "TIER_1",
                "status": "VERIFIED_ADMIN",
                "prepared_by": "Admin 1"
            }
        )
        PaymentVoucher.objects.update_or_create(
            pv_number="PV26-0302",
            defaults={
                "date": date(2026, 3, 5),
                "vendor": v1,
                "category": "Penyelenggaraan & Aircond",
                "amount": 1200.00,
                "items_description": "Servis 4 unit penghawa dingin bilik darjah tingkat 1",
                "tier_level": "TIER_2",
                "status": "APPROVED_SUPERVISOR",
                "prepared_by": "Admin 2",
                "approved_by": "Supervisor (Cg Maheran)"
            }
        )

        self.stdout.write(self.style.SUCCESS("All Pusat Tuisyen An Nur 2026 operational data seeded successfully!"))
