import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Run } from '@prisma/client';
import type { AuthUser, ReqCtx } from '../auth/auth.types';
import {
  ApiError,
  badRequest,
  conflict,
  notFound,
  secretRequired,
} from '../common/errors';
import { isTraceback } from '../common/text';
import {
  ConnectionsService,
  ConnView,
} from '../connections/connections.service';
import { FrappeError, runFailureMessage } from '../frappe/frappe.errors';
import { FrappeCreds, FrappeService } from '../frappe/frappe.service';
import { GuardHit, readOnlyScan, writeModeScan } from '../guard/guard';
import { PrismaService } from '../prisma/prisma.service';
import { ListRunsQuery, RunDto, RunListItem } from './dto/run.dto';
import {
  Change,
  commitEpilogue,
  commitOutcome,
  DRY_EPILOGUE,
  dryOutcome,
  lineCount,
  wrap,
} from './protocol';

const DRY_RUN_TTL_MS = 15 * 60 * 1000;
const READ_ONLY_MSG =
  'This connection is read-only. Make it writable in Manage connections.';
const TEMP_WRITE_MSG =
  'Save this connection to your account before using write mode.';

type NewRun = Omit<
  Prisma.RunUncheckedCreateInput,
  'userId' | 'blocked' | 'plan'
> & { blocked?: GuardHit[] | null; plan?: Change[] | null };

const json = (v: unknown) =>
  v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

export function toRunDto(r: Run): RunDto {
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    connectionId: r.connectionId,
    connectionName: r.connectionName,
    output: r.output,
    error: r.error,
    blocked: r.blocked as GuardHit[] | null,
    plan: r.plan as Change[] | null,
    changeCount: r.changeCount,
    dryRunId: r.dryRunId,
    committedRunId: r.committedRunId,
    durationMs: r.durationMs,
    createdAt: r.createdAt,
    code: r.code,
  };
}

@Injectable()
export class RunsService {
  constructor(
    private readonly db: PrismaService,
    private readonly conns: ConnectionsService,
    private readonly frappe: FrappeService,
  ) {}

  /** Signed-in runs are stored; guest runs are returned with id null. */
  private async store(ctx: ReqCtx, r: NewRun): Promise<RunDto> {
    const data = { ...r, blocked: json(r.blocked), plan: json(r.plan) };
    if (ctx.user)
      return toRunDto(
        await this.db.run.create({ data: { ...data, userId: ctx.user.id } }),
      );
    return {
      id: null,
      mode: r.mode,
      status: r.status,
      connectionId: r.connectionId ?? null,
      connectionName: r.connectionName,
      output: r.output ?? null,
      error: r.error ?? null,
      blocked: r.blocked ?? null,
      plan: r.plan ?? null,
      changeCount: r.changeCount ?? null,
      dryRunId: null,
      committedRunId: null,
      durationMs: r.durationMs ?? null,
      createdAt: new Date(),
      code: r.code,
    };
  }

  private base(conn: ConnView, code: string) {
    return {
      // temporary connections have no row to point at; the name is kept
      connectionId: conn.persisted ? conn.id : null,
      connectionName: conn.name,
      code,
    };
  }

  private creds(conn: ConnView): FrappeCreds {
    if (!conn.secret) throw secretRequired();
    return { url: conn.url, key: conn.key, secret: conn.secret };
  }

  private async exec(creds: FrappeCreds, code: string, commit: boolean) {
    const t0 = Date.now();
    try {
      const out = await this.frappe.executeCode(creds, code, commit);
      return { out, durationMs: Date.now() - t0 };
    } catch (e) {
      if (!(e instanceof FrappeError)) throw e;
      return { fail: e, durationMs: Date.now() - t0 };
    }
  }

  private blocked(hits: GuardHit[]) {
    return {
      status: 'BLOCKED' as const,
      blocked: hits,
      error:
        'Blocked before sending: ' +
        hits.length +
        (hits.length === 1 ? ' issue.' : ' issues.'),
    };
  }

  private nonEmpty(code: string) {
    if (!code.trim())
      throw badRequest('Nothing to run', { code: 'Nothing to run' });
  }

  async read(ctx: ReqCtx, connectionId: string, code: string) {
    this.nonEmpty(code);
    const conn = await this.conns.resolve(ctx, connectionId);
    const base = { ...this.base(conn, code), mode: 'READ' as const };
    const hits = readOnlyScan(code);
    if (hits.length) return this.store(ctx, { ...base, ...this.blocked(hits) });
    const r = await this.exec(this.creds(conn), code, false);
    if (r.fail)
      return this.store(ctx, {
        ...base,
        status: 'FAILED',
        error: runFailureMessage(r.fail),
        durationMs: r.durationMs,
      });
    return this.store(ctx, {
      ...base,
      status: isTraceback(r.out) ? 'ERROR' : 'OK',
      output: r.out,
      durationMs: r.durationMs,
    });
  }

  private writable(conn: ConnView) {
    if (!conn.persisted)
      throw new ApiError(HttpStatus.FORBIDDEN, TEMP_WRITE_MSG, {
        code: 'NOT_PERSISTED',
      });
    if (!conn.writable)
      throw new ApiError(HttpStatus.FORBIDDEN, READ_ONLY_MSG, {
        code: 'READ_ONLY',
      });
  }

