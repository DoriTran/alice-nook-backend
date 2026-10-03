import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const SAFE_FILE_NAME_PATTERN =
  /^(?!\.{1,2}$)(?!.*[/\\])[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+$/u;
const MIME_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

export class PresignUploadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(SAFE_FILE_NAME_PATTERN, {
    message: 'fileName must be a safe file name without path separators',
  })
  fileName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(MIME_TYPE_PATTERN, { message: 'mimeType must be a valid MIME type' })
  mimeType: string;

  @IsInt()
  @Min(1)
  size: number;
}
