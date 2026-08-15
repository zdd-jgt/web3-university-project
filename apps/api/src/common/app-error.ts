import { HttpException, HttpStatus } from "@nestjs/common";

export class AppError extends HttpException {
  constructor(code: string, status: HttpStatus, message = "Request cannot be completed") {
    super({ code, message }, status);
  }
}

export const Errors = {
  unauthenticated: () => new AppError("UNAUTHENTICATED", HttpStatus.UNAUTHORIZED),
  forbidden: () => new AppError("FORBIDDEN", HttpStatus.FORBIDDEN),
  notFound: () => new AppError("NOT_FOUND", HttpStatus.NOT_FOUND),
  conflict: () => new AppError("CONFLICT", HttpStatus.CONFLICT),
  validation: () => new AppError("VALIDATION_FAILED", HttpStatus.BAD_REQUEST),
  unavailable: () => new AppError("DEPENDENCY_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE),
  replay: () => new AppError("REPLAY_REJECTED", HttpStatus.CONFLICT),
  rateLimited: () => new AppError("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS),
};
