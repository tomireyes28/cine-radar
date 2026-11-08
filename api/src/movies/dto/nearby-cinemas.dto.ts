import { IsNumber, IsNotEmpty, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

function parseCoordinate(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return Number(trimmed);
  }
  return value;
}

export class NearbyCinemasDto {
  @ApiProperty({
    description: 'Latitud del usuario (-90 a 90)',
    example: -34.6037,
  })
  @IsNotEmpty()
  @Transform(({ value }) => parseCoordinate(value))
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({
    description: 'Longitud del usuario (-180 a 180)',
    example: -58.3816,
  })
  @IsNotEmpty()
  @Transform(({ value }) => parseCoordinate(value))
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;
}
