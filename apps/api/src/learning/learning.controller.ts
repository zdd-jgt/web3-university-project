import { Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { IsInt, Max, Min } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { Errors } from "../common/app-error";
import { LearningService } from "./learning.service";
class ProgressDto {
  @IsInt() @Min(0) startMs!: number;
  @IsInt() @Min(1) @Max(43_200_000) endMs!: number;
}
@Controller("v1")
@UseGuards(AuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningService) {}
  @Get("courses/:courseId/progress")
  progress(@CurrentPrincipal() p: Principal, @Param("courseId") courseId: string) {
    return this.learning.progress(p.userId, p.wallet, courseId);
  }

  @Post("lessons/:lessonId/progress")
  record(
    @CurrentPrincipal() p: Principal,
    @Param("lessonId") lessonId: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Body() dto: ProgressDto,
  ) {
    if (!idempotencyKey || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))
      throw Errors.validation();
    if (dto.endMs <= dto.startMs) throw Errors.validation();
    return this.learning.record(p.userId, p.wallet, lessonId, { ...dto, idempotencyKey });
  }
}
