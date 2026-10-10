import { IsString } from 'class-validator';

export class NoteDto {
  @IsString() content!: string;
}
