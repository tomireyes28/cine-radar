import {
  IsOptional,
  IsString,
  IsNumberString,
  IsISO8601,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetMoviesDto {
  @ApiPropertyOptional({
    description: 'Fecha de la función en formato YYYY-MM-DD (hora de Argentina)',
    example: '2026-10-30',
  })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ciudad o nombre del complejo',
    example: 'Palermo',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por zona geográfica (CABA, GBA Norte, GBA Oeste, GBA Sur, Interior)',
    example: 'CABA',
  })
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional({
    description: 'ID de la cadena de cine (Cinemark=1, Cinépolis=2, etc.)',
    example: '1',
  })
  @IsOptional()
  @IsNumberString()
  chainId?: string;

  @ApiPropertyOptional({
    description: 'ID específico del complejo de cine',
    example: '14',
  })
  @IsOptional()
  @IsNumberString()
  cinemaId?: string;
}
