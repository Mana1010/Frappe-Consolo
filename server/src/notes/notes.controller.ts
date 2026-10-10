import { Body, Controller, Get, Put } from '@nestjs/common';
import { Ctx, RequireAuth } from '../auth/auth.decorators';
import type { ReqCtx } from '../auth/auth.types';
import { NoteDto } from './notes.dto';
import { NotesService } from './notes.service';

@Controller('notes')
@RequireAuth('Sign in to keep notes on the server')
export class NotesController {
  constructor(private readonly svc: NotesService) {}

  @Get()
  get(@Ctx() ctx: ReqCtx) {
    return this.svc.get(ctx.user!);
  }

  @Put()
  put(@Ctx() ctx: ReqCtx, @Body() dto: NoteDto) {
    return this.svc.put(ctx.user!, dto.content);
  }
}
