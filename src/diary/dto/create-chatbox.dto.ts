import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CHATBOX_ID_REGEX,
  COLOR_ID_REGEX,
  DIARY_COLOR_ID_MAX_LENGTH,
  DIARY_DESCRIPTION_MAX_LENGTH,
  DIARY_ICON_MAX_LENGTH,
  DIARY_ID_MAX_LENGTH,
  DIARY_NAME_MAX_LENGTH,
  GROUP_ID_REGEX,
  Trim,
} from './diary-constraints';

export class CreateChatboxDto {
  @IsString()
  @Matches(CHATBOX_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  id: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(DIARY_NAME_MAX_LENGTH)
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(DIARY_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DIARY_ICON_MAX_LENGTH)
  icon?: string;

  @IsString()
  @Matches(COLOR_ID_REGEX)
  @MaxLength(DIARY_COLOR_ID_MAX_LENGTH)
  colorId: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(GROUP_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  groupId?: string | null;
}
