import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Status } from "../../components/ui";
import { apiErrorMessage, type UniversityApi } from "../../lib/api";
import { formatZhTime } from "../../lib/localization";
import { useLearningSession } from "./useLearningSession";

export function DocumentLesson({
  api,
  lessonId,
  fileName,
  mimeType,
  complete,
  onProgressChanged,
}: {
  api: UniversityApi;
  lessonId: string;
  fileName: string;
  mimeType: string | null;
  complete: boolean;
  onProgressChanged: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const { session, phase, error, renewalError, retry } = useLearningSession(api, lessonId, {
    onSessionChanged: () => setConfirmError(null),
  });

  const onProgressRef = useRef(onProgressChanged);
  onProgressRef.current = onProgressChanged;

  async function confirmRead() {
    if (!session) return;
    setConfirmError(null);
    setConfirming(true);
    try {
      await api.confirmDocumentRead(session.sessionId);
      onProgressRef.current();
    } catch (caught) {
      setConfirmError(apiErrorMessage(caught));
    } finally {
      setConfirming(false);
    }
  }

  if (phase === "failed") {
    return (
      <div className="video-shell" role="alert">
        <span>文档访问会话不可用</span>
        <small>{error ?? "服务端已拒绝该访问会话。"}</small>
        <Button type="button" onClick={() => retry()}>
          重试文档访问
        </Button>
      </div>
    );
  }

  if (phase === "starting" || !session) {
    return (
      <div className="video-shell">
        <span>正在开启文档访问会话…</span>
        <small>服务端会先核验你的购买凭证，再签发短期有效的阅读链接。</small>
      </div>
    );
  }

  return (
    <div className="document-lesson">
      <div className="row spread">
        <div>
          <p className="eyebrow">受保护文档</p>
          <h2>{fileName}</h2>
          <p className="muted">{mimeType ?? "暂无已核验的 MIME 类型"}</p>
        </div>
        <Status tone={complete ? "success" : "neutral"}>
          {complete ? "已确认阅读" : "待确认阅读"}
        </Status>
      </div>
      <p>
        使用你的短期访问链接打开文档，然后确认已阅读。仅打开链接不会完成课时，确认操作可重复提交且结果一致。
      </p>
      <div className="button-row">
        <a
          className="button secondary"
          href={session.url}
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpened(true)}
        >
          打开文档 <ExternalLink size={13} />
        </a>
        <Button
          type="button"
          disabled={!opened || confirming || complete}
          onClick={() => void confirmRead()}
        >
          {complete ? "课时已完成" : confirming ? "正在确认…" : "确认我已阅读该文档"}
        </Button>
      </div>
      <p className="fine-print">
        访问链接于 {formatZhTime(session.urlExpiresAt)}
        过期。没有成功访问记录的确认会被服务端拒绝。
      </p>
      {renewalError && (
        <p className="fine-print" role="status">
          正在重试刷新访问凭证，当前文档链接仍可使用（{renewalError}）。
        </p>
      )}
      {confirmError && (
        <p className="error" role="alert">
          {confirmError}
        </p>
      )}
    </div>
  );
}
