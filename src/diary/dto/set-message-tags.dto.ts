import {
  ArrayUnique,
  IsArray,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DIARY_ID_MAX_LENGTH, TAG_ID_REGEX } from './diary-constraints';

export class SetMessageTagsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(TAG_ID_REGEX, { each: true })
  @MaxLength(DIARY_ID_MAX_LENGTH, { each: true })
  tagIds: string[];
}
