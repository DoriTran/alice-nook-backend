import { Body, Controller, Post } from '@nestjs/common';

import { ResolveLinkPreviewDto } from './dto/resolve-link-preview.dto';
import {
  LinkPreviewService,
  type LinkPreviewMetadata,
} from './link-preview.service';

@Controller('api/diary/link-previews')
export class LinkPreviewController {
  constructor(private readonly linkPreviewService: LinkPreviewService) {}

  @Post('resolve')
  resolve(@Body() dto: ResolveLinkPreviewDto): Promise<LinkPreviewMetadata> {
    return this.linkPreviewService.resolve(dto.url);
  }
}
