import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

// Content rules (normUrl / credErr / name) are checked in the service so the
// messages match the HTML dialog; here we only pin the types.

export class TestConnectionDto {
  @IsOptional() @IsString() @MaxLength(2048) url?: string;
  @IsOptional() @IsString() @MaxLength(512) apiKey?: string;
  @IsOptional() @IsString() @MaxLength(512) apiSecret?: string;
}

export class CreateConnectionDto extends TestConnectionDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsBoolean() saveSecret?: boolean;
  @IsOptional() @IsBoolean() temporary?: boolean;
}

export class UpdateConnectionDto extends TestConnectionDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsBoolean() saveSecret?: boolean;
  @IsOptional() @IsBoolean() writable?: boolean;
  @IsOptional() @IsString() @MaxLength(200) confirmName?: string;
}

export class SecretDto {
  @IsOptional() @IsString() @MaxLength(512) apiSecret?: string;
}

/** Never carries url, apiKey or secret. */
export interface ConnectionDto {
  id: string;
  name: string;
  persisted: boolean;
  user: string | null;
  frappeVersion: string | null;
  saveSecret: boolean;
  hasSecret: boolean;
  writable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestResultDto {
  user: string;
  frappeVersion: string | null;
  swapped: boolean;
}
