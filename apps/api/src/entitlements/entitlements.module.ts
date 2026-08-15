import { Global, Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ENTITLEMENT_READER, entitlementReaderFactory } from "./entitlement-reader";
@Global()
@Module({
  providers: [
    { provide: ENTITLEMENT_READER, useFactory: entitlementReaderFactory, inject: [PrismaService] },
  ],
  exports: [ENTITLEMENT_READER],
})
export class EntitlementsModule {}
