import { describe, expect, it, vi } from "vitest";
import { ApiUnavailableError, UniversityApi } from "./api";

describe("UniversityApi", () => {
  it("fails closed before any request when the API base URL is missing", async () => {
    const api = new UniversityApi(undefined, { getAccessToken: async () => null });
    await expect(api.listCourses()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("adds Privy bearer and active wallet headers to protected requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ url: "https://signed.example" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = new UniversityApi("https://api.example/", {
      getAccessToken: async () => "privy-token",
      wallet: "0x0000000000000000000000000000000000000001",
    });

    await api.videoUrl("lesson-1");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/v1/courses/lessons/lesson-1/video-url", "https://api.example/"),
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer privy-token");
    expect(headers.get("x-wallet-address")).toBe("0x0000000000000000000000000000000000000001");
  });
});
