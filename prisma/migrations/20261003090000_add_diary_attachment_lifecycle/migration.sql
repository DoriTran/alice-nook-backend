CREATE TABLE "diary_attachment_object" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "uploadedAt" TIMESTAMP(3),
  "committedAt" TIMESTAMP(3),
  "cleanupRequestedAt" TIMESTAMP(3),
  CONSTRAINT "diary_attachment_object_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "diary_message_attachment" (
  "messageId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  CONSTRAINT "diary_message_attachment_pkey" PRIMARY KEY ("messageId", "attachmentId")
);
CREATE UNIQUE INDEX "diary_attachment_object_objectKey_key" ON "diary_attachment_object"("objectKey");
CREATE INDEX "diary_attachment_object_userId_status_createdAt_idx" ON "diary_attachment_object"("userId", "status", "createdAt");
CREATE INDEX "diary_attachment_object_status_cleanupRequestedAt_idx" ON "diary_attachment_object"("status", "cleanupRequestedAt");
CREATE INDEX "diary_message_attachment_attachmentId_idx" ON "diary_message_attachment"("attachmentId");
ALTER TABLE "diary_attachment_object" ADD CONSTRAINT "diary_attachment_object_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "diary_message_attachment" ADD CONSTRAINT "diary_message_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "diary_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diary_message_attachment" ADD CONSTRAINT "diary_message_attachment_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "diary_attachment_object"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
