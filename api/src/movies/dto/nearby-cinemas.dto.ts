import { IsNumber, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer'; // <--- Esto es clave

export class NearbyCinemasDto {
  @IsNotEmpty()
  @Type(() => Number) 
  @IsNumber()
  lat!: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  lng!: number;
}