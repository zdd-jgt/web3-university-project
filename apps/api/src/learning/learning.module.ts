import { Module } from "@nestjs/common";
import { LearningController } from "./learning.controller";
import { LEARNING_CLOCK, systemLearningClock } from "./learning-clock";
import { LearningSessionsService } from "./learning-sessions.service";
@Module({
  providers: [LearningSessionsService, { provide: LEARNING_CLOCK, useValue: systemLearningClock }],
  controllers: [LearningController],
  exports: [LearningSessionsService],
})
export class LearningModule {}
