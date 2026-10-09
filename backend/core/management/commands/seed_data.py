from django.core.management import call_command
from django.core.management.base import BaseCommand
from datetime import date
from business_config.models import SubjectMaster, PricingTier, BusinessSetting, TeacherRateSetting, DynamicMasterData
from teachers.models import Teacher, StaffMember, LeaveRequest
from academic.models import Classroom, TimeSlot, ClassTimetable, ClassRescheduleLog, LessonHandout
from students.models import Student, Lead
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
            ("CENTER_NAME", "Pusat Tuisyen An Nur", "Nama pusat tuisyen"),
            ("CENTER_BRANCH", "Telipot", "Cawangan"),
            ("CENTER_PHONE", "013-983 8085", "Nombor telefon pusat"),
            ("CENTER_WHATSAPP", "60139838085", "Nombor WhatsApp pusat"),
            ("CENTER_ADDRESS", "Tingkat 1 & 2, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan", "Alamat pusat"),
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
        # Seat usage comes from actual student enrolments, so the last tuple value is not stored
        for slot_k, sub_c, f_lvl, sec, t_code, _expected_size in classes_data:
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

        # 10. Sample Students
        sample_students = [
            ("AN-2026-001", "Ahmad Daniyal bin Razali", "090514-03-5511", "MONTHLY", "F5", "SAINS", "SMK Telipot", "011-23456781", "Razali bin Mahmud", "012-9876541", "Jurutera", "PARENT_1"),
            ("AN-2026-002", "Nur Aisyah binti Mohd Zaki", "090822-03-6622", "MONTHLY", "F5", "SAINS", "SMK Zainab 1", "011-23456782", "Mohd Zaki bin Salleh", "012-9876542", "Guru", "PARENT_1"),
            ("AN-2026-003", "Muhammad Haziq bin Imran", "100311-03-7733", "MONTHLY", "F4", "SAINS", "SMK Sultan Ismail", "011-23456783", "Imran bin Abdullah", "012-9876543", "Peniaga", "PARENT_1"),
            ("AN-2026-004", "Farah Nadiah binti Azman", "110425-03-8844", "MONTHLY", "F3", "GENERAL", "SMK Maktab Sultan Ismail", "011-23456784", "Azman bin Yusof", "012-9876544", "Pegawai Bank", "PARENT_1"),
            ("AN-2026-005", "Amirul Hakim bin Shukri", "140212-03-9955", "MONTHLY", "S6", "GENERAL", "SK Telipot", "011-23456785", "Shukri bin Ramli", "012-9876545", "Pensyarah", "PARENT_1"),
        ]
        for sid, name, ic, stype, flvl, strm, sch, sph, p1n, p1p, p1occ, pref in sample_students:
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

        # 12. Dynamic Master Data (All 21 Categories from SOP j-status.doc)
        self.stdout.write("Seeding all 21 Dynamic Master Data categories...")
        master_seed_data = [
            # 1. Form / Tingkatan
            ("1_form", "S1", "Darjah 1", {"level": "PRIMARY", "order": 1, "next": "S2", "description": ""}, "APPROVED"),
            ("1_form", "S2", "Darjah 2", {"level": "PRIMARY", "order": 2, "next": "S3", "description": ""}, "APPROVED"),
            ("1_form", "S3", "Darjah 3", {"level": "PRIMARY", "order": 3, "next": "S4", "description": ""}, "APPROVED"),
            ("1_form", "S4", "Darjah 4", {"level": "PRIMARY", "order": 4, "next": "S5", "description": ""}, "APPROVED"),
            ("1_form", "S5", "Darjah 5", {"level": "PRIMARY", "order": 5, "next": "S6", "description": ""}, "APPROVED"),
            ("1_form", "S6", "Darjah 6", {"level": "PRIMARY", "order": 6, "next": "F1", "description": ""}, "APPROVED"),
            ("1_form", "F1", "Tingkatan 1", {"level": "LOWER", "order": 7, "next": "F2", "description": ""}, "APPROVED"),
            ("1_form", "F2", "Tingkatan 2", {"level": "LOWER", "order": 8, "next": "F3", "description": ""}, "APPROVED"),
            ("1_form", "F3", "Tingkatan 3", {"level": "LOWER", "order": 9, "next": "F4", "description": ""}, "APPROVED"),
            ("1_form", "F4", "Tingkatan 4", {"level": "UPPER", "order": 10, "next": "F5", "description": ""}, "APPROVED"),
            ("1_form", "F5", "Tingkatan 5", {"level": "UPPER", "order": 11, "next": "", "description": ""}, "APPROVED"),

            # 2. Subjek Diminati (Interested Subjects)
            ("2_interested_sub", "FZ", "Fizik (SPM)", {"stream": "Sains", "code": 4531}, "APPROVED"),
            ("2_interested_sub", "KIM", "Kimia (SPM)", {"stream": "Sains", "code": 4541}, "APPROVED"),
            ("2_interested_sub", "BIO", "Biologi (SPM)", {"stream": "Sains", "code": 4551}, "APPROVED"),
            ("2_interested_sub", "ADDMT", "Matematik Tambahan (SPM)", {"stream": "Sains", "code": 3472}, "APPROVED"),
            ("2_interested_sub", "MATH", "Matematik Teras (SPM)", {"stream": "Teras", "code": 1449}, "APPROVED"),
            ("2_interested_sub", "BM", "Bahasa Melayu (SPM)", {"stream": "Teras", "code": 1103}, "APPROVED"),
            ("2_interested_sub", "BI", "Bahasa Inggeris (SPM)", {"stream": "Teras", "code": 1119}, "APPROVED"),
            ("2_interested_sub", "SEJ", "Sejarah (SPM)", {"stream": "Teras", "code": 1249}, "APPROVED"),
            ("2_interested_sub", "ACC", "Prinsip Perakaunan (SPM)", {"stream": "Sastera", "code": 3756}, "APPROVED"),
            ("2_interested_sub", "SAINS_L", "Sains Menengah Rendah (F1-F3)", {"stream": "Teras"}, "APPROVED"),
            ("2_interested_sub", "MATH_L", "Matematik Menengah Rendah (F1-F3)", {"stream": "Teras"}, "APPROVED"),

            # 3. Saluran Lead / Sumber (Lead Source)
            ("3_lead_source", "BANNER", "Banner & Bunting Telipot", {"type": "Offline"}, "APPROVED"),
            ("3_lead_source", "TIKTOK", "TikTok Ads / Live", {"type": "Digital"}, "APPROVED"),
            ("3_lead_source", "FB", "Facebook Ads & Page", {"type": "Digital"}, "APPROVED"),
            ("3_lead_source", "IG", "Instagram Post & Reels", {"type": "Digital"}, "APPROVED"),
            ("3_lead_source", "WHATSAPP", "WhatsApp Rasmi / Rujukan Rakan", {"type": "Direct"}, "APPROVED"),
            ("3_lead_source", "WALKIN", "Kunjungan Kaunter Pejabat", {"type": "Direct"}, "APPROVED"),
            ("3_lead_source", "FLYER", "Edaran Risalah Sekolah", {"type": "Offline"}, "APPROVED"),
            ("3_lead_source", "WARIS", "Cadangan Ibu Bapa / Alumni", {"type": "Referral"}, "APPROVED"),

            # 4. Jenis Pelajar (Student Type)
            ("4_student_type", "MONTHLY", "Bulanan (Tetap Berjadual)", {"fee_type": "Monthly Subscription"}, "APPROVED"),
            ("4_student_type", "WALK_IN", "Walk-in (Bayar Per Sesi)", {"fee_type": "Per Session RM25"}, "APPROVED"),
            ("4_student_type", "INTENSIVE", "Program Percubaan / Intensif", {"fee_type": "Modular"}, "APPROVED"),
            ("4_student_type", "SCHOLARSHIP", "Biasiswa An Nur / Bantuan Asnaf", {"fee_type": "Subsidized"}, "APPROVED"),

            # 5. Gred Persekolahan (Grade Progression)
            ("5_grade", "RENDAH_1", "Sekolah Rendah Tahap 1 (Darjah 1-3)", {"next_level": "Tahap 2"}, "APPROVED"),
            ("5_grade", "RENDAH_2", "Sekolah Rendah Tahap 2 (Darjah 4-6)", {"next_level": "Menengah Rendah"}, "APPROVED"),
            ("5_grade", "MEN_RENDAH", "Menengah Rendah (Tingkatan 1-3)", {"next_level": "Menengah Atas"}, "APPROVED"),
            ("5_grade", "MEN_ATAS", "Menengah Atas (Tingkatan 4-5)", {"next_level": "SPM Candidate"}, "APPROVED"),

            # 6. Nama Sekolah (18 Kota Bharu Schools)
            ("6_school", "SMK_TELIPOT", "SMK Telipot", {"kod": "DEA1123", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMK_ZAINAB1", "SMK Zainab 1", {"kod": "DEA1124", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMK_ZAINAB2", "SMK Zainab 2", {"kod": "DEA1125", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMK_SIC", "SMK Sultan Ismail (SIC)", {"kod": "DEA1126", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMK_KOLEJ", "SMK Maktab Sultan Ismail (Kolej)", {"kod": "DEA1127", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMS_FARIS", "SMS Tengku Muhammad Faris Petra", {"kod": "DEA1128", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "MAAHAD_MML", "Maahad Muhammadi Lelaki (MML)", {"kod": "DFT1001", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "MAAHAD_MMP", "Maahad Muhammadi Perempuan (MMP)", {"kod": "DFT1002", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMK_KOTA", "SMK Kota", {"kod": "DEA1129", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SMK_ISMAIL_PETRA", "SMK Ismail Petra", {"kod": "DEA1130", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SK_TELIPOT", "SK Telipot", {"kod": "DBA1011", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SK_SULTAN_ISMAIL_1", "SK Sultan Ismail 1", {"kod": "DBA1012", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SK_ZAINAB_1", "SK Zainab 1", {"kod": "DBA1013", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SK_SULTAN_ISMAIL_2", "SK Sultan Ismail 2", {"kod": "DBA1014", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SK_KOTA", "SK Kota", {"kod": "DBA1015", "daerah": "Kota Bharu"}, "APPROVED"),
            ("6_school", "SK_KUBANG_KERIAN_1", "SK Kubang Kerian 1", {"kod": "DBA1016", "daerah": "Kubang Kerian"}, "APPROVED"),
            ("6_school", "SMK_KUBANG_KERIAN_1", "SMK Kubang Kerian 1", {"kod": "DEA1131", "daerah": "Kubang Kerian"}, "APPROVED"),
            ("6_school", "SMKA_NAIM", "SMKA Naim Lilbanat", {"kod": "DRA1001", "daerah": "Kota Bharu"}, "APPROVED"),

            # 7. Kategori Umur Penjaga (Parent Age Group)
            ("7_parent_age", "AGE_25_35", "25 - 35 Tahun (Generasi Muda)", {"focus": "Anak Sekolah Rendah"}, "APPROVED"),
            ("7_parent_age", "AGE_36_45", "36 - 45 Tahun (Menengah Rendah)", {"focus": "Anak Menengah Rendah"}, "APPROVED"),
            ("7_parent_age", "AGE_46_55", "46 - 55 Tahun (Calon SPM)", {"focus": "Calon SPM Utama"}, "APPROVED"),
            ("7_parent_age", "AGE_56_ABOVE", "56 Tahun ke Atas (Warga Emas/Penjaga)", {"focus": "Waris / Datuk / Nenek"}, "APPROVED"),

            # 8. Pakej Subjek Aktif (Active Subject Packages)
            ("8_active_sub", "PKG_4_SUB", "Pakej 4 Subjek (RM240 / RM60 per sub)", {"count": 4, "price": 240.0}, "APPROVED"),
            ("8_active_sub", "PKG_5_SUB", "Pakej 5 Subjek (RM275 / RM55 per sub)", {"count": 5, "price": 275.0}, "APPROVED"),
            ("8_active_sub", "PKG_6_SUB", "Pakej 6 Subjek (RM330 / RM55 per sub)", {"count": 6, "price": 330.0}, "APPROVED"),
            ("8_active_sub", "PKG_7_SUB", "Pakej 7 Subjek (RM350 / RM50 per sub)", {"count": 7, "price": 350.0}, "APPROVED"),
            ("8_active_sub", "PKG_8_SUB", "Pakej 8 Subjek (RM400 / RM50 per sub)", {"count": 8, "price": 400.0}, "APPROVED"),

            # 9. Subjek Walk-in (Walk-in Subjects)
            ("9_walkin_sub", "WI_FZ", "Walk-in Fizik SPM (RM25/sesi)", {"rate": 25.0}, "APPROVED"),
            ("9_walkin_sub", "WI_KIM", "Walk-in Kimia SPM (RM25/sesi)", {"rate": 25.0}, "APPROVED"),
            ("9_walkin_sub", "WI_ADDMT", "Walk-in Add Math SPM (RM25/sesi)", {"rate": 25.0}, "APPROVED"),
            ("9_walkin_sub", "WI_MATH", "Walk-in Matematik Teras (RM25/sesi)", {"rate": 25.0}, "APPROVED"),
            ("9_walkin_sub", "WI_BIO", "Walk-in Biologi SPM (RM25/sesi)", {"rate": 25.0}, "APPROVED"),

            # 10. Jenis Peperiksaan (Exam Type)
            ("10_exam_type", "UASA", "Ujian Akhir Sesi Akademik (UASA)", {"level": "F1 - F3"}, "APPROVED"),
            ("10_exam_type", "SPM_TRIAL", "Peperiksaan Percubaan SPM Negeri", {"level": "F5"}, "APPROVED"),
            ("10_exam_type", "SPM_SEBENAR", "Peperiksaan SPM Sebenar (LPM)", {"level": "F5"}, "APPROVED"),
            ("10_exam_type", "PPT", "Peperiksaan Pertengahan Tahun", {"level": "Semua Tingkatan"}, "APPROVED"),
            ("10_exam_type", "UPKK", "Ujian Penilaian Kelas KAFA", {"level": "Rendah"}, "APPROVED"),

            # 11. Gred Akademik (Academic Grade)
            ("11_academic_grade", "AP", "A+ (Cemerlang Tertinggi: 90 - 100)", {"points": 4.0}, "APPROVED"),
            ("11_academic_grade", "A", "A (Cemerlang Tinggi: 80 - 89)", {"points": 4.0}, "APPROVED"),
            ("11_academic_grade", "AM", "A- (Cemerlang: 75 - 79)", {"points": 3.7}, "APPROVED"),
            ("11_academic_grade", "BP", "B+ (Kepujian Tertinggi: 70 - 74)", {"points": 3.3}, "APPROVED"),
            ("11_academic_grade", "B", "B (Kepujian Tinggi: 65 - 69)", {"points": 3.0}, "APPROVED"),
            ("11_academic_grade", "CP", "C+ (Kepujian: 60 - 64)", {"points": 2.7}, "APPROVED"),
            ("11_academic_grade", "C", "C (Lulus: 50 - 59)", {"points": 2.0}, "APPROVED"),
            ("11_academic_grade", "D", "D (Lulus Atas: 40 - 49)", {"points": 1.5}, "APPROVED"),
            ("11_academic_grade", "E", "E (Lulus Bersyarat: 30 - 39)", {"points": 1.0}, "APPROVED"),
            ("11_academic_grade", "G", "G (Gagal: < 30)", {"points": 0.0}, "APPROVED"),

            # 12. Subjek Akademik (Academic Subjects)
            ("12_academic_sub", "SUB_4531", "Fizik Kertas SPM (4531)", {"paper": "P1, P2, P3"}, "APPROVED"),
            ("12_academic_sub", "SUB_4541", "Kimia Kertas SPM (4541)", {"paper": "P1, P2, P3"}, "APPROVED"),
            ("12_academic_sub", "SUB_4551", "Biologi Kertas SPM (4551)", {"paper": "P1, P2, P3"}, "APPROVED"),
            ("12_academic_sub", "SUB_3472", "Matematik Tambahan (3472)", {"paper": "P1, P2"}, "APPROVED"),
            ("12_academic_sub", "SUB_1449", "Matematik Teras (1449)", {"paper": "P1, P2"}, "APPROVED"),
            ("12_academic_sub", "SUB_1103", "Bahasa Melayu (1103)", {"paper": "P1, P2, P3, P4"}, "APPROVED"),
            ("12_academic_sub", "SUB_1119", "Bahasa Inggeris (1119)", {"paper": "P1, P2, P3, P4"}, "APPROVED"),
            ("12_academic_sub", "SUB_1249", "Sejarah (1249)", {"paper": "P1, P2"}, "APPROVED"),

            # 13. Julat Markah (Mark Band)
            ("13_mark_band", "BAND_A", "80% - 100% (Tahap Cemerlang)", {"min": 80, "max": 100}, "APPROVED"),
            ("13_mark_band", "BAND_B", "65% - 79% (Tahap Kepujian)", {"min": 65, "max": 79}, "APPROVED"),
            ("13_mark_band", "BAND_C", "50% - 64% (Tahap Memuaskan)", {"min": 50, "max": 64}, "APPROVED"),
            ("13_mark_band", "BAND_D", "40% - 49% (Tahap Lulus)", {"min": 40, "max": 49}, "APPROVED"),
            ("13_mark_band", "BAND_E", "0% - 39% (Tahap Intervensi Khas)", {"min": 0, "max": 39}, "APPROVED"),

            # 14. Sebab Berhenti / Drop (Drop Reasons)
            ("14_drop_reason", "ASRAMA", "Tawaran MRSM / SBP / Asrama Penuh", {"category": "Peluang Pendidikan"}, "APPROVED"),
            ("14_drop_reason", "PINDAH", "Pindah Sekolah / Daerah Luar Kota Bharu", {"category": "Relokasi"}, "APPROVED"),
            ("14_drop_reason", "KEWANGAN", "Kekangan Kewangan Keluarga", {"category": "Kewangan"}, "APPROVED"),
            ("14_drop_reason", "MASA", "Jadual Sekolah Bertindih / Kokurikulum", {"category": "Masa"}, "APPROVED"),
            ("14_drop_reason", "KENDERAAN", "Ketiadaan Pengangkutan ke Pusat Telipot", {"category": "Logistik"}, "APPROVED"),
            ("14_drop_reason", "LAIN", "Alasan Peribadi / Masalah Kesihatan", {"category": "Lain-lain"}, "APPROVED"),

            # 15. Kategori Guru (Teacher Type)
            ("15_teacher_type", "PERMANENT", "Guru Tetap Berjadual (Permanent)", {"rate": 60.0}, "APPROVED"),
            ("15_teacher_type", "REPLACEMENT", "Guru Pengganti Berdaftar (Active Replacement)", {"rate": 55.0}, "APPROVED"),
            ("15_teacher_type", "SPECIALIST", "Penceramah Bengkel & Seminar Khas", {"rate": 100.0}, "APPROVED"),

            # 16. Subjek Pengajaran Guru (Teacher Subjects)
            ("16_teacher_sub", "TS_FZ", "Pengkhususan Fizik Menengah Atas", {"subject": "FZ"}, "APPROVED"),
            ("16_teacher_sub", "TS_KIM", "Pengkhususan Kimia Menengah Atas", {"subject": "KIM"}, "APPROVED"),
            ("16_teacher_sub", "TS_BIO", "Pengkhususan Biologi Menengah Atas", {"subject": "BIO"}, "APPROVED"),
            ("16_teacher_sub", "TS_ADDMT", "Pengkhususan Matematik Tambahan", {"subject": "ADDMT"}, "APPROVED"),
            ("16_teacher_sub", "TS_MATH", "Pengkhususan Matematik Menengah/Rendah", {"subject": "MATH"}, "APPROVED"),
            ("16_teacher_sub", "TS_LANG", "Pengkhususan Bahasa Melayu & Sejarah", {"subject": "BM_SEJ"}, "APPROVED"),

            # 17. Tahap Kelayakan Guru (Teacher Qualification Grade)
            ("17_teacher_grade", "DEG_EDU", "Ijazah Sarjana Muda Pendidikan KPM", {"level": "Ijazah"}, "APPROVED"),
            ("17_teacher_grade", "MASTER_PHD", "Sarjana / Doktor Falsafah Bidang Berkaitan", {"level": "Pascasiswazah"}, "APPROVED"),
            ("17_teacher_grade", "EX_EXAMINER", "Pemeriksa Kertas Peperiksaan SPM Rasmi", {"level": "Pakar SPM"}, "APPROVED"),
            ("17_teacher_grade", "EXPERT_10YR", "Guru Cemerlang Pengalaman > 10 Tahun", {"level": "Senior"}, "APPROVED"),

            # 18. Kategori Baucar Bayaran (Expense Category)
            ("18_expense_cat", "SEWA", "Sewa Premis Bangunan (PT 105 Seksyen 23)", {"budget": 3500.0}, "APPROVED"),
            ("18_expense_cat", "UTILITI", "Bil Utiliti TNB Elektrik & Air Kelantan AKSB", {"budget": 1200.0}, "APPROVED"),
            ("18_expense_cat", "ALAT_TULIS", "Kertas Modul, Risograf & Alat Tulis Pejabat", {"budget": 800.0}, "APPROVED"),
            ("18_expense_cat", "SELENGGARA", "Penyelenggaraan & Servis Aircond Bilik Kuliah", {"budget": 600.0}, "APPROVED"),
            ("18_expense_cat", "ELAUN_STAF", "Gaji Pokok & Elaun Kerja Lebih Masa Staf", {"budget": 4500.0}, "APPROVED"),
            ("18_expense_cat", "PEMASARAN", "Pemasaran (TikTok Ads, Banner & Edaran Flyers)", {"budget": 1000.0}, "APPROVED"),
            ("18_expense_cat", "JAMUAN", "Jamuan Mesyuarat Guru & Program Motivasi Pelajar", {"budget": 500.0}, "APPROVED"),

            # 19. Sub-kategori Perbelanjaan (Expense Subcategory)
            ("19_expense_subcat", "SUB_TNB", "Tenaga Nasional Berhad (Elektrik Pusat)", {"cat": "UTILITI"}, "APPROVED"),
            ("19_expense_subcat", "SUB_AKSB", "Air Kelantan Sdn Bhd (Bekalan Air)", {"cat": "UTILITI"}, "APPROVED"),
            ("19_expense_subcat", "SUB_PAPER", "Kertas A4 70gsm/80gsm (Pustaka Sri Telipot)", {"cat": "ALAT_TULIS"}, "APPROVED"),
            ("19_expense_subcat", "SUB_TONER", "Toner Mesin Cetak Risograph Digital", {"cat": "ALAT_TULIS"}, "APPROVED"),
            ("19_expense_subcat", "SUB_AIRCOND", "Servis Cuci Filter & Tambah Gas R32 Aircond", {"cat": "SELENGGARA"}, "APPROVED"),
            ("19_expense_subcat", "SUB_CLEANING", "Bahan Pencuci & Sanitasi Pusat", {"cat": "SELENGGARA"}, "APPROVED"),

            # 20. Pembekal / Vendor (Vendor Master)
            ("20_vendor", "VND_001", "Pustaka Sri Telipot", {"pic": "Encik Razak", "phone": "09-7441234", "bank": "CIMB 8600112233"}, "APPROVED"),
            ("20_vendor", "VND_002", "Kolej Cool Aircond Services", {"pic": "Tuan Hafiz", "phone": "013-9223344", "bank": "Maybank 514011223344"}, "APPROVED"),
            ("20_vendor", "VND_003", "Tenaga Nasional Berhad", {"pic": "Kaunter KB", "phone": "1-300-88-5454", "bank": "Autodebit"}, "APPROVED"),
            ("20_vendor", "VND_004", "Air Kelantan Sdn Bhd (AKSB)", {"pic": "Cawangan KB", "phone": "09-7437777", "bank": "Autodebit"}, "APPROVED"),
            ("20_vendor", "VND_005", "Percetakan Kota Bharu Sdn Bhd", {"pic": "Cikgu Amin", "phone": "019-9887766", "bank": "Bank Islam 03018020011223"}, "APPROVED"),

            # 21. Kaedah Pembayaran Yuran (Payment Methods)
            ("21_payment_method", "DUITNOW_QR", "DuitNow QR Rasmi Pusat (Maybank)", {"acc": "564011223344", "instant": True}, "APPROVED"),
            ("21_payment_method", "ONLINE_TRANSFER", "Perbankan Atas Talian (FPX / Pindahan Bank)", {"acc": "Maybank / CIMB", "instant": True}, "APPROVED"),
            ("21_payment_method", "CASH", "Tunai di Kaunter Pejabat Tingkat 1", {"receipt": "Manual & Digital"}, "APPROVED"),
            ("21_payment_method", "DEBIT_CARD", "Kad Debit Melalui Mesin EDC Kaunter", {"terminal": "Maybank POS"}, "APPROVED"),
        ]

        for cat, code, label, meta, st in master_seed_data:
            DynamicMasterData.objects.update_or_create(
                category=cat,
                code=code,
                defaults={
                    "label": label,
                    "meta_info": meta,
                    "status": st,
                    "created_by": "System Seeder",
                    "approved_by": "Pengurusan Pusat An Nur",
                    "is_locked": True
                }
            )

        # 13. CRM Leads (Kanban Conversion Funnel)
        self.stdout.write("Seeding CRM Leads...")
        sample_leads = [
            ("LD-2026-001", "Muhammad Danish bin Faizal", "Encik Faizal", "019-9881122", "danish@gmail.com", "F5", "SMK Telipot", "TIKTOK", ["FZ", "KIM", "ADDMT"], "ENQUIRY", None, "", "Admin 1", "Berminat pakej 5 subjek SPM aliran Sains"),
            ("LD-2026-002", "Nurul Izzati binti Rosli", "Puan Rosli", "019-9882233", "izzati@gmail.com", "F4", "SMK Zainab 1", "FB", ["BIO", "KIM"], "TRIAL", date(2026, 3, 10), "Hadir kelas percubaan Fizik & Kimia Sabtu lepas, waris sangat berpuas hati.", "Admin 2", "Menunggu pengesahan pendaftaran rasmi awal bulan depan."),
            ("LD-2026-003", "Wan Arif bin Wan Kamal", "Wan Kamal", "019-9883344", "arif@gmail.com", "F3", "SMK Sultan Ismail", "WHATSAPP", ["MATH_L", "SAINS_L"], "REGISTERED", date(2026, 2, 25), "Selesai kelas trial dan terus bayar yuran pendaftaran.", "Admin 1", "Telah didaftarkan sebagai pelajar tetap."),
            ("LD-2026-004", "Siti Aisyah binti Khairul", "Khairul", "019-9884455", "aisyah@gmail.com", "S6", "SK Telipot", "FLYER", ["MATH_P", "SAINS_P"], "ENQUIRY", None, "", "Admin 2", "Ibu bertanya tentang persediaan UASA Darjah 6"),
        ]
        for lid, sname, pname, ph, em, flvl, sch, src, subs, st, tdate, tfb, asgn, nts in sample_leads:
            Lead.objects.update_or_create(
                lead_id=lid,
                defaults={
                    "student_name": sname,
                    "parent_name": pname,
                    "phone": ph,
                    "email": em,
                    "form_level": flvl,
                    "school_name": sch,
                    "lead_source": src,
                    "interested_subjects": subs,
                    "status": st,
                    "trial_date": tdate,
                    "trial_feedback": tfb,
                    "assigned_to": asgn,
                    "notes": nts
                }
            )

        # 14. Staff HR & Attendance & Leaves
        self.stdout.write("Seeding Staff HR, Attendance & Leaves...")
        stf1, _ = StaffMember.objects.update_or_create(
            staff_id="STF-001",
            defaults={
                "name": "Siti Aminah Binti Ahmad",
                "role": "Pegawai Pentadbiran & Kaunter (Admin 1)",
                "department": "Pentadbiran & Khidmat Pelanggan",
                "ic_number": "960412-03-5124",
                "phone": "013-9123456",
                "email": "siti.annur@gmail.com",
                "join_date": date(2024, 1, 1),
                "al_entitlement": 11,
                "mc_entitlement": 12,
                "el_entitlement": 2,
                "is_active": True
            }
        )
        stf2, _ = StaffMember.objects.update_or_create(
            staff_id="STF-002",
            defaults={
                "name": "Norhafizah Binti Razali",
                "role": "Pegawai Pentadbiran & Media Sosial (Admin 2)",
                "department": "Pentadbiran & Pemasaran",
                "ic_number": "980915-03-5322",
                "phone": "013-9876544",
                "email": "fizah.annur@gmail.com",
                "join_date": date(2024, 6, 1),
                "al_entitlement": 12,
                "mc_entitlement": 13,
                "el_entitlement": 3,
                "is_active": True
            }
        )
        stf3, _ = StaffMember.objects.update_or_create(
            staff_id="STF-003",
            defaults={
                "name": "Cikgu Maheran (Supervisor)",
                "role": "Penyelia Akademik & Operasi (Supervisor)",
                "department": "Pengurusan Akademik",
                "ic_number": "850210-03-5001",
                "phone": "019-9110016",
                "email": "maheran.annur@gmail.com",
                "join_date": date(2022, 1, 1),
                "al_entitlement": 14,
                "mc_entitlement": 14,
                "el_entitlement": 3,
                "is_active": True
            }
        )

        # Staff Attendance
        # Staff Leaves
        LeaveRequest.objects.update_or_create(
            leave_id="LV-2026-01",
            defaults={
                "staff": stf1,
                "leave_type": "MC",
                "start_date": date(2026, 2, 18),
                "end_date": date(2026, 2, 19),
                "days_count": 2,
                "reason": "Demam panas & sakit tekak (Klinik Perdana Telipot)",
                "mc_document": "MC_SitiAminah_18Feb.pdf",
                "status": "APPROVED",
                "supervisor_remark": "Diluluskan oleh Supervisor (Cg Maheran)."
            }
        )
        LeaveRequest.objects.update_or_create(
            leave_id="LV-2026-02",
            defaults={
                "staff": stf2,
                "leave_type": "AL",
                "start_date": date(2026, 3, 15),
                "end_date": date(2026, 3, 16),
                "days_count": 2,
                "reason": "Urusan keluarga di Pasir Mas",
                "mc_document": None,
                "status": "PENDING",
                "supervisor_remark": ""
            }
        )

        # 15. Lesson Handouts Repository
        self.stdout.write("Seeding Lesson Handouts...")
        sample_handouts = [
            ("HND-001", "Modul SPM 2026: Gelombang, Cahaya & Optik", "F5", "FIZIK", "F5 FIZIK (A) NAK", "Nik Ahmad Khan (NAK)", "Modul_Fizik_F5_Optik.pdf", "3.4 MB", 20, 20, "PRINT_READY", "Latihan intensif Kertas 2 Bahagian B & C untuk persediaan peperiksaan percubaan."),
            ("HND-002", "Nota Ringkas & Formula Lanjutan: Pembezaan & Pengamiran", "F5", "ADDMT", "F5 ADDMT (A) Z", "Zamri / Zakir (Z)", "AddMath_Form5_Calculus.pdf", "2.1 MB", 22, 22, "PRINT_READY", "Kompilasi rumus penting dan teknik menjawab soalan graf fungsi kuadratik."),
            ("HND-003", "Topical Drill: Thermochemistry & Electrochemistry", "F4", "KIMIA", "F4 KIM (B) SF", "Saiful (SF)", "Kimia_F4_Elektrokimia.pdf", "4.2 MB", 18, 0, "NEEDS_PRINTING", "Soalan ramalan bertopik untuk kelas Sabtu pagi. Perlu dicetak sebelum Jumaat petang."),
            ("HND-004", "Model Essay Bank: SPM Continuous Writing & Directed Writing", "F5", "BI", "F5 BI (B) Z", "Zakir (Z)", "SPM_English_Essays.pdf", "1.8 MB", 18, 18, "PRINT_READY", "Contoh karangan Gred A+ beserta senarai kosa kata aras tinggi (CEFR C1)."),
            ("HND-005", "Latihan Topikal: Operasi Pecahan & Perpuluhan Lanjutan", "S6", "MATH", "S6 MATH FQ", "Faqihah (FQ)", "Math_Darjah6_Pecahan.pdf", "1.5 MB", 15, 15, "PRINT_READY", "Modul asas pengukuhan Matematik Darjah 6 untuk sesi intensif Sabtu."),
        ]
        for hid, tit, flvl, sname, ccode, tname, fname, fsz, cneed, cprt, st, desc in sample_handouts:
            LessonHandout.objects.update_or_create(
                handout_id=hid,
                defaults={
                    "title": tit,
                    "form_level": flvl,
                    "subject_name": sname,
                    "class_code": ccode,
                    "teacher_name": tname,
                    "file_name": fname,
                    "file_size": fsz,
                    "copies_needed": cneed,
                    "copies_printed": cprt,
                    "status": st,
                    "description": desc
                }
            )

        call_command('seed_users', stdout=self.stdout)

        # Link the office staff records to their login accounts so they clock in and apply for leave as themselves
        from django.contrib.auth.models import User
        for staff_code, username in (('STF-001', 'admin1'), ('STF-002', 'admin2'), ('STF-003', 'supervisor')):
            user = User.objects.filter(username=username).first()
            if user and not StaffMember.objects.filter(user=user).exists():
                StaffMember.objects.filter(staff_id=staff_code, user=None).update(user=user)

        self.stdout.write(self.style.SUCCESS("All Pusat Tuisyen An Nur 2026 operational data seeded successfully!"))

