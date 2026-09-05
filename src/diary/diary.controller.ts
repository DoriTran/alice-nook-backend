import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { DiaryService } from './diary.service';
import { CreateChatboxDto } from './dto/create-chatbox.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreatePaletteDto } from './dto/create-palette.dto';
import { CreateTagDto } from './dto/create-tag.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MoveChatboxDto } from './dto/move-chatbox.dto';
import { PatchMessageDto } from './dto/patch-message.dto';
import { RemoveChatboxTagDto } from './dto/remove-chatbox-tag.dto';
import { SetMessageTagsDto } from './dto/set-message-tags.dto';
import { SyncSidebarLayoutDto } from './dto/sync-sidebar-layout.dto';
import { UpdateChatboxDto } from './dto/update-chatbox.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import type {
  DiaryChatboxSnapshot,
  DiaryGroupSnapshot,
  DiaryMessageSnapshot,
  DiaryOrdersSnapshot,
  DiaryPaletteSnapshot,
  DiarySnapshot,
  DiaryTagSnapshot,
} from './dto/diary-snapshot';

@Controller('api/diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @Get()
  getDiary(@Session() session: UserSession): Promise<DiarySnapshot> {
    return this.diaryService.getSnapshot(session.user.id);
  }

  @Post('groups')
  createGroup(
    @Session() session: UserSession,
    @Body() dto: CreateGroupDto,
  ): Promise<DiaryGroupSnapshot> {
    return this.diaryService.createGroup(session.user.id, dto);
  }

  @Patch('groups/:id')
  updateGroup(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<DiaryGroupSnapshot> {
    return this.diaryService.updateGroup(session.user.id, id, dto);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    return this.diaryService.deleteGroup(session.user.id, id);
  }

  @Post('chatboxes')
  createChatbox(
    @Session() session: UserSession,
    @Body() dto: CreateChatboxDto,
  ): Promise<DiaryChatboxSnapshot> {
    return this.diaryService.createChatbox(session.user.id, dto);
  }

  @Patch('chatboxes/:id')
  updateChatbox(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateChatboxDto,
  ): Promise<DiaryChatboxSnapshot> {
    return this.diaryService.updateChatbox(session.user.id, id, dto);
  }

  @Post('chatboxes/:id/move')
  @HttpCode(HttpStatus.OK)
  moveChatbox(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: MoveChatboxDto,
  ): Promise<DiaryChatboxSnapshot> {
    return this.diaryService.moveChatbox(session.user.id, id, dto);
  }

  @Delete('chatboxes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteChatbox(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    return this.diaryService.deleteChatbox(session.user.id, id);
  }

  @Put('orders/sidebar')
  syncSidebarLayout(
    @Session() session: UserSession,
    @Body() dto: SyncSidebarLayoutDto,
  ): Promise<DiaryOrdersSnapshot> {
    return this.diaryService.syncSidebarLayout(session.user.id, dto);
  }

  @Post('palettes')
  createPalette(
    @Session() session: UserSession,
    @Body() dto: CreatePaletteDto,
  ): Promise<DiaryPaletteSnapshot> {
    return this.diaryService.createPalette(session.user.id, dto);
  }

  @Delete('palettes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePalette(
    @Session() session: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.diaryService.deletePalette(session.user.id, id);
  }

  @Post('messages')
  createMessage(
    @Session() session: UserSession,
    @Body() dto: CreateMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    return this.diaryService.createMessage(session.user.id, dto);
  }

  @Patch('messages/:id')
  patchMessage(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: PatchMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    return this.diaryService.patchMessage(session.user.id, id, dto);
  }

  @Put('messages/:id/edit')
  editMessage(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
  ): Promise<DiaryMessageSnapshot> {
    return this.diaryService.editMessage(session.user.id, id, dto);
  }

  @Put('messages/:id/tags')
  setMessageTags(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: SetMessageTagsDto,
  ): Promise<DiaryMessageSnapshot> {
    return this.diaryService.setMessageTags(session.user.id, id, dto);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMessage(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    return this.diaryService.deleteMessage(session.user.id, id);
  }

  @Post('chatboxes/:chatboxId/remove-tag')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTagFromChatbox(
    @Session() session: UserSession,
    @Param('chatboxId') chatboxId: string,
    @Body() dto: RemoveChatboxTagDto,
  ): Promise<void> {
    return this.diaryService.removeTagFromChatbox(
      session.user.id,
      chatboxId,
      dto,
    );
  }

  @Post('tags')
  createTag(
    @Session() session: UserSession,
    @Body() dto: CreateTagDto,
  ): Promise<DiaryTagSnapshot> {
    return this.diaryService.createTag(session.user.id, dto);
  }

  @Patch('tags/:id')
  updateTag(
    @Session() session: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ): Promise<DiaryTagSnapshot> {
    return this.diaryService.updateTag(session.user.id, id, dto);
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTag(
    @Session() session: UserSession,
    @Param('id') id: string,
  ): Promise<void> {
    return this.diaryService.deleteTag(session.user.id, id);
  }
}
