import { IsOptional, IsString, IsNumberString, IsISO8601 } from 'class-validator';

export class GetMoviesDto {
  @IsOptional()
  @IsISO8601() // Valida que sea una fecha real (YYYY-MM-DD)
  date?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumberString() // Valida que sea un string numérico ("123")
  chainId?: string;

  @IsOptional()
  @IsNumberString()
  cinemaId?: string;
}