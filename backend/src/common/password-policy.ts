import { BadRequestException } from '@nestjs/common';

export function validatePasswordForStorage(password: string) {
  if (typeof password !== 'string' || password.includes('\0') || password.length < 10
    || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new BadRequestException('La contrasena debe tener al menos 10 caracteres, una mayuscula, una minuscula y un numero.');
  }
  // pgcrypto bf limits bytes, not JavaScript character count. Never silently truncate.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new BadRequestException('La contrasena supera el maximo de 72 bytes. Las letras acentuadas y algunos simbolos ocupan mas de un byte.');
  }
}
