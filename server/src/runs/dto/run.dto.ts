import { RunMode, RunStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_CODE } from '../../common/text';
import type { GuardHit } from '../../guard/guard';
import type { Change } from '../protocol';

export class RunCodeDto {
  @IsString() @IsNotEmpty() connectionId!: string;

  @IsString()
  @MaxLength(MAX_CODE, { message: 'The script is larger than 1 MB.' })
  code!: string;
}

export class CommitDto {
  @IsString({ message: 'Type the number of changes or COMMIT.' })
  confirm!: string;
}

export class ListRunsQuery {
  @IsOptional() @IsString() connectionId?: string;
  @IsOptional() @IsEnum(RunMode) mode?: RunMode;
  @IsOptional() @IsEnum(RunStatus) status?: RunStatus;
  @IsOptional() @IsString() cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

export interface RunDto {
  /** null for a guest READ run, which is not stored */
  id: string | null;
  mode: RunMode;
  status: RunStatus;
  connectionId: string | null;
  connectionName: string;
  output: string | null;
  error: string | null;
  blocked: GuardHit[] | null;
  plan: Change[] | null;
  changeCount: number | null;
  dryRunId: string | null;
  committedRunId: string | null;
  durationMs: number | null;
  createdAt: Date;
  code: string;
}

export type RunListItem = Omit<RunDto, 'code' | 'output'> & {
  codePreview: string;
};
