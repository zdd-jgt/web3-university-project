import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsString, Length, Max, Min } from "class-validator";
import { LessonContentKind } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { Errors } from "../common/app-error";
import { MediaService } from "./media.service";

const ABSOLUTE_UPLOAD_LIMIT_BYTES = 2_147_483_648;

class CreateUploadSessionDto {
  @IsEnum(LessonContentKind) kind!: LessonContentKind;
  @IsString() @Length(1, 180) fileName!: string;
  @IsString() @Length(1, 160) declaredMimeType!: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ABSOLUTE_UPLOAD_LIMIT_BYTES)
  sizeBytes!: number;
}

@Controller("v1")
@UseGuards(AuthGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("lessons/:lessonId/assets/upload-session")
  createUploadSession(
    @CurrentPrincipal() principal: Principal,
    @Param("lessonId") lessonId: string,
    @Body() dto: CreateUploadSessionDto,
  ) {
    assertTeacher(principal);
    return this.media.createUploadSession(principal.userId, lessonId, dto);
  }

  @Post("assets/:assetId/finalize")
  finalize(@CurrentPrincipal() principal: Principal, @Param("assetId") assetId: string) {
    assertTeacher(principal);
    return this.media.finalize(principal.userId, assetId);
  }

  @Post("assets/:assetId/retry")
  retry(@CurrentPrincipal() principal: Principal, @Param("assetId") assetId: string) {
    assertTeacher(principal);
    return this.media.retry(principal.userId, assetId);
  }

  @Get("assets/:assetId/status")
  status(@CurrentPrincipal() principal: Principal, @Param("assetId") assetId: string) {
    assertTeacher(principal);
    return this.media.status(principal.userId, assetId);
  }
}

function assertTeacher(principal: Principal): void {
  if (principal.role !== "TEACHER" && principal.role !== "ADMIN") throw Errors.forbidden();
}
