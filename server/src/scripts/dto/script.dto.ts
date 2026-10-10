import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_CODE } from '../../common/text';

export class CreateScriptDto {
  @IsString()
  @MinLength(1, { message: 'Give the script a name.' })
  @MaxLength(120, { message: 'Keep the name to 120 characters or fewer.' })
  name!: string;

  @IsString()
  @MaxLength(MAX_CODE, { message: 'The script is larger than 1 MB.' })
  code!: string;

  @IsOptional() @IsString() connectionId?: string | null;
}

export class UpdateScriptDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Give the script a name.' })
  @MaxLength(120, { message: 'Keep the name to 120 characters or fewer.' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CODE, { message: 'The script is larger than 1 MB.' })
  code?: string;

  @IsOptional() @IsString() connectionId?: string | null;
}

export interface ScriptDto {
  id: string;
  name: string;
  code: string;
  connectionId: string | null;
  connectionName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
