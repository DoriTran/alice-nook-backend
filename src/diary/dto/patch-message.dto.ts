import { IsBoolean, IsOptional } from 'class-validator';
import {
  IsDecoratorList,
  IsReactionList,
  IsTodoContent,
} from './message-content.validators';

export class PatchMessageDto {
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsReactionList()
  reactions?: unknown;

  @IsOptional()
  @IsDecoratorList()
  decorators?: unknown;

  @IsOptional()
  @IsTodoContent()
  content?: unknown;
}
