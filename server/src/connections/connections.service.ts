import { HttpStatus, Injectable } from '@nestjs/common';
import { Connection, Prisma } from '@prisma/client';
import { ReqCtx } from '../auth/auth.types';
import {
  ApiError,
  authRequired,
  badRequest,
  conflict,
  notFound,
  secretRequired,
} from '../common/errors';
import { CryptoService } from '../crypto/crypto.service';
import { testFailure } from '../frappe/frappe.errors';
import {
  FrappeCreds,
  FrappeService,
  TestResult,
} from '../frappe/frappe.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SchemaDto } from '../schema/schema.parse';
import {
  ConnectionDto,
  CreateConnectionDto,
  TestConnectionDto,
  TestResultDto,
  UpdateConnectionDto,
} from './dto/connection.dto';
import { SecretStore } from './secret-store.service';
import { isTempId, TempConn, TempStore } from './temp-store.service';
import { checkCreds, nameFormatErr } from './validate';

/** A saved or temporary connection with its plaintext credentials (server-side only). */
export interface ConnView {
  id: string;
  name: string;
  persisted: boolean;
  url: string;
  key: string;
  secret: string | null;
  saveSecret: boolean;
  writable: boolean;
}

// PATCH: blank or omitted url/key/secret = keep the stored value
const given = (v?: string): v is string => !!v && v.trim() !== '';

