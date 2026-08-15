import { Global, Module } from "@nestjs/common";
import { STORAGE_SIGNER, storageSignerFactory } from "./storage-signer";
@Global()
@Module({
  providers: [{ provide: STORAGE_SIGNER, useFactory: storageSignerFactory }],
  exports: [STORAGE_SIGNER],
})
export class StorageModule {}
