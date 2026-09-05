-- CreateTable
CREATE TABLE "diary_group" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "diary_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_chatbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "notificationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "diary_chatbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,

    CONSTRAINT "diary_tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatboxId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "replyToMessageId" TEXT,
    "sourceMessageId" TEXT,
    "reactions" JSONB NOT NULL,
    "attachments" JSONB NOT NULL,
    "decorators" JSONB NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "diary_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_message_tag" (
    "messageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "diary_message_tag_pkey" PRIMARY KEY ("messageId","tagId")
);

-- CreateTable
CREATE TABLE "diary_custom_palette" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseColor" TEXT NOT NULL,
    "light" JSONB NOT NULL,
    "dark" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diary_custom_palette_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diary_order" (
    "userId" TEXT NOT NULL,
    "rootOrders" JSONB NOT NULL,
    "groupChatboxOrders" JSONB NOT NULL,
    "chatboxMessageOrders" JSONB NOT NULL,

    CONSTRAINT "diary_order_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "diary_group_userId_idx" ON "diary_group"("userId");

-- CreateIndex
CREATE INDEX "diary_group_createdAt_idx" ON "diary_group"("createdAt");

-- CreateIndex
CREATE INDEX "diary_chatbox_userId_idx" ON "diary_chatbox"("userId");

-- CreateIndex
CREATE INDEX "diary_chatbox_groupId_idx" ON "diary_chatbox"("groupId");

-- CreateIndex
CREATE INDEX "diary_chatbox_createdAt_idx" ON "diary_chatbox"("createdAt");

-- CreateIndex
CREATE INDEX "diary_tag_userId_idx" ON "diary_tag"("userId");

-- CreateIndex
CREATE INDEX "diary_message_userId_idx" ON "diary_message"("userId");

-- CreateIndex
CREATE INDEX "diary_message_chatboxId_idx" ON "diary_message"("chatboxId");

-- CreateIndex
CREATE INDEX "diary_message_createdAt_idx" ON "diary_message"("createdAt");

-- CreateIndex
CREATE INDEX "diary_message_tag_userId_idx" ON "diary_message_tag"("userId");

-- CreateIndex
CREATE INDEX "diary_message_tag_tagId_idx" ON "diary_message_tag"("tagId");

-- CreateIndex
CREATE INDEX "diary_custom_palette_userId_idx" ON "diary_custom_palette"("userId");

-- AddForeignKey
ALTER TABLE "diary_group" ADD CONSTRAINT "diary_group_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_chatbox" ADD CONSTRAINT "diary_chatbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_chatbox" ADD CONSTRAINT "diary_chatbox_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "diary_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_tag" ADD CONSTRAINT "diary_tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_message" ADD CONSTRAINT "diary_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_message" ADD CONSTRAINT "diary_message_chatboxId_fkey" FOREIGN KEY ("chatboxId") REFERENCES "diary_chatbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_message_tag" ADD CONSTRAINT "diary_message_tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_message_tag" ADD CONSTRAINT "diary_message_tag_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "diary_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_message_tag" ADD CONSTRAINT "diary_message_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "diary_tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_custom_palette" ADD CONSTRAINT "diary_custom_palette_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diary_order" ADD CONSTRAINT "diary_order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
