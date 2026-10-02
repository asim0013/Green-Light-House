-- CreateTable
CREATE TABLE "selection_guides" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "selection_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_guide_translations" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "selection_guide_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_guide_sections" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "sort" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selection_guide_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_guide_section_translations" (
    "id" TEXT NOT NULL,
    "section_id" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "selection_guide_section_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selection_guide_products" (
    "guide_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "selection_guide_products_pkey" PRIMARY KEY ("guide_id","product_id")
);

-- CreateTable
CREATE TABLE "selection_guide_categories" (
    "guide_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "selection_guide_categories_pkey" PRIMARY KEY ("guide_id","category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "selection_guides_slug_key" ON "selection_guides"("slug");

-- CreateIndex
CREATE INDEX "selection_guides_status_idx" ON "selection_guides"("status");

-- CreateIndex
CREATE UNIQUE INDEX "selection_guide_translations_guide_id_locale_key" ON "selection_guide_translations"("guide_id", "locale");

-- CreateIndex
CREATE INDEX "selection_guide_sections_guide_id_sort_idx" ON "selection_guide_sections"("guide_id", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "selection_guide_section_translations_section_id_locale_key" ON "selection_guide_section_translations"("section_id", "locale");

-- CreateIndex
CREATE INDEX "selection_guide_products_guide_id_sort_idx" ON "selection_guide_products"("guide_id", "sort");

-- CreateIndex
CREATE INDEX "selection_guide_categories_guide_id_sort_idx" ON "selection_guide_categories"("guide_id", "sort");

-- AddForeignKey
ALTER TABLE "selection_guide_translations" ADD CONSTRAINT "selection_guide_translations_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "selection_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_guide_sections" ADD CONSTRAINT "selection_guide_sections_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "selection_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_guide_section_translations" ADD CONSTRAINT "selection_guide_section_translations_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "selection_guide_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_guide_products" ADD CONSTRAINT "selection_guide_products_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "selection_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_guide_products" ADD CONSTRAINT "selection_guide_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_guide_categories" ADD CONSTRAINT "selection_guide_categories_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "selection_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selection_guide_categories" ADD CONSTRAINT "selection_guide_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

