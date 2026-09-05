import { IsArray, IsDefined, IsObject, IsString } from 'class-validator';

export class SyncSidebarLayoutDto {
  @IsArray()
  @IsString({ each: true })
  rootOrders: string[];

  @IsDefined()
  @IsObject()
  groupChatboxOrders: Record<string, string[]>;
}
