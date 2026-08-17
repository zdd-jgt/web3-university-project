import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { Errors } from "../common/app-error";
import { CommentsService } from "./comments.service";
class CommentDto {
  @IsString() @Length(1, 4000) body!: string;
  @IsOptional() @IsString() @Length(1, 64) parentId?: string;
}
class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
class ModerateCommentDto {
  @IsBoolean() hidden!: boolean;
  @IsString() @Length(3, 500) reason!: string;
}
@Controller("v1/courses/:courseId/comments")
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}
  @Get() list(@Param("courseId") courseId: string, @Query() query: PageDto) {
    return this.comments.list(courseId, query.page, query.limit);
  }
  @Post() @UseGuards(AuthGuard) create(
    @CurrentPrincipal() p: Principal,
    @Param("courseId") courseId: string,
    @Body() dto: CommentDto,
  ) {
    return this.comments.create(p.userId, p.wallet, courseId, dto.body, dto.parentId);
  }
  @Patch(":commentId/moderate") @UseGuards(AuthGuard) moderate(
    @CurrentPrincipal() p: Principal,
    @Param("courseId") courseId: string,
    @Param("commentId") commentId: string,
    @Body() dto: ModerateCommentDto,
  ) {
    if (p.role !== "ADMIN") throw Errors.forbidden();
    return this.comments.moderate(p.userId, courseId, commentId, dto.hidden, dto.reason);
  }
}

@Controller("v1/comments")
@UseGuards(AuthGuard)
export class CommentsAdminController {
  constructor(private readonly comments: CommentsService) {}
  @Get("review-queue") queue(@CurrentPrincipal() p: Principal) {
    if (p.role !== "ADMIN") throw Errors.forbidden();
    return this.comments.reviewQueue();
  }
}
