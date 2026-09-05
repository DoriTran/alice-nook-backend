import { Controller, Get } from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { DiaryService } from './diary.service';

@Controller('api/diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Get()
  getDiary(@Session() session: UserSession) {
    return this.diaryService.getSnapshot(session.user.id);
  }
}
