import { beforeEach, describe, expect, it } from "vitest";
import {
  LocalEntitlementReader,
  RpcEntitlementReader,
} from "../src/entitlements/entitlement-reader";
import { LocalIdentityVerifier } from "../src/auth/identity-verifier";
import { contentTypeFor } from "../src/storage/storage-signer";
describe("fail-closed adapters", () => {
  beforeEach(() => {
    process.env.APP_ENV = "test";
    delete process.env.LOCAL_PURCHASED_COURSE_IDS;
  });
  it("rejects malformed local identity", async () =>
    expect(
      new LocalIdentityVerifier().verify("local:subject:0xnot-a-wallet"),
    ).rejects.toMatchObject({ status: 401 }));
  it("does not let a caller replace the wallet encoded in a local identity", async () =>
    expect(
      new LocalIdentityVerifier().verify(
        "local:subject:0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ),
    ).rejects.toMatchObject({ status: 401 }));
  it("rejects an entitlement that is not explicitly configured", async () =>
    expect(
      new LocalEntitlementReader().assertPurchased(
        "0x0000000000000000000000000000000000000000",
        11155111,
        "course-1",
      ),
    ).rejects.toMatchObject({ status: 403 }));
  it("does not treat missing RPC implementation as a purchase", async () =>
    expect(
      new RpcEntitlementReader().assertPurchased(
        "0x0000000000000000000000000000000000000000",
        11155111,
        "course-1",
      ),
    ).rejects.toMatchObject({ status: 503 }));
  it("serves captions with a browser-loadable VTT MIME type", () => {
    expect(contentTypeFor("video")).toBe("video/mp4");
    expect(contentTypeFor("captions")).toBe("text/vtt; charset=utf-8");
  });
});
