import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { SchemaDto } from '../schema/schema.parse';

/** A guest-session connection; never written to the database. */
export interface TempConn {
  id: string;
  name: string;
  url: string;
  key: string;
  secret: string;
  saveSecret: boolean;
  user: string | null;
  frappeVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
  schema: SchemaDto | null;
}

export const TEMP_PREFIX = 'tmp_';
export const isTempId = (id: string) => id.startsWith(TEMP_PREFIX);
export const TEMP_IDLE_MS = 12 * 3600 * 1000;

/** Temporary connections per guest id, dropped after 12 h without use. */
@Injectable()
export class TempStore implements OnModuleDestroy {
  private readonly guests = new Map<
    string,
    { seen: number; conns: Map<string, TempConn> }
  >();
  private readonly timer = setInterval(() => this.sweep(), 10 * 60 * 1000);

  constructor() {
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  newId() {
    return TEMP_PREFIX + randomBytes(12).toString('base64url');
  }

  private bucket(gid: string, create = false, now = Date.now()) {
    let b = this.guests.get(gid);
    if (b && now - b.seen > TEMP_IDLE_MS) {
      this.guests.delete(gid);
      b = undefined;
    }
    if (!b && create)
      this.guests.set(gid, (b = { seen: now, conns: new Map() }));
    if (b) b.seen = now;
    return b;
  }

  list(gid: string, now = Date.now()): TempConn[] {
    return [...(this.bucket(gid, false, now)?.conns.values() ?? [])];
  }

  get(gid: string, id: string, now = Date.now()) {
    return this.bucket(gid, false, now)?.conns.get(id);
  }

  put(gid: string, c: TempConn, now = Date.now()) {
    this.bucket(gid, true, now)!.conns.set(c.id, c);
  }

  delete(gid: string, id: string) {
    return this.guests.get(gid)?.conns.delete(id) ?? false;
  }

  sweep(now = Date.now()) {
    for (const [gid, b] of this.guests)
      if (now - b.seen > TEMP_IDLE_MS) this.guests.delete(gid);
  }
}
