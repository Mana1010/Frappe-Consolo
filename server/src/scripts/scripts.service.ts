import { Injectable } from '@nestjs/common';
import { Connection, Script } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { badRequest, notFound } from '../common/errors';
import { isTempId } from '../connections/temp-store.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScriptDto, ScriptDto, UpdateScriptDto } from './dto/script.dto';

const include = { connection: { select: { name: true } } } as const;
type Row = Script & { connection: Pick<Connection, 'name'> | null };

const toDto = (s: Row): ScriptDto => ({
  id: s.id,
  name: s.name,
  code: s.code,
  connectionId: s.connectionId,
  connectionName: s.connection?.name ?? null,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

@Injectable()
export class ScriptsService {
  constructor(private readonly db: PrismaService) {}

  async list(user: AuthUser) {
    const rows = await this.db.script.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      include,
    });
    return rows.map(toDto);
  }

  /** Temporary connections can't be referenced from the database, so they are stored as null. */
  private async connId(user: AuthUser, id: string | null | undefined) {
    if (!id || isTempId(id)) return null;
    const c = await this.db.connection.findFirst({
      where: { id, ownerId: user.id },
    });
    if (!c)
      throw badRequest('Connection not found.', {
        connectionId: 'Connection not found.',
      });
    return id;
  }

  private name(raw: string) {
    const n = raw.trim();
    if (!n)
      throw badRequest('Give the script a name.', {
        name: 'Give the script a name.',
      });
    return n;
  }

  async create(user: AuthUser, dto: CreateScriptDto) {
    const s = await this.db.script.create({
      data: {
        ownerId: user.id,
        name: this.name(dto.name),
        code: dto.code,
        connectionId: await this.connId(user, dto.connectionId),
      },
      include,
    });
    return toDto(s);
  }

  async update(user: AuthUser, id: string, dto: UpdateScriptDto) {
    await this.own(user, id);
    const s = await this.db.script.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: this.name(dto.name) }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.connectionId !== undefined && {
          connectionId: await this.connId(user, dto.connectionId),
        }),
      },
      include,
    });
    return toDto(s);
  }

  async remove(user: AuthUser, id: string) {
    await this.own(user, id);
    await this.db.script.delete({ where: { id } });
  }

  private async own(user: AuthUser, id: string) {
    const s = await this.db.script.findFirst({
      where: { id, ownerId: user.id },
    });
    if (!s) throw notFound('Script');
  }
}
