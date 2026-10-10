import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Ctx, RequireAuth } from '../auth/auth.decorators';
import type { ReqCtx } from '../auth/auth.types';
import { CommitDto, ListRunsQuery, RunCodeDto } from './dto/run.dto';
import { RunsService } from './runs.service';

@Controller('runs')
export class RunsController {
  constructor(private readonly svc: RunsService) {}

  @Post('read')
  @HttpCode(200)
  read(@Ctx() ctx: ReqCtx, @Body() dto: RunCodeDto) {
    return this.svc.read(ctx, dto.connectionId, dto.code);
  }

  @Post('dry-run')
  @HttpCode(200)
  @RequireAuth('Sign in to use write mode')
  dryRun(@Ctx() ctx: ReqCtx, @Body() dto: RunCodeDto) {
    return this.svc.dryRun(ctx, dto.connectionId, dto.code);
  }

  @Post(':id/commit')
  @HttpCode(200)
  @RequireAuth('Sign in to use write mode')
  commit(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Body() dto: CommitDto) {
    return this.svc.commit(ctx, id, dto.confirm);
  }

  @Get()
  @RequireAuth('Sign in to see run history')
  list(@Ctx() ctx: ReqCtx, @Query() q: ListRunsQuery) {
    return this.svc.list(ctx.user!, q);
  }

  @Get(':id')
  @RequireAuth('Sign in to see run history')
  get(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.svc.get(ctx.user!, id);
  }
}
