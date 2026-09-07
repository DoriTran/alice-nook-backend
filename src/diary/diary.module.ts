import { Module } from '@nestjs/common';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewService } from './link-preview.service';

@Module({
  controllers: [DiaryController, LinkPreviewController],
  providers: [DiaryService, LinkPreviewService],
})
export class DiaryModule {}