  async dryRun(ctx: ReqCtx, connectionId: string, code: string) {
    this.nonEmpty(code);
    const conn = await this.conns.resolve(ctx, connectionId);
    this.writable(conn);
    const base = { ...this.base(conn, code), mode: 'DRY_RUN' as const };
    const hits = writeModeScan(code);
    if (hits.length) return this.store(ctx, { ...base, ...this.blocked(hits) });
    const r = await this.exec(
      this.creds(conn),
      wrap(code, DRY_EPILOGUE),
      false,
    );
    if (r.fail)
      return this.store(ctx, {
        ...base,
        status: 'FAILED',
        error: runFailureMessage(r.fail),
        durationMs: r.durationMs,
      });
    const o = dryOutcome(r.out, lineCount(code));
    return this.store(ctx, {
      ...base,
      status: o.status,
      output: o.output,
      durationMs: r.durationMs,
      ...('plan' in o
        ? { plan: o.plan, planText: o.planText, changeCount: o.plan.length }
        : 'error' in o
          ? { error: o.error }
          : {}),
    });
  }

  async commit(ctx: ReqCtx, dryRunId: string, confirm: string) {
    const user = ctx.user!;
    const dry = await this.db.run.findFirst({
      where: { id: dryRunId, userId: user.id, mode: 'DRY_RUN' },
    });
    if (!dry) throw notFound('Dry run');
    if (dry.status !== 'OK')
      throw badRequest('Only a successful dry run can be committed.');
    if (dry.committedRunId)
      throw conflict(
        'This dry run was already committed. Run the dry run again.',
        undefined,
        'ALREADY_COMMITTED',
      );
    if (Date.now() - dry.createdAt.getTime() > DRY_RUN_TTL_MS)
      throw conflict(
        'This dry run is older than 15 minutes. Run the dry run again.',
        undefined,
        'DRY_RUN_EXPIRED',
      );
    if (!dry.changeCount || !dry.planText)
      throw badRequest('Nothing would change, so there is nothing to commit.');
    if (!dry.connectionId) throw notFound('Connection');
    const conn = await this.conns.resolve(ctx, dry.connectionId);
    this.writable(conn);
    if (confirm !== String(dry.changeCount) && confirm !== 'COMMIT') {
      const m = `Type ${dry.changeCount} (the number of changes) or COMMIT to confirm.`;
      throw badRequest(m, { confirm: m });
    }
    // the code always comes from the stored dry run, never from the request
    const hits = writeModeScan(dry.code);
    if (hits.length)
      throw badRequest(
        'The stored script no longer passes the write-mode guard: ' +
          hits.map((h) => `line ${h.line}: ${h.what}`).join('; '),
      );
    const creds = this.creds(conn);

    // record first and claim the dry run atomically, so two clicks can't commit twice
    const run = await this.db.run.create({
      data: {
        ...this.base(conn, dry.code),
        userId: user.id,
        mode: 'COMMIT',
        status: 'FAILED',
        error:
          'The commit was interrupted. Check the data before trying again.',
        dryRunId: dry.id,
      },
    });
    const claim = await this.db.run.updateMany({
      where: { id: dry.id, committedRunId: null },
      data: { committedRunId: run.id },
    });
    if (!claim.count) {
      await this.db.run.delete({ where: { id: run.id } });
      throw conflict(
        'This dry run was already committed. Run the dry run again.',
        undefined,
        'ALREADY_COMMITTED',
      );
    }

    const r = await this.exec(
      creds,
      wrap(dry.code, commitEpilogue(dry.planText)),
      true,
    );
    let data: Prisma.RunUpdateInput;
    if (r.fail) {
      const unsure =
        r.fail.code === 'FRAPPE_TIMEOUT' || r.fail.code === 'FRAPPE_NETWORK';
      data = {
        status: 'FAILED',
        error:
          runFailureMessage(r.fail) +
          (unsure
            ? '\nThe changes may or may not have been written. Check the data before running the dry run again.'
            : ''),
      };
    } else {
      const o = commitOutcome(r.out, lineCount(dry.code));
      data = {
        status: o.status,
        output: o.output,
        error: 'error' in o ? o.error : null,
        ...('applied' in o && {
          plan: json(dry.plan),
          changeCount: o.applied,
        }),
      };
    }
    const done = await this.db.run.update({
      where: { id: run.id },
      data: { ...data, durationMs: r.durationMs },
    });
    return toRunDto(done);
  }

  async list(user: AuthUser, q: ListRunsQuery) {
    const take = q.take ?? 50;
    const rows = await this.db.run.findMany({
      where: {
        userId: user.id,
        ...(q.connectionId && { connectionId: q.connectionId }),
        ...(q.mode && { mode: q.mode }),
        ...(q.status && { status: q.status }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const more = rows.length > take;
    const items: RunListItem[] = rows.slice(0, take).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { code, output, ...rest } = toRunDto(r);
      return { ...rest, codePreview: code.slice(0, 120) };
    });
    return { items, nextCursor: more ? rows[take - 1].id : null };
  }

  async get(user: AuthUser, id: string) {
    const r = await this.db.run.findFirst({ where: { id, userId: user.id } });
    if (!r) throw notFound('Run');
    return toRunDto(r);
  }
}
