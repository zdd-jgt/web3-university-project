import { Module } from "@nestjs/common";
import { CommentsAdminController, CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";
@Module({
  providers: [CommentsService],
  controllers: [CommentsController, CommentsAdminController],
})
export class CommentsModule {}
