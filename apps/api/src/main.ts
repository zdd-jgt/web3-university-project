import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { StableErrorFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  if (!webOrigin) throw new Error("WEB_ORIGIN is required");
  app.enableCors({
    origin: webOrigin,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type", "x-idempotency-key", "x-wallet-address"],
    maxAge: 600,
  });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new StableErrorFilter());
  const config = new DocumentBuilder()
    .setTitle("Web3 University API")
    .setVersion("v1")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("openapi", app, SwaggerModule.createDocument(app, config));
  const port = Number(process.env.API_PORT ?? 3000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be a valid TCP port");
  }
  await app.listen(port);
}
void bootstrap();
