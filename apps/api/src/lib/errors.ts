export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, code = 'bad_request') => new AppError(400, code, msg);
export const unauthorized = (msg = 'Authentication required') =>
  new AppError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Forbidden') => new AppError(403, 'forbidden', msg);
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (msg: string) => new AppError(409, 'conflict', msg);
export const unavailable = (msg: string) => new AppError(503, 'unavailable', msg);
