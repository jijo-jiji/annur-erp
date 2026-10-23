"""Drop-down lists used by the lead funnel, kept in Data induk so the centre can add or retire choices itself.

Defaults are loaded by the migration that introduced them and by `seed_data`; after that the centre owns them.
Campaigns start empty: they are the centre's own marketing names (existing leads' campaigns are carried over)."""

CAMPAIGN_CATEGORY = '22_lead_campaign'
ACTION_CATEGORY = '23_lead_action'
LOST_REASON_CATEGORY = '24_lost_reason'

LEAD_LIST_DEFAULTS = {
    ACTION_CATEGORY: [
        ('WHATSAPP', 'WhatsApp'), ('CALL', 'Panggilan telefon'), ('CONTENT', 'Hantar content'), ('TRIAL_CLASS', 'Kelas percubaan'),
        ('WALK_IN', 'Walk-in kaunter'), ('EMAIL', 'E-mel'), ('OTHER', 'Lain-lain'),
    ],
    LOST_REASON_CATEGORY: [
        ('PRICE', 'Yuran terlalu tinggi'), ('DISTANCE', 'Jarak terlalu jauh'), ('TIME', 'Masa tidak sesuai'),
        ('OTHER_CENTRE', 'Memilih pusat tuisyen lain'), ('NO_RESPONSE', 'Tiada respons'), ('NOT_READY', 'Belum bersedia / tangguh'),
        ('OTHER', 'Lain-lain'),
    ],
}
