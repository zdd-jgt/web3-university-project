import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error";
import { UsersService } from "../users/users.service";
import { IDENTITY_VERIFIER, type IdentityVerifier } from "./identity-verifier";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_VERIFIER) private readonly verifier: IdentityVerifier,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; principal?: unknown }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw Errors.unauthenticated();
    const identity = await this.verifier.verify(
      authorization.slice(7),
      request.headers["x-wallet-address"],
    );
    request.principal = await this.users.getOrCreate(identity);
    return true;
  }
}
