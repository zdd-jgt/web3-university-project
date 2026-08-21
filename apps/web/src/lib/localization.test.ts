import { describe, expect, it } from "vitest";
import {
  assetFailureLabel,
  formatZhDateTime,
  formatZhNumber,
  formatZhTime,
  learningReasonLabel,
  PLATFORM_NAME,
  ZH_CN_LOCALE,
} from "./localization";

describe("zh-CN localization", () => {
  it("exposes the confirmed platform brand", () => {
    expect(PLATFORM_NAME).toBe("正经打工人的 web3大学");
    expect(ZH_CN_LOCALE).toBe("zh-CN");
  });

  it("formats dates, times and numbers with an explicit Chinese locale", () => {
    const localDate = new Date(2026, 7, 18, 13, 5, 9);
    expect(formatZhDateTime(localDate)).toBe("2026/08/18 13:05");
    expect(formatZhTime(localDate)).toBe("13:05:09");
    expect(formatZhNumber(12_345.678, { maximumFractionDigits: 2 })).toBe("12,345.68");
    expect(formatZhDateTime("not-a-date")).toBe("时间未知");
  });

  it("translates known and unknown learning reasons", () => {
    expect(learningReasonLabel("SEEK")).toBe("检测到跳播，本次不计入进度（SEEK）");
    expect(learningReasonLabel("NEW_REASON")).toBe("服务端未接受该进度（诊断码：NEW_REASON）");
    expect(learningReasonLabel(undefined)).toBe("服务端未说明拒绝原因");
  });

  it("translates known and unknown media failure codes", () => {
    expect(assetFailureLabel("TRANSCODE_FAILED")).toBe("视频转码失败（TRANSCODE_FAILED）");
    expect(assetFailureLabel("NEW_FAILURE")).toBe("处理失败（诊断码：NEW_FAILURE）");
  });
});
