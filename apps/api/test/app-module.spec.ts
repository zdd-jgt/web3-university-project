import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthModule } from "../src/auth/auth.module";
import { PrismaModule } from "../src/prisma/prisma.module";
import { TeachersModule } from "../src/teachers/teachers.module";
import { UsersModule } from "../src/users/users.module";

describe("AppModule runtime dependency graph", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
    process.env.S3_REGION = "us-east-1";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ACCESS_KEY = "test";
    process.env.S3_SECRET_KEY = "test-secret";
  });

  it("compiles every controller guard with its exported dependencies", async () => {
    const module = await Test.createTestingModule({
      imports: [PrismaModule, UsersModule, AuthModule, TeachersModule],
    }).compile();
    expect(module).toBeDefined();
  }, 15_000);
});
