import { ProcessingFailure } from "./types";
import type { MediaProcessor } from "./processor";
import type { MediaJobStore } from "./job-store";

export class MediaWorker {
  constructor(
    private readonly jobs: MediaJobStore,
    private readonly processor: MediaProcessor,
    private readonly leaseOwner: string,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.jobs.claim(this.leaseOwner);
    if (!job) return false;
    try {
      const facts = await this.processor.process(job);
      await this.jobs.complete(job, this.leaseOwner, facts);
    } catch (error) {
      const failure =
        error instanceof ProcessingFailure
          ? error
          : new ProcessingFailure("PROCESSING_UNEXPECTED", true);
      await this.jobs.fail(job, this.leaseOwner, failure);
    }
    return true;
  }
}
