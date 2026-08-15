import { Global, Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
@Global()
@Module({ providers: [UsersService], controllers: [UsersController], exports: [UsersService] })
export class UsersModule {}
