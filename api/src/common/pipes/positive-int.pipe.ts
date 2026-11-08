import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidPositiveInt4String } from '../utils/argentina-time.util';

@Injectable()
export class PositiveIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!isValidPositiveInt4String(value)) {
      throw new BadRequestException(
        'Validation failed (positive 32-bit integer is expected)',
      );
    }
    return Number(value);
  }
}
