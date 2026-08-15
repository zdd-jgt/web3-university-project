import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { UserRole } from "@prisma/client";

export type Principal = {
  userId: string;
  privySubject: string;
  wallet: { id: string; address: string; chainId: number };
  role: UserRole;
};

export const CurrentPrincipal = createParamDecorator(
  (_: unknown, context: ExecutionContext): Principal => {
    return context.switchToHttp().getRequest<{ principal: Principal }>().principal;
  },
);
