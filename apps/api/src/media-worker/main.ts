import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaMediaJobStore } from "./job-store";
import { S3MediaObjectStore } from "./object-store";
import { MediaProcessor } from "./processor";
import { MediaWorker } from "./worker";

async function main() {
  const prisma = new PrismaClient();
  const worker = new MediaWorker(
    new PrismaMediaJobStore(prisma),
    new MediaProcessor(S3MediaObjectStore.fromEnvironment()),
    `media-${randomUUID()}`,
  );
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    while (!stopping) {
      const worked = await worker.runOnce();
      if (!worked) await delay(1000);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "media worker failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
