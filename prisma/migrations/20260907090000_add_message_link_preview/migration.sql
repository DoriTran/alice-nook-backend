ALTER TABLE "diary_message"
ADD COLUMN "linkPreview" JSONB NOT NULL DEFAULT '{}'::jsonb;
