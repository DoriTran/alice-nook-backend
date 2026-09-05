import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PALETTE_DESCRIPTION_MAX_LENGTH,
  PALETTE_ID_REGEX,
  PALETTE_NAME_MAX_LENGTH,
  Trim,
} from './diary-constraints';
import { IsDiaryHex } from './palette-hex.validator';

export class PaletteShadesDto {
  @IsDiaryHex()
  soft: string;

  @IsDiaryHex()
  main: string;

  @IsDiaryHex()
  strong: string;
}

export class CreatePaletteDto {
  @IsString()
  @Matches(PALETTE_ID_REGEX)
  id: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(PALETTE_NAME_MAX_LENGTH)
  name: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(PALETTE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsDiaryHex()
  baseColor: string;

  @ValidateNested()
  @Type(() => PaletteShadesDto)
  light: PaletteShadesDto;

  @ValidateNested()
  @Type(() => PaletteShadesDto)
  dark: PaletteShadesDto;
}
