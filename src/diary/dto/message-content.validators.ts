import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import {
  assertAttachments,
  assertDecorators,
  assertMessageContent,
  assertReactions,
  assertTodoContent,
} from '../diary-message-content';

function addConstraint(
  name: string,
  validate: (value: unknown, args: ValidationArguments) => boolean,
  defaultMessage: (args: ValidationArguments) => string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name,
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate,
        defaultMessage,
      },
    });
  };
}

export function IsVariantContent(validationOptions?: ValidationOptions) {
  return addConstraint(
    'isVariantContent',
    (_value, args) => {
      const object = args.object as { variant?: string; content?: unknown };
      return (
        assertMessageContent(object.variant ?? '', object.content) === null
      );
    },
    () => 'content does not match variant',
    validationOptions,
  );
}

export function IsTodoContent(validationOptions?: ValidationOptions) {
  return addConstraint(
    'isTodoContent',
    (value) => assertTodoContent(value) === null,
    () => 'content must be valid todo items',
    validationOptions,
  );
}

export function IsAttachmentList(validationOptions?: ValidationOptions) {
  return addConstraint(
    'isAttachmentList',
    (value) => assertAttachments(value) === null,
    () => 'attachments are invalid',
    validationOptions,
  );
}

export function IsDecoratorList(validationOptions?: ValidationOptions) {
  return addConstraint(
    'isDecoratorList',
    (value) => assertDecorators(value) === null,
    () => 'decorators are invalid',
    validationOptions,
  );
}

export function IsReactionList(validationOptions?: ValidationOptions) {
  return addConstraint(
    'isReactionList',
    (value) => assertReactions(value) === null,
    () => 'reactions are invalid',
    validationOptions,
  );
}
