import { IsString, MaxLength } from 'class-validator';

export class ResolveLinkPreviewDto {
  @IsString()
  @MaxLength(2048)
  url: string;
}
