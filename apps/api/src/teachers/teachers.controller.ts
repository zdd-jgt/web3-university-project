import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsString, Length } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { Errors } from "../common/app-error";
import { TeachersService } from "./teachers.service";
class ApplyDto {
  @IsString() @Length(20, 4000) statement!: string;
}
class ReviewDto {
  @IsBoolean() approved!: boolean;
}
@Controller("v1/teacher-applications")
@UseGuards(AuthGuard)
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}
  @Post() apply(@CurrentPrincipal() principal: Principal, @Body() dto: ApplyDto) {
    return this.teachers.apply(principal.userId, dto.statement);
  }
  @Get("me") mine(@CurrentPrincipal() principal: Principal) {
    return this.teachers.mine(principal.userId);
  }
  @Get("review-queue") queue(@CurrentPrincipal() principal: Principal) {
    if (principal.role !== "ADMIN") throw Errors.forbidden();
    return this.teachers.reviewQueue();
  }
  @Patch(":id/review") review(
    @CurrentPrincipal() principal: Principal,
    @Param("id") id: string,
    @Body() dto: ReviewDto,
  ) {
    if (principal.role !== "ADMIN") throw Errors.forbidden();
    return this.teachers.review(principal.userId, id, dto.approved);
  }
}
