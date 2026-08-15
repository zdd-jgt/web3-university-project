import { Module } from "@nestjs/common";
import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
@Module({ providers: [CertificatesService], controllers: [CertificatesController] })
export class CertificatesModule {}
