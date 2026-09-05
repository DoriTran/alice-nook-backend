import {
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CHATBOX_ID_REGEX,
  DIARY_ID_MAX_LENGTH,
  MESSAGE_ID_REGEX,
  TAG_ID_REGEX,
} from './diary-constraints';
import {
  IsAttachmentList,
  IsDecoratorList,
  IsReactionList,
  IsVariantContent,
} from './message-content.validators';

export class CreateMessageDto {
  @IsString()
  @Matches(MESSAGE_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  id: string;

  @IsString()
  @Matches(CHATBOX_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  chatboxId: string;

  @IsIn(['user', 'assistant'])
  sender: 'user' | 'assistant';

  @IsIn(['text', 'todo', 'ai'])
  variant: 'text' | 'todo' | 'ai';

  @IsVariantContent()
  content: unknown;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(TAG_ID_REGEX, { each: true })
  @MaxLength(DIARY_ID_MAX_LENGTH, { each: true })
  tagIds?: string[];

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

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(MESSAGE_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  sourceMessageId?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsReactionList()
  reactions?: unknown;
}
