import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DIARY_ID_MAX_LENGTH, MESSAGE_ID_REGEX } from './diary-constraints';
import {
  IsAttachmentList,
  IsDecoratorList,
  IsLinkPreview,
  IsVariantContent,
} from './message-content.validators';

export class EditMessageDto {
  @IsOptional()
  @IsArray()
  secretPayloads?: Array<{ secretId: string; fragment: unknown }>;

  @IsIn(['text', 'todo', 'ai', 'column'])
  variant: 'text' | 'todo' | 'ai' | 'column';

  @IsVariantContent()
  content: unknown;

  @IsOptional()
  @IsAttachmentList()
  attachments?: unknown;

  @IsOptional()
  @IsDecoratorList()
  decorators?: unknown;

  @IsOptional()
  @IsLinkPreview()
  linkPreview?: unknown;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(MESSAGE_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  replyToMessageId?: string | null;
}
