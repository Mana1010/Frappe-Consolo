import { Injectable } from '@nestjs/common';
import { Prisma, SchemaCache } from '@prisma/client';
import type { ReqCtx } from '../auth/auth.types';
import { ApiError } from '../common/errors';
import { isTraceback } from '../common/text';
import { ConnectionsService } from '../connections/connections.service';
import { FrappeError, runFailureMessage } from '../frappe/frappe.errors';
import { FrappeService } from '../frappe/frappe.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  parseSchema,
  SCHEMA_SCRIPT,
  SchemaDoctype,
  SchemaDto,
} from './schema.parse';

const toDto = (s: SchemaCache): SchemaDto => ({
  syncedAt: s.syncedAt,
  doctypeCount: s.doctypeCount,
  doctypes: (s.data as unknown as { doctypes: SchemaDoctype[] }).doctypes,
});

@Injectable()
export class SchemaService {
  constructor(
    private readonly db: PrismaService,
    private readonly conns: ConnectionsService,
    private readonly frappe: FrappeService,
  ) {}

  /** Temporary connections keep their schema in memory, saved ones in SchemaCache. */
  async get(ctx: ReqCtx, id: string): Promise<SchemaDto | null> {
    const c = await this.conns.resolve(ctx, id);
    if (!c.persisted) return this.conns.getTempSchema(ctx, id);
    const s = await this.db.schemaCache.findUnique({
      where: { connectionId: id },
    });
    return s ? toDto(s) : null;
  }

  async sync(ctx: ReqCtx, id: string): Promise<SchemaDto> {
    const { conn, creds } = await this.conns.credsFor(ctx, id);
    let out: string;
    try {
      out = await this.frappe.executeCode(creds, SCHEMA_SCRIPT, false);
    } catch (e) {
      if (e instanceof FrappeError)
        throw new ApiError(502, runFailureMessage(e), { code: e.code });
      throw e;
    }
    let doctypes: SchemaDoctype[];
    try {
      if (isTraceback(out)) throw new Error(out.trim().split('\n').pop());
      doctypes = parseSchema(out);
    } catch (e) {
      throw new ApiError(
        502,
        'Schema sync failed: ' + (e instanceof Error ? e.message : String(e)),
        { code: 'SCHEMA_PARSE' },
      );
    }
    const dto: SchemaDto = {
      syncedAt: new Date(),
      doctypeCount: doctypes.length,
      doctypes,
    };
    if (!conn.persisted) {
      this.conns.setTempSchema(ctx, id, dto);
      return dto;
    }
    const row = {
      data: { doctypes } as unknown as Prisma.InputJsonValue,
      doctypeCount: dto.doctypeCount,
      syncedAt: dto.syncedAt,
    };
    await this.db.schemaCache.upsert({
      where: { connectionId: id },
      create: { connectionId: id, ...row },
      update: row,
    });
    return dto;
  }
}
