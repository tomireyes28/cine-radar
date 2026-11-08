import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  isValidCalendarDate,
  isValidPositiveInt4String,
} from '../../common/utils/argentina-time.util';

function IsCalendarDate(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value: unknown): boolean => isValidCalendarDate(value),
        defaultMessage: () =>
          '$property must be a valid calendar date in YYYY-MM-DD format',
      },
    },
    validationOptions,
  );
}

function IsPositiveInt4String(validationOptions?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isPositiveInt4String',
      validator: {
        validate: (value: unknown): boolean => isValidPositiveInt4String(value),
        defaultMessage: () =>
          '$property must be a positive 32-bit integer (1..2147483647)',
      },
    },
    validationOptions,
  );
}

export class GetMoviesDto {
  @ApiPropertyOptional({
    description:
      'Fecha calendario válida en formato estricto YYYY-MM-DD (hora de Argentina)',
    example: '2026-10-30',
  })
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ciudad o nombre del complejo',
    example: 'Palermo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar por zona geográfica (CABA, GBA Norte, GBA Oeste, GBA Sur, Interior)',
    example: 'CABA',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  zone?: string;

  @ApiPropertyOptional({
    description: 'ID entero positivo de la cadena de cine (1..2147483647)',
    example: '1',
  })
  @IsOptional()
  @IsPositiveInt4String()
  chainId?: string;

  @ApiPropertyOptional({
    description: 'ID entero positivo del complejo de cine (1..2147483647)',
    example: '14',
  })
  @IsOptional()
  @IsPositiveInt4String()
  cinemaId?: string;
}