const NOT_PERSISTED =
  'Save this connection to your account before making it writable.';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly frappe: FrappeService,
    private readonly mem: SecretStore,
    private readonly temps: TempStore,
  ) {}

  rowDto(c: Connection): ConnectionDto {
    return {
      id: c.id,
      name: c.name,
      persisted: true,
      user: c.user,
      frappeVersion: c.frappeVersion,
      saveSecret: c.saveSecret,
      hasSecret: !!c.secretEnc || this.mem.has(c.id),
      writable: c.writable,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  tempDto(t: TempConn): ConnectionDto {
    return {
      id: t.id,
      name: t.name,
      persisted: false,
      user: t.user,
      frappeVersion: t.frappeVersion,
      saveSecret: t.saveSecret,
      hasSecret: !!t.secret,
      writable: false,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private dec(enc: string) {
    const v = this.crypto.decrypt(enc);
    if (v === null)
      throw new ApiError(
        HttpStatus.CONFLICT,
        "This connection can't be decrypted (APP_SECRET_KEY changed). Delete it and add it again.",
        { code: 'UNDECRYPTABLE' },
      );
    return v;
  }

  private async row(ctx: ReqCtx, id: string) {
    if (!ctx.user) throw authRequired('Sign in to use this connection.');
    const c = await this.db.connection.findFirst({
      where: { id, ownerId: ctx.user.id },
    });
    if (!c) throw notFound('Connection');
    return c;
  }

  private temp(ctx: ReqCtx, id: string) {
    const t = this.temps.get(ctx.guestId, id);
    if (!t)
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'Temporary connection not found. It expires after 12 hours without use or when the server restarts.',
      );
    return t;
  }

  /** Saved connection of the signed-in user or temporary one of this guest session. */
  async resolve(ctx: ReqCtx, id: string): Promise<ConnView> {
    if (isTempId(id)) {
      const t = this.temp(ctx, id);
      return { ...t, persisted: false, writable: false };
    }
    const c = await this.row(ctx, id);
    return {
      id: c.id,
      name: c.name,
      persisted: true,
      url: this.dec(c.urlEnc),
      key: this.dec(c.apiKeyEnc),
      secret: c.secretEnc
        ? this.dec(c.secretEnc)
        : (this.mem.get(c.id) ?? null),
      saveSecret: c.saveSecret,
      writable: c.writable,
    };
  }

  /** Connection plus usable credentials, or 409 SECRET_REQUIRED. */
  async credsFor(
    ctx: ReqCtx,
    id: string,
  ): Promise<{ conn: ConnView; creds: FrappeCreds }> {
    const conn = await this.resolve(ctx, id);
    if (!conn.secret) throw secretRequired();
    return {
      conn,
      creds: { url: conn.url, key: conn.key, secret: conn.secret },
    };
  }

  getTempSchema(ctx: ReqCtx, id: string) {
    return this.temp(ctx, id).schema;
  }

  setTempSchema(ctx: ReqCtx, id: string, s: SchemaDto) {
    this.temp(ctx, id).schema = s;
  }

  /** This browser's temporary connections first, then the user's saved ones; each by name. */
  async list(ctx: ReqCtx): Promise<ConnectionDto[]> {
    const temps = this.temps
      .list(ctx.guestId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => this.tempDto(t));
    if (!ctx.user) return temps;
    const rows = await this.db.connection.findMany({
      where: { ownerId: ctx.user.id },
      orderBy: { name: 'asc' },
    });
    return [...temps, ...rows.map((c) => this.rowDto(c))];
  }

  async test(dto: TestConnectionDto): Promise<TestResultDto> {
    const { user, frappeVersion, swapped } = await this.runTest(
      checkCreds(dto),
    );
    return { user, frappeVersion, swapped };
  }

  async create(ctx: ReqCtx, dto: CreateConnectionDto) {
    if (!dto.temporary && !ctx.user)
      throw authRequired('Sign in to save this connection');
    const saveSecret = dto.saveSecret ?? true;
    if (dto.temporary) {
      const name = this.checkTempName(ctx, dto.name);
      const r = await this.runTest(checkCreds(dto));
      this.checkTempDup(ctx, r.creds);
      const now = new Date();
      const t: TempConn = {
        id: this.temps.newId(),
        name,
        url: r.creds.url,
        key: r.creds.key,
        secret: r.creds.secret,
        saveSecret,
        user: r.user,
        frappeVersion: r.frappeVersion,
        createdAt: now,
        updatedAt: now,
        schema: null,
      };
      this.temps.put(ctx.guestId, t);
      return this.tempDto(t);
    }
    const ownerId = ctx.user!.id;
    const name = await this.checkName(ownerId, dto.name);
    const r = await this.runTest(checkCreds(dto));
    const fingerprint = await this.checkDup(ownerId, r.creds);
    const c = await this.db.connection.create({
      data: {
        ownerId,
        name,
        urlEnc: this.crypto.encrypt(r.creds.url),
        apiKeyEnc: this.crypto.encrypt(r.creds.key),
        secretEnc: saveSecret ? this.crypto.encrypt(r.creds.secret) : null,
        fingerprint,
        saveSecret,
        user: r.user,
        frappeVersion: r.frappeVersion,
      },
    });
    if (!saveSecret) this.mem.set(c.id, r.creds.secret);
    return this.rowDto(c);
  }

  /** Re-tests with the stored values merged in when url, key or secret is given. */
  private async retestMerged(v: ConnView, dto: TestConnectionDto) {
    if (!given(dto.url) && !given(dto.apiKey) && !given(dto.apiSecret))
      return null;
    return this.runTest(
      checkCreds({
        url: given(dto.url) ? dto.url : v.url,
        apiKey: given(dto.apiKey) ? dto.apiKey : v.key,
        apiSecret: given(dto.apiSecret) ? dto.apiSecret : (v.secret ?? ''),
      }),
    );
  }

  async update(ctx: ReqCtx, id: string, dto: UpdateConnectionDto) {
    const v = await this.resolve(ctx, id);
    if (!v.persisted) {
      if (dto.writable)
        throw badRequest(NOT_PERSISTED, { writable: NOT_PERSISTED });
      const t = this.temp(ctx, id);
      const name =
        dto.name !== undefined ? this.checkTempName(ctx, dto.name, id) : t.name;
      const r = await this.retestMerged(v, dto);
      if (r) this.checkTempDup(ctx, r.creds, id);
      Object.assign(t, {
        name,
        updatedAt: new Date(),
        ...(dto.saveSecret !== undefined && { saveSecret: dto.saveSecret }),
        ...(r && {
          url: r.creds.url,
          key: r.creds.key,
          secret: r.creds.secret,
          user: r.user,
          frappeVersion: r.frappeVersion,
        }),
      });
      return this.tempDto(t);
    }
    const ownerId = ctx.user!.id;
    const data: Prisma.ConnectionUpdateInput = {};
    if (dto.name !== undefined)
      data.name = await this.checkName(ownerId, dto.name, id);
    let secret = v.secret;
    const r = await this.retestMerged(v, dto);
    if (r) {
      Object.assign(data, {
        urlEnc: this.crypto.encrypt(r.creds.url),
        apiKeyEnc: this.crypto.encrypt(r.creds.key),
        fingerprint: await this.checkDup(ownerId, r.creds, id),
        user: r.user,
        frappeVersion: r.frappeVersion,
      });
      secret = r.creds.secret;
      // a writable flag belongs to the site it was confirmed for
      if (r.creds.url !== v.url && dto.writable !== true) data.writable = false;
    }
    const saveSecret = dto.saveSecret ?? v.saveSecret;
    if (r || dto.saveSecret !== undefined) {
      data.saveSecret = saveSecret;
      data.secretEnc =
        saveSecret && secret ? this.crypto.encrypt(secret) : null;
    }
    if (dto.writable === true) {
      if ((dto.confirmName ?? '').trim() !== v.name)
        throw badRequest('Type the connection name to confirm', {
          confirmName: 'Type the connection name to confirm',
        });
      data.writable = true;
    } else if (dto.writable === false) data.writable = false;
    const u = await this.db.connection.update({ where: { id }, data });
    if (saveSecret) this.mem.delete(id);
    else if (secret) this.mem.set(id, secret);
    return this.rowDto(u);
  }

  async remove(ctx: ReqCtx, id: string) {
    if (isTempId(id)) {
      this.temp(ctx, id);
      this.temps.delete(ctx.guestId, id);
      return;
    }
    await this.row(ctx, id);
    await this.db.connection.delete({ where: { id } });
    this.mem.delete(id);
  }

  async setSecret(ctx: ReqCtx, id: string, apiSecret?: string) {
    const v = await this.resolve(ctx, id);
    const r = await this.runTest(
      checkCreds({ url: v.url, apiKey: v.key, apiSecret }),
    );
    return this.saveTest(ctx, v, r);
  }

  async retest(ctx: ReqCtx, id: string) {
    const { conn, creds } = await this.credsFor(ctx, id);
    return this.saveTest(ctx, conn, await this.runTest(creds));
  }

  private async saveTest(ctx: ReqCtx, v: ConnView, r: TestResult) {
    if (!v.persisted) {
      if (r.swapped) this.checkTempDup(ctx, r.creds, v.id);
      const t = this.temp(ctx, v.id);
      Object.assign(t, {
        key: r.creds.key,
        secret: r.creds.secret,
        user: r.user,
        frappeVersion: r.frappeVersion,
        updatedAt: new Date(),
      });
      return this.tempDto(t);
    }
    const ownerId = ctx.user!.id;
    const u = await this.db.connection.update({
      where: { id: v.id },
      data: {
        ...(r.swapped && {
          apiKeyEnc: this.crypto.encrypt(r.creds.key),
          fingerprint: await this.checkDup(ownerId, r.creds, v.id),
        }),
        user: r.user,
        frappeVersion: r.frappeVersion,
        secretEnc: v.saveSecret ? this.crypto.encrypt(r.creds.secret) : null,
      },
    });
    if (!v.saveSecret) this.mem.set(v.id, r.creds.secret);
    return this.rowDto(u);
  }

  /** Moves a temporary connection of this browser into the signed-in user's account (new id). */
  async persist(ctx: ReqCtx, id: string) {
    const ownerId = ctx.user!.id;
    if (!isTempId(id)) {
      await this.row(ctx, id);
      throw conflict('This connection is already saved to your account.');
    }
    const t = this.temp(ctx, id);
    const name = await this.checkName(ownerId, t.name);
    const fingerprint = await this.checkDup(ownerId, t);
    const c = await this.db.connection.create({
      data: {
        ownerId,
        name,
        urlEnc: this.crypto.encrypt(t.url),
        apiKeyEnc: this.crypto.encrypt(t.key),
        secretEnc: t.saveSecret ? this.crypto.encrypt(t.secret) : null,
        fingerprint,
        saveSecret: t.saveSecret,
        user: t.user,
        frappeVersion: t.frappeVersion,
        ...(t.schema && {
          schema: {
            create: {
              data: {
                doctypes: t.schema.doctypes,
              } as unknown as Prisma.InputJsonValue,
              doctypeCount: t.schema.doctypeCount,
              syncedAt: t.schema.syncedAt,
            },
          },
        }),
      },
    });
    if (!t.saveSecret) this.mem.set(c.id, t.secret);
    this.temps.delete(ctx.guestId, id);
    return this.rowDto(c);
  }

  private async runTest(creds: FrappeCreds) {
    try {
      return await this.frappe.test(creds);
    } catch (e) {
      throw testFailure(e);
    }
  }

  private nameTaken() {
    const m = 'Another connection already uses this name.';
    return conflict(m, { name: m });
  }

  private checkFormat(raw: string | undefined) {
    const name = (raw ?? '').trim();
    const err = nameFormatErr(name);
    if (err) throw badRequest(err, { name: err });
    return name;
  }

  private async checkName(ownerId: string, raw?: string, id?: string) {
    const name = this.checkFormat(raw);
    const other = await this.db.connection.findFirst({
      where: {
        ownerId,
        name: { equals: name, mode: 'insensitive' },
        ...(id && { NOT: { id } }),
      },
    });
    if (other) throw this.nameTaken();
    return name;
  }

  private checkTempName(ctx: ReqCtx, raw?: string, id?: string) {
    const name = this.checkFormat(raw);
    if (
      this.temps
        .list(ctx.guestId)
        .some((t) => t.id !== id && t.name.toLowerCase() === name.toLowerCase())
    )
      throw this.nameTaken();
    return name;
  }

  private dupError(name: string) {
    return conflict(`Already saved as "${name}". Edit that one instead.`, {
      apiKey: 'This key on this site is already saved.',
    });
  }

  /** Returns the fingerprint for (owner, url, key) after checking no other row has it. */
  private async checkDup(
    ownerId: string,
    c: { url: string; key: string },
    id?: string,
  ) {
    const fingerprint = this.crypto.fingerprint(ownerId, c.url, c.key);
    const dup = await this.db.connection.findFirst({
      where: { ownerId, fingerprint, ...(id && { NOT: { id } }) },
    });
    if (dup) throw this.dupError(dup.name);
    return fingerprint;
  }

  private checkTempDup(ctx: ReqCtx, c: FrappeCreds, id?: string) {
    const dup = this.temps
      .list(ctx.guestId)
      .find((t) => t.id !== id && t.url === c.url && t.key === c.key);
    if (dup) throw this.dupError(dup.name);
  }
}
