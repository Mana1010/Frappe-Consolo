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
import { ConnectionsService } from './connections.service';
import {
  CreateConnectionDto,
  SecretDto,
  TestConnectionDto,
  UpdateConnectionDto,
} from './dto/connection.dto';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly svc: ConnectionsService) {}

  @Get()
  list(@Ctx() ctx: ReqCtx) {
    return this.svc.list(ctx);
  }

  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestConnectionDto) {
    return this.svc.test(dto);
  }

  @Post()
  create(@Ctx() ctx: ReqCtx, @Body() dto: CreateConnectionDto) {
    return this.svc.create(ctx, dto);
  }

  @Patch(':id')
  update(
    @Ctx() ctx: ReqCtx,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.svc.update(ctx, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    await this.svc.remove(ctx, id);
  }

  @Post(':id/secret')
  @HttpCode(200)
  setSecret(
    @Ctx() ctx: ReqCtx,
    @Param('id') id: string,
    @Body() dto: SecretDto,
  ) {
    return this.svc.setSecret(ctx, id, dto.apiSecret);
  }

  @Post(':id/test')
  @HttpCode(200)
  retest(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.svc.retest(ctx, id);
  }

  @Post(':id/persist')
  @HttpCode(200)
  @RequireAuth('Sign in to save this connection')
  persist(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.svc.persist(ctx, id);
  }
}
