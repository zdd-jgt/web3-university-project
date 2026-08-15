import { Module } from "@nestjs/common";
import { TeachersModule } from "../teachers/teachers.module";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";
@Module({
  imports: [TeachersModule],
  providers: [CoursesService],
  controllers: [CoursesController],
  exports: [CoursesService],
})
export class CoursesModule {}
