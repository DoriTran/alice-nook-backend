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
  DIARY_NAME_MAX_LENGTH,
  Trim,
} from './diary-constraints';

export class UpdateGroupDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(DIARY_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(DIARY_ICON_MAX_LENGTH)
  icon?: string;

  @IsOptional()
  @IsString()
  @Matches(COLOR_ID_REGEX)
  @MaxLength(DIARY_COLOR_ID_MAX_LENGTH)
  colorId?: string;
}
