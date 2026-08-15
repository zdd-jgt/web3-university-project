import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { CertificatesModule } from "./certificates/certificates.module";
import { CommentsModule } from "./comments/comments.module";
import { CoursesModule } from "./courses/courses.module";
import { EntitlementsModule } from "./entitlements/entitlements.module";
import { HealthModule } from "./health/health.module";
import { LearningModule } from "./learning/learning.module";
import { RateLimitGuard } from "./common/rate-limit.guard";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { TeachersModule } from "./teachers/teachers.module";
import { UsersModule } from "./users/users.module";
@Module({
  imports: [
    PrismaModule,
    UsersModule,
    AuthModule,
    EntitlementsModule,
    StorageModule,
    TeachersModule,
    CoursesModule,
    CommentsModule,
    LearningModule,
    CertificatesModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
