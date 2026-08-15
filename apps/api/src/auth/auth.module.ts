import { Global, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { AuthGuard } from "./auth.guard";
import { IDENTITY_VERIFIER, identityVerifierFactory } from "./identity-verifier";

@Global()
@Module({
  imports: [UsersModule],
  providers: [AuthGuard, { provide: IDENTITY_VERIFIER, useFactory: identityVerifierFactory }],
  exports: [AuthGuard, IDENTITY_VERIFIER],
})
export class AuthModule {}
