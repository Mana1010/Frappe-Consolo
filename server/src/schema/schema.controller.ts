import { Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Ctx } from '../auth/auth.decorators';
import type { ReqCtx } from '../auth/auth.types';
import { SchemaService } from './schema.service';

@Controller('connections/:id/schema')
export class SchemaController {
  constructor(private readonly svc: SchemaService) {}

  // explicit json() so "never synced" is a JSON null body, not an empty one
  @Get()
  async get(@Ctx() ctx: ReqCtx, @Param('id') id: string, @Res() res: Response) {
    res.json(await this.svc.get(ctx, id));
  }

  @Post('sync')
  @HttpCode(200)
  sync(@Ctx() ctx: ReqCtx, @Param('id') id: string) {
    return this.svc.sync(ctx, id);
  }
}
