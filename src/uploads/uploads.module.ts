import { Module } from '@nestjs/common';
import { R2Service } from './r2.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Upload lifecycle foundation:
 * presign -> direct R2 upload -> message finalization -> durable attachment.
 *
 * Until finalization and cleanup are implemented, an interrupted flow may leave
 * a temporary orphan in R2. This module does not make the bucket public and
 * does not proxy file bytes through the Nest application.
 */
@Module({
  imports: [PrismaModule],
  controllers: [UploadsController],
  providers: [R2Service, UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
