import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Ctx, RequireAuth } from '../auth/auth.decorators';
import type { ReqCtx } from '../auth/auth.types';
import { CreateScriptDto, UpdateScriptDto } from './dto/script.dto';
import { ScriptsService } from './scripts.service';

// the guard guarantees ctx.user on every route here
@Controller('scripts')
@RequireAuth('Sign in to save scripts')
export class ScriptsController {
  constructor(private readonly svc: ScriptsService) {}

  @Get()
  list(@Ctx() ctx: ReqCtx) {
    return this.svc.list(ctx.user!);
  }

  @Post()
  create(@Ctx() ctx: ReqCtx, @Body() dto: CreateScriptDto) {
    return this.svc.create(ctx.user!, dto);
  }

  @Patch(':id')
  update(
    @Ctx() ctx: ReqCtx,
    @Param('id') id: string,
    @Body() dto: UpdateScriptDto,
  ) {
    return this.svc.update(ctx.user!, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    await this.svc.remove(ctx.user!, id);
  }
}
