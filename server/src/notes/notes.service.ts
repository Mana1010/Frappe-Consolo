import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { badRequest } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export const MAX_NOTE_BYTES = 1024 * 1024;

@Injectable()
export class NotesService {
  constructor(private readonly db: PrismaService) {}

  async get(user: AuthUser) {
    const n = await this.db.note.upsert({
      where: { userId: user.id },
      create: { userId: user.id, content: '' },
      update: {},
    });
    return { content: n.content, updatedAt: n.updatedAt };
  }

  async put(user: AuthUser, content: string) {
    if (Buffer.byteLength(content, 'utf8') > MAX_NOTE_BYTES)
      throw badRequest('The notes are larger than 1 MB.', {
        content: 'The notes are larger than 1 MB.',
      });
    const n = await this.db.note.upsert({
      where: { userId: user.id },
      create: { userId: user.id, content },
      update: { content },
    });
    return { content: n.content, updatedAt: n.updatedAt };
  }
}
