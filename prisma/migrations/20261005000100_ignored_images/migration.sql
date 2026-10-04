-- Ignored images (John, 2026-10-05): exact signature / footer images
-- (matched by SHA-256) that email ingestion skips. Managed on
-- Admin -> Ignored images. Nothing is seeded -- John picks them on screen.

CREATE TABLE "ignored_images" (
    "id" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "example_filename" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "ignored_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ignored_images_sha256_key" ON "ignored_images"("sha256");

-- Covered by the default privileges from 20260915060006 when run as the
-- migration role; granted explicitly as well in case it isn't.
GRANT SELECT, INSERT, UPDATE, DELETE ON "ignored_images" TO app_role;

-- The "repeated images" suggestions group attachments by hash.
CREATE INDEX IF NOT EXISTS "ticket_attachments_sha256_idx" ON "ticket_attachments"("sha256");
