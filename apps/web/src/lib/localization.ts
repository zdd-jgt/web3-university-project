export const PLATFORM_NAME = "正经打工人的 web3大学";
export const ZH_CN_LOCALE = "zh-CN";

type DateValue = Date | string | number;

function validDate(value: DateValue): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatZhDateTime(value: DateValue): string {
  const date = validDate(value);
  if (!date) return "时间未知";
  return new Intl.DateTimeFormat(ZH_CN_LOCALE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatZhTime(value: DateValue): string {
  const date = validDate(value);
  if (!date) return "时间未知";
  return new Intl.DateTimeFormat(ZH_CN_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatZhNumber(value: number, options?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(ZH_CN_LOCALE, options).format(value);
}

const LEARNING_REASON_LABELS: Record<string, string> = {
  BASELINE: "正在建立播放基线（BASELINE）",
  PLAYING: "有效播放（PLAYING）",
  PAUSED: "播放位置未前进（PAUSED）",
  SEEK: "检测到跳播，本次不计入进度（SEEK）",
  STALE: "上报已过期或顺序无效（STALE）",
};

export function learningReasonLabel(reason: string | undefined): string {
  if (!reason) return "服务端未说明拒绝原因";
  return LEARNING_REASON_LABELS[reason] ?? `服务端未接受该进度（诊断码：${reason}）`;
}

const ASSET_FAILURE_LABELS: Record<string, string> = {
  UPLOAD_EXPIRED: "上传会话已过期",
  UPLOAD_MISSING: "未找到上传文件",
  SIZE_MISMATCH: "文件大小与申报不一致",
  DECLARATION_MISMATCH: "文件类型与申报不一致",
  INPUT_VIDEO_INVALID: "输入视频无效",
  PROBE_FAILED: "视频验真失败",
  TRANSCODE_FAILED: "视频转码失败",
  OUTPUT_VIDEO_INVALID: "转码结果无效",
  FILE_TOO_LARGE: "文件超过大小限制",
  DOCUMENT_INVALID: "文档无效或格式不受支持",
  OUTPUT_EMPTY: "处理结果为空",
  PROCESSING_TIMEOUT: "处理超时",
  PROCESSING_UNEXPECTED: "处理服务发生异常",
};

export function assetFailureLabel(code: string): string {
  const label = ASSET_FAILURE_LABELS[code];
  return label ? `${label}（${code}）` : `处理失败（诊断码：${code}）`;
}
