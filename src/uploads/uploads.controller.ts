import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UploadsService } from './uploads.service';

@Controller('api/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  presign(@Session() session: UserSession, @Body() dto: PresignUploadDto) {
    return this.uploadsService.presign(session.user.id, dto);
  }

  @Post(':attachmentId/finalize')
  finalize(@Session() session: UserSession, @Param('attachmentId') id: string) {
    return this.uploadsService.finalize(session.user.id, id);
  }

  @Get(':attachmentId/url')
  readUrl(@Session() session: UserSession, @Param('attachmentId') id: string) {
    return this.uploadsService.readUrl(session.user.id, id);
  }
}
