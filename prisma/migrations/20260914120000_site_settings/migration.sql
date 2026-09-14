-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "contact_email" TEXT,
    "contact_address" TEXT,
    "legal_name" TEXT,
    "trade_registry_no" TEXT,
    "tax_office" TEXT,
    "tax_no" TEXT,
    "mersis_no" TEXT,
    "phone" TEXT,
    "phone_display" TEXT,
    "rfq_notify_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

