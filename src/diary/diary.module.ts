import { Module } from '@nestjs/common';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { LinkPreviewController } from './link-preview.controller';
import { LinkPreviewService } from './link-preview.service';
import { UploadsModule } from '../uploads/uploads.module';
import { SecretCryptoService } from './secret-crypto.service';

@Module({
  imports: [UploadsModule],
  controllers: [DiaryController, LinkPreviewController],
  providers: [DiaryService, LinkPreviewService, SecretCryptoService],
})
export class DiaryModule {}
