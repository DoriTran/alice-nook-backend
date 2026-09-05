import { IsString, Matches, MaxLength } from 'class-validator';
import { DIARY_ID_MAX_LENGTH, TAG_ID_REGEX } from './diary-constraints';

export class RemoveChatboxTagDto {
  @IsString()
  @Matches(TAG_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  tagId: string;
}
