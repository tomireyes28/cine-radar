import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import {
  isValidPositiveInt4String,
  MAX_INT4,
} from '../utils/argentina-time.util';

@Injectable()
export class PositiveIntPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 1 || value > MAX_INT4) {
        throw new BadRequestException(
          'Validation failed (positive 32-bit integer is expected)',
        );
      }
      return value;
    }

    if (!isValidPositiveInt4String(value)) {
      throw new BadRequestException(
        'Validation failed (positive 32-bit integer is expected)',
      );
    }
    return Number(value);
  }
}
