import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
type Response = { status(code: number): { json(body: unknown): void } };

@Catch()
export class StableErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      response
        .status(exception.getStatus())
        .json(typeof body === "string" ? { code: "HTTP_ERROR" } : body);
      return;
    }
    // Do not expose dependency, SQL, or token details.
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ code: "INTERNAL_ERROR" });
  }
}
