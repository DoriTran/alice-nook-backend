-- New chatboxes default to notifications enabled. Existing rows are unchanged.
ALTER TABLE "diary_chatbox"
ALTER COLUMN "notificationEnabled" SET DEFAULT true;
