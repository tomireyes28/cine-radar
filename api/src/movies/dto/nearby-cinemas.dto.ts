import { IsNumber, IsNotEmpty, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class NearbyCinemasDto {
  @ApiProperty({
    description: 'Latitud del usuario (-90 a 90)',
    example: -34.6037,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({
    description: 'Longitud del usuario (-180 a 180)',
    example: -58.3816,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}
