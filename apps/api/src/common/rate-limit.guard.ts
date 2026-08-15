import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import { createClient } from "redis";
import { Errors } from "./app-error";

type RequestWithSocket = { socket?: { remoteAddress?: string } };

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly buckets = new Map<string, number[]>();
  private readonly windowMs = 60_000;
  private readonly maxRequests = 120;
  private readonly redis = process.env.REDIS_URL
    ? createClient({ url: process.env.REDIS_URL })
    : undefined;
  private connectPromise?: Promise<void>;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSocket>();
    const key = this.keyFor(request.socket?.remoteAddress ?? "unknown");
    if (this.redis) {
      try {
        await this.ensureConnected();
        const count = Number(
          await this.redis.eval(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
            { keys: [key], arguments: [String(this.windowMs)] },
          ),
        );
        if (!Number.isFinite(count)) throw Errors.unavailable();
        if (count > this.maxRequests) throw Errors.rateLimited();
        return true;
      } catch (error) {
        if (error instanceof Error && "getStatus" in error) throw error;
        if (!["local", "test"].includes(process.env.APP_ENV ?? "")) {
          throw Errors.unavailable();
        }
      }
    } else if (!["local", "test"].includes(process.env.APP_ENV ?? "")) {
      throw Errors.unavailable();
    }

    const now = Date.now();
    const active = (this.buckets.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (active.length >= this.maxRequests) throw Errors.rateLimited();
    active.push(now);
    this.buckets.set(key, active);
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.isOpen) await this.redis.quit();
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redis || this.redis.isOpen) return;
    this.connectPromise ??= this.redis.connect().then(() => undefined);
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = undefined;
    }
  }

  private keyFor(remoteAddress: string): string {
    const secret = process.env.RATE_LIMIT_KEY_SECRET?.trim();
    if (!secret && !["local", "test"].includes(process.env.APP_ENV ?? "")) {
      throw Errors.unavailable();
    }
    const digest = createHmac("sha256", secret ?? "local-only")
      .update(remoteAddress)
      .digest("hex");
    return `web3u:rate:${digest}`;
  }
}
