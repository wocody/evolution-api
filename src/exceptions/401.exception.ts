import { HttpStatus } from '@api/types/http-status';

export class UnauthorizedException {
  constructor(...objectError: any[]) {
    throw {
      status: HttpStatus.UNAUTHORIZED,
      error: 'Unauthorized',
      message: objectError.length > 0 ? objectError : 'Unauthorized',
    };
  }
}
