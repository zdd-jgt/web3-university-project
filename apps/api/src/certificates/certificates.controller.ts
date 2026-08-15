import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { CertificatesService } from "./certificates.service";
@Controller("v1/courses")
@UseGuards(AuthGuard)
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}
  @Get(":courseId/certificate") mine(
    @CurrentPrincipal() p: Principal,
    @Param("courseId") courseId: string,
  ) {
    return this.certificates.mine(p.userId, courseId);
  }
}
