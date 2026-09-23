-- CreateTable
CREATE TABLE "home_content" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "cert_marks" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_content_translations" (
    "id" TEXT NOT NULL,
    "home_content_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "kicker" TEXT,
    "title" TEXT,
    "lead" TEXT,
    "no_prices" TEXT,
    "credibility_title" TEXT,
    "capability" TEXT,
    "cta_title" TEXT,
    "industries_title" TEXT,
    "industries_sub" TEXT,
    "categories_title" TEXT,
    "manufacturers_title" TEXT,

    CONSTRAINT "home_content_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "photo_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member_translations" (
    "id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT,

    CONSTRAINT "team_member_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_content_key_key" ON "home_content"("key");

-- CreateIndex
CREATE UNIQUE INDEX "home_content_translations_home_content_id_locale_key" ON "home_content_translations"("home_content_id", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "team_member_translations_member_id_locale_key" ON "team_member_translations"("member_id", "locale");

-- AddForeignKey
ALTER TABLE "home_content_translations" ADD CONSTRAINT "home_content_translations_home_content_id_fkey" FOREIGN KEY ("home_content_id") REFERENCES "home_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member_translations" ADD CONSTRAINT "team_member_translations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
