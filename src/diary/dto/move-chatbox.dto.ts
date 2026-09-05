import {
  IsDefined,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DIARY_ID_MAX_LENGTH, GROUP_ID_REGEX } from './diary-constraints';

export class MoveChatboxDto {
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(GROUP_ID_REGEX)
  @MaxLength(DIARY_ID_MAX_LENGTH)
  groupId: string | null;
}
