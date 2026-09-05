import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  COLOR_ID_REGEX,
  DIARY_COLOR_ID_MAX_LENGTH,
  DIARY_ICON_MAX_LENGTH,
  DIARY_ID_MAX_LENGTH,
  DIARY_NAME_MAX_LENGTH,
  GROUP_ID_REGEX,
  Trim,
} from './diary-constraints';

export class CreateGroupDto {
  @IsString()
  @Matches(GROUP_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  id: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(DIARY_NAME_MAX_LENGTH)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(DIARY_ICON_MAX_LENGTH)
  icon?: string;

  @IsString()
  @Matches(COLOR_ID_REGEX)
  @MaxLength(DIARY_COLOR_ID_MAX_LENGTH)
  colorId: string;
}
