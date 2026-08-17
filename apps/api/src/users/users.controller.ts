import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { IsNotEmpty, IsString, Length, Matches } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentPrincipal, type Principal } from "../auth/principal";
import { UsersService } from "./users.service";

class UpdateProfileDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,128}$/) nonce!: string;
  @IsString() @IsNotEmpty() @Length(1, 1024) signature!: string;
  @IsString() @Length(1, 80) displayName!: string;
}

class ProfileChallengeDto {
  @IsString() @Length(1, 80) displayName!: string;
}

@Controller("v1/profile")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get("me") me(@CurrentPrincipal() principal: Principal) {
    return { userId: principal.userId, role: principal.role };
  }
  @Post("challenge") challenge(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ProfileChallengeDto,
  ) {
    return this.users.createProfileChallenge(principal, dto.displayName);
  }
  @Patch() update(@CurrentPrincipal() principal: Principal, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(principal, dto.nonce, dto.signature, dto.displayName);
  }
}
