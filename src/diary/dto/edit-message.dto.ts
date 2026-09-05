import {
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
  IsVariantContent,
} from './message-content.validators';

export class EditMessageDto {
  @IsIn(['text', 'todo', 'ai'])
  variant: 'text' | 'todo' | 'ai';

  @IsVariantContent()
  content: unknown;

  @IsOptional()
  @IsAttachmentList()
  attachments?: unknown;

  @IsOptional()
  @IsDecoratorList()
  decorators?: unknown;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(MESSAGE_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  replyToMessageId?: string | null;
}
