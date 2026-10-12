import { IsString, MaxLength } from 'class-validator';

// the doctype pattern itself is checked in the service so the error message is friendly
export class SampleRequestDto {
  @IsString() @MaxLength(140) doctype!: string;
}
