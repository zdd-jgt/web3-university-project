import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEthereumAddress,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { Errors } from "../common/app-error";
import { CERTIFICATE_METADATA_URI, CoursesService } from "./courses.service";
class CreateCourseDto {
  @IsString() @Length(1, 160) title!: string;
  @IsString() @Length(1, 12000) description!: string;
}
class UpdateCourseDto {
  @IsOptional() @IsString() @Length(1, 160) title?: string;
  @IsOptional() @IsString() @Length(1, 12000) description?: string;
}
class SubmitCourseDto {
  @IsString() @Length(1, 96) @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/) priceYD!: string;
  @IsEthereumAddress() payoutWallet!: string;
  @IsString()
  @Length(1, 2048)
  @Matches(CERTIFICATE_METADATA_URI)
  certificateMetadataUri!: string;
}
class ReviewCourseDto {
  @IsBoolean() approved!: boolean;
}
class CreateLessonDto {
  @IsString() @Length(1, 160) title!: string;
  @IsInt() @Min(1) @Max(10000) position!: number;
  @IsBoolean() required!: boolean;
}
class CreateVideoDto {
  @IsString() @Matches(/^[a-zA-Z0-9!_./-]{1,512}$/) objectKey!: string;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9!_./-]{1,512}$/) captionsObjectKey?: string;
  @IsInt() @Min(1000) @Max(43_200_000) durationMs!: number;
}
class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
@Controller("v1/courses")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}
  @Get() list(@Query() query: PageDto) {
    return this.courses.list(query.page, query.limit);
  }
  @Get("mine") @UseGuards(AuthGuard) mine(@CurrentPrincipal() principal: Principal) {
    return this.courses.mine(principal.userId);
  }
  @Get(":id") detail(@Param("id") id: string) {
    return this.courses.detail(id);
  }
  @Post() @UseGuards(AuthGuard) create(
    @CurrentPrincipal() p: Principal,
    @Body() dto: CreateCourseDto,
  ) {
    return this.courses.create(p.userId, dto);
  }
  @Patch(":id") @UseGuards(AuthGuard) update(
    @CurrentPrincipal() p: Principal,
    @Param("id") id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courses.update(p.userId, id, dto);
  }
  @Post(":id/submit") @UseGuards(AuthGuard) submit(
    @CurrentPrincipal() p: Principal,
    @Param("id") id: string,
    @Body() dto: SubmitCourseDto,
  ) {
    return this.courses.submit(p.userId, id, dto);
  }
  @Patch(":id/review") @UseGuards(AuthGuard) review(
    @CurrentPrincipal() p: Principal,
    @Param("id") id: string,
    @Body() dto: ReviewCourseDto,
  ) {
    if (p.role !== "ADMIN") throw Errors.forbidden();
    return this.courses.review(p.userId, id, dto.approved);
  }
  @Post(":id/lessons") @UseGuards(AuthGuard) lesson(
    @CurrentPrincipal() p: Principal,
    @Param("id") id: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.courses.addLesson(p.userId, id, dto);
  }
  @Post("lessons/:lessonId/video") @UseGuards(AuthGuard) video(
    @CurrentPrincipal() p: Principal,
    @Param("lessonId") lessonId: string,
    @Body() dto: CreateVideoDto,
  ) {
    return this.courses.addVideo(p.userId, lessonId, dto);
  }
  @Get("lessons/:lessonId/video-url") @UseGuards(AuthGuard) videoUrl(
    @CurrentPrincipal() p: Principal,
    @Param("lessonId") lessonId: string,
  ) {
    return this.courses.signVideo(p.userId, p.wallet, lessonId);
  }
}
