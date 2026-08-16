import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsInt, Max, Min } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { LearningSessionsService } from "./learning-sessions.service";
class HeartbeatDto {
  @IsInt() @Min(1) @Max(10_000_000) sequence!: number;
  @IsInt() @Min(0) @Max(43_200_000) positionMs!: number;
}
@Controller("v1")
@UseGuards(AuthGuard)
export class LearningController {
  constructor(private readonly learning: LearningSessionsService) {}
  @Get("courses/:courseId/progress")
  progress(@CurrentPrincipal() p: Principal, @Param("courseId") courseId: string) {
    return this.learning.progress(p.userId, p.wallet, courseId);
  }

  @Post("lessons/:lessonId/learning-sessions")
  start(@CurrentPrincipal() principal: Principal, @Param("lessonId") lessonId: string) {
    return this.learning.startSession(principal.userId, principal.wallet, lessonId);
  }

  @Post("learning-sessions/:sessionId/heartbeats")
  heartbeat(
    @CurrentPrincipal() principal: Principal,
    @Param("sessionId") sessionId: string,
    @Body() dto: HeartbeatDto,
  ) {
    return this.learning.heartbeat(principal.userId, principal.wallet, sessionId, dto);
  }

  @Post("learning-sessions/:sessionId/document-confirmation")
  confirmDocument(@CurrentPrincipal() principal: Principal, @Param("sessionId") sessionId: string) {
    return this.learning.confirmDocument(principal.userId, principal.wallet, sessionId);
  }
}
