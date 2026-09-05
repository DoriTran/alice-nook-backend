import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import {
  COLOR_ID_REGEX,
  DIARY_COLOR_ID_MAX_LENGTH,
  DIARY_ID_MAX_LENGTH,
  DIARY_LABEL_MAX_LENGTH,
  TAG_ID_REGEX,
  Trim,
} from './diary-constraints';

export class CreateTagDto {
  @IsString()
  @Matches(TAG_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  id: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(DIARY_LABEL_MAX_LENGTH)
  label: string;

  @IsString()
  @Matches(COLOR_ID_REGEX)
  @MaxLength(DIARY_COLOR_ID_MAX_LENGTH)
  colorId: string;
}
