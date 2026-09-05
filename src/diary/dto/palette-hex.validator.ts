import { registerDecorator, ValidationOptions } from 'class-validator';
import { parseDiaryHex } from '../diary-color';

export function IsDiaryHex(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isDiaryHex',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && parseDiaryHex(value) !== null;
        },
        defaultMessage() {
          return 'color must be #RGB or #RRGGBB';
        },
      },
    });
  };
}
