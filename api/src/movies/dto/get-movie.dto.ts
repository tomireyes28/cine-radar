import {
  IsOptional,
  IsString,
  IsNumberString,
  IsISO8601,
} from 'class-validator';

export class GetMoviesDto {
  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsNumberString()
  chainId?: string;

  @IsOptional()
  @IsNumberString()
  cinemaId?: string;
}
