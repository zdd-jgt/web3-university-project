import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PageIntro } from "../../components/layout";
import { Button, Card, Status } from "../../components/ui";
import {
  type ApiCommentQueueItem,
  type ApiCourseStatus,
  type ApiPublicationPackage,
  type ApiReviewQueueItem,
  apiErrorMessage,
  type TeacherApplication,
  type UniversityApi,
  useUniversityApi,
} from "../../lib/api";
import { formatZhDateTime } from "../../lib/localization";
import { runtime, useWalletSession } from "../../lib/runtime";

const COURSE_STATUS_LABEL: Record<ApiCourseStatus, string> = {
  DRAFT: "草稿",
  PENDING_REVIEW: "待审核",
  APPROVED: "已批准",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

export function AdminPage() {
  const api = useUniversityApi();
  const wallet = useWalletSession();
  const canAct =
    !runtime.isDemo && api.available && wallet.authenticated && Boolean(wallet.address);
  const session = useQuery({
    queryKey: ["session-me"],
    queryFn: () => api.me(),
    enabled: canAct,
  });
  const blockedReason = runtime.isDemo
    ? `演示模式：${runtime.reason}。管理员审核需要真实的 Privy 会话与 API。`
    : !api.available
      ? "VITE_API_BASE_URL 未配置，管理员审核无法调用 API。"
      : !wallet.authenticated
        ? "请先通过 Privy 登录，再使用管理控制台。"
        : !wallet.address
          ? "请先连接钱包，再使用管理控制台。"
          : "";
  return (
    <div className="page">
      <PageIntro eyebrow="管理员审核" title="审核请求；不要以为界面角色限制就是授权。">
        下列每个决定都是一次经过认证的 API
        调用。服务端会拒绝非管理员账号的请求，链上发布仍是独立的运营操作。
      </PageIntro>
      {!canAct ? (
        <Card className="empty-state">
          <TriangleAlert size={18} aria-hidden="true" /> {blockedReason}
        </Card>
      ) : session.isLoading ? (
        <Card className="empty-state">正在核验你的服务端角色…</Card>
      ) : session.isError ? (
        <Card className="empty-state">
          <TriangleAlert size={18} aria-hidden="true" /> {apiErrorMessage(session.error)}
        </Card>
      ) : session.data?.role !== "ADMIN" ? (
        <Card className="empty-state">
          <TriangleAlert size={18} aria-hidden="true" /> 你的账号无权使用管理控制台。
        </Card>
      ) : (
        <>
          <TeacherApplicationQueue api={api} />
          <CourseReviewQueue api={api} />
          <CommentModerationQueue api={api} />
        </>
      )}
    </div>
  );
}

function TeacherApplicationQueue({ api }: { api: UniversityApi }) {
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: ["teacher-application-queue"],
    queryFn: () => api.teacherApplicationQueue(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(application: TeacherApplication, approved: boolean) {
    setError(null);
    setBusyId(application.id);
    try {
      await api.reviewTeacherApplication(application.id, approved);
      await queryClient.invalidateQueries({ queryKey: ["teacher-application-queue"] });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <h2>教师申请</h2>
      {queue.isLoading ? (
        <p className="muted">正在加载待处理申请…</p>
      ) : queue.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(queue.error)}
        </p>
      ) : !queue.data?.length ? (
        <p className="muted">暂无待处理的教师申请。</p>
      ) : (
        queue.data.map((application) => (
          <div className="row spread" key={application.id}>
            <div>
              <strong>{application.userId}</strong>
              <p className="muted">
                {application.statement.length > 240
                  ? `${application.statement.slice(0, 240)}…`
                  : application.statement}
              </p>
              <small className="muted">提交于 {formatZhDateTime(application.createdAt)}</small>
            </div>
            <div className="button-row">
              <Button
                type="button"
                disabled={busyId === application.id}
                onClick={() => void decide(application, true)}
              >
                {busyId === application.id ? "审核中…" : "批准"}
              </Button>
              <Button
                className="secondary"
                type="button"
                disabled={busyId === application.id}
                onClick={() => void decide(application, false)}
              >
                拒绝
              </Button>
            </div>
          </div>
        ))
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">批准将在服务端授予教师角色。拒绝为最终决定。</p>
    </Card>
  );
}

function CourseReviewQueue({ api }: { api: UniversityApi }) {
  const queue = useQuery({
    queryKey: ["course-review-queue"],
    queryFn: () => api.courseReviewQueue(),
  });
  return (
    <Card>
      <h2>课程发布队列</h2>
      {queue.isLoading ? (
        <p className="muted">正在加载审核队列…</p>
      ) : queue.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(queue.error)}
        </p>
      ) : !queue.data?.length ? (
        <p className="muted">暂无待审核的已提交课程。</p>
      ) : (
        queue.data.map((item) => <ReviewItem key={item.id} api={api} item={item} />)
      )}
    </Card>
  );
}

function ReviewItem({ api, item }: { api: UniversityApi; item: ApiReviewQueueItem }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"approve" | "reject" | "package" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packageResult, setPackageResult] = useState<ApiPublicationPackage | null>(null);
  const priceYD = item.requestedPriceYD ? formatYD(item.requestedPriceYD) : null;

  async function decide(approved: boolean) {
    setError(null);
    setBusy(approved ? "approve" : "reject");
    try {
      const result = await api.reviewCourse(item.id, approved);
      if (approved && result.onchainConfig) setPackageResult(result.onchainConfig);
      await queryClient.invalidateQueries({ queryKey: ["course-review-queue"] });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function recoverPackage() {
    setError(null);
    setBusy("package");
    try {
      setPackageResult(await api.publicationPackage(item.id));
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-review-item">
      <div className="row spread">
        <div>
          <p className="eyebrow">
            {item.status === "PENDING_REVIEW" ? "发布申请" : "已批准 · 未发布"}
          </p>
          <h2>{item.title}</h2>
          <p className="muted">
            教师：{item.teacherId} · 申报价格：{priceYD ?? "未知"} YD · 收款钱包：{" "}
            {item.requestedPayoutWallet ?? "未知"}
          </p>
          <small className="muted">
            元数据：{item.certificateMetadataUri ?? "未知"} · 提交哈希：{" "}
            {item.submissionHash ? `${item.submissionHash.slice(0, 18)}…` : "未知"}
          </small>
        </div>
        <Status tone={item.status === "PENDING_REVIEW" ? "warning" : "success"}>
          {COURSE_STATUS_LABEL[item.status]}
        </Status>
      </div>
      <div className="admin-checks">
        <label>
          <input type="checkbox" /> 必修课时的受保护资产已就绪（READY）
        </label>
        <label>
          <input type="checkbox" /> 已核对售价、收款钱包与费用披露
        </label>
        <label>
          <input type="checkbox" /> 证书元数据 URI 不含个人数据
        </label>
      </div>
      <div className="button-row">
        {item.status === "PENDING_REVIEW" && (
          <>
            <Button type="button" disabled={busy !== null} onClick={() => void decide(true)}>
              {busy === "approve" ? "正在批准…" : "批准提交"}
            </Button>
            <Button
              className="secondary"
              type="button"
              disabled={busy !== null}
              onClick={() => void decide(false)}
            >
              {busy === "reject" ? "正在退回…" : "退回为草稿"}
            </Button>
          </>
        )}
        {item.status === "APPROVED" && (
          <Button
            className="secondary"
            type="button"
            disabled={busy !== null}
            onClick={() => void recoverPackage()}
          >
            {busy === "package" ? "正在读取…" : "找回发布包"}
          </Button>
        )}
      </div>
      {packageResult && (
        <div className="publication-package">
          <p className="eyebrow">链上发布包</p>
          <dl>
            <div>
              <dt>合约调用</dt>
              <dd>
                {packageResult.catalogAddress}.{packageResult.functionName}（链{" "}
                {packageResult.chainId}）
              </dd>
            </div>
            <div>
              <dt>链上课程 ID</dt>
              <dd>{packageResult.args[0]}</dd>
            </div>
            <div>
              <dt>价格（原子单位 YD）</dt>
              <dd>{packageResult.args[1]}</dd>
            </div>
            <div>
              <dt>收款钱包</dt>
              <dd>{packageResult.args[2]}</dd>
            </div>
            <div>
              <dt>提交哈希</dt>
              <dd>{packageResult.args[3]}</dd>
            </div>
          </dl>
          <p className="fine-print">
            该发布包是授权运营者交易的部署输入，管理控制台本身不会对它签名或发送。
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        核对清单仅作为审核者的自律约束，API 在接受决定前会重新校验所有条件。
      </p>
    </div>
  );
}

function CommentModerationQueue({ api }: { api: UniversityApi }) {
  const queue = useQuery({
    queryKey: ["comment-review-queue"],
    queryFn: () => api.commentReviewQueue(),
  });
  return (
    <Card>
      <h2>评论审核</h2>
      {queue.isLoading ? (
        <p className="muted">正在加载评论…</p>
      ) : queue.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(queue.error)}
        </p>
      ) : !queue.data?.length ? (
        <p className="muted">目前还没有任何评论。</p>
      ) : (
        queue.data.map((item) => <CommentModerationRow key={item.id} api={api} item={item} />)
      )}
      <p className="fine-print">隐藏或恢复评论时，服务端会记录操作的管理员账号与原因。</p>
    </Card>
  );
}

function CommentModerationRow({ api, item }: { api: UniversityApi; item: ApiCommentQueueItem }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = item.hidden ? "恢复" : "隐藏";

  async function moderate() {
    if (reason.trim().length < 3) {
      setError("请填写至少 3 个字符的审核原因。");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.moderateComment(item.courseId, item.id, !item.hidden, reason.trim());
      await queryClient.invalidateQueries({ queryKey: ["comment-review-queue"] });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-review-item">
      <div className="row spread">
        <div>
          <p className="eyebrow">
            {item.parentId ? "回复" : "评论"} · {item.courseTitle}
          </p>
          <p className="comment-body">{item.body}</p>
          <small className="muted">
            作者 {item.authorId.slice(0, 6)}… · 发布于 {formatZhDateTime(item.createdAt)}
            {item.hidden && ` · 由 ${item.moderatedBy ?? "未知"} 隐藏：${item.moderationReason}`}
          </small>
        </div>
        <Status tone={item.hidden ? "error" : "neutral"}>{item.hidden ? "已隐藏" : "可见"}</Status>
      </div>
      <div className="comment-new">
        <label className="field" htmlFor={`moderate-${item.id}`}>
          <span>审核原因</span>
          <textarea
            id={`moderate-${item.id}`}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="为什么要隐藏或恢复这条评论？"
          />
        </label>
        <div className="button-row">
          <Button
            type="button"
            disabled={busy}
            className={item.hidden ? "secondary" : undefined}
            onClick={() => void moderate()}
          >
            {busy ? `${action}…` : action}
          </Button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function formatYD(rawAtomic: string): string {
  try {
    const atomic = BigInt(rawAtomic);
    const whole = atomic / 10n ** 18n;
    const fraction = (atomic % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction.slice(0, 4)}` : whole.toString();
  } catch {
    return rawAtomic;
  }
}
