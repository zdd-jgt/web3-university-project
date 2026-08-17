import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PageIntro } from "../../components/layout";
import { Button, Card, Status } from "../../components/ui";
import {
  type ApiCommentQueueItem,
  type ApiPublicationPackage,
  type ApiReviewQueueItem,
  apiErrorMessage,
  type TeacherApplication,
  type UniversityApi,
  useUniversityApi,
} from "../../lib/api";
import { runtime, useWalletSession } from "../../lib/runtime";

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
    ? `Demo mode: ${runtime.reason}. Admin review requires a live Privy session and API.`
    : !api.available
      ? "VITE_API_BASE_URL is not configured, so admin review cannot call the API."
      : !wallet.authenticated
        ? "Sign in with Privy before using the admin console."
        : !wallet.address
          ? "Connect a wallet before using the admin console."
          : "";
  return (
    <div className="page">
      <PageIntro
        eyebrow="ADMIN REVIEW"
        title="Review requests; do not assume UI role gates are authorization."
      >
        Every decision below is an authenticated API call. The server rejects requests from
        non-admin accounts, and on-chain publication remains a separate operator action.
      </PageIntro>
      {!canAct ? (
        <Card className="empty-state">
          <TriangleAlert size={18} aria-hidden="true" /> {blockedReason}
        </Card>
      ) : session.isLoading ? (
        <Card className="empty-state">Checking your server role…</Card>
      ) : session.isError ? (
        <Card className="empty-state">
          <TriangleAlert size={18} aria-hidden="true" /> {apiErrorMessage(session.error)}
        </Card>
      ) : session.data?.role !== "ADMIN" ? (
        <Card className="empty-state">
          <TriangleAlert size={18} aria-hidden="true" /> Your account is not authorized for the
          admin console.
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
      <h2>Teacher applications</h2>
      {queue.isLoading ? (
        <p className="muted">Loading pending applications…</p>
      ) : queue.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(queue.error)}
        </p>
      ) : !queue.data?.length ? (
        <p className="muted">No pending teacher applications.</p>
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
              <small className="muted">
                Submitted {new Date(application.createdAt).toLocaleString()}
              </small>
            </div>
            <div className="button-row">
              <Button
                type="button"
                disabled={busyId === application.id}
                onClick={() => void decide(application, true)}
              >
                {busyId === application.id ? "Reviewing…" : "Approve"}
              </Button>
              <Button
                className="secondary"
                type="button"
                disabled={busyId === application.id}
                onClick={() => void decide(application, false)}
              >
                Reject
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
      <p className="fine-print">
        Approval grants the TEACHER role server-side. Rejection is final.
      </p>
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
      <h2>Course publication queue</h2>
      {queue.isLoading ? (
        <p className="muted">Loading review queue…</p>
      ) : queue.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(queue.error)}
        </p>
      ) : !queue.data?.length ? (
        <p className="muted">No submitted courses await review.</p>
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
            {item.status === "PENDING_REVIEW" ? "PUBLISH REQUEST" : "APPROVED · NOT PUBLISHED"}
          </p>
          <h2>{item.title}</h2>
          <p className="muted">
            Teacher: {item.teacherId} · Proposed price: {priceYD ?? "unknown"} YD · Payout:{" "}
            {item.requestedPayoutWallet ?? "unknown"}
          </p>
          <small className="muted">
            Metadata: {item.certificateMetadataUri ?? "unknown"} · Submission hash:{" "}
            {item.submissionHash ? `${item.submissionHash.slice(0, 18)}…` : "unknown"}
          </small>
        </div>
        <Status tone={item.status === "PENDING_REVIEW" ? "warning" : "success"}>
          {item.status}
        </Status>
      </div>
      <div className="admin-checks">
        <label>
          <input type="checkbox" /> Required lessons have protected READY assets
        </label>
        <label>
          <input type="checkbox" /> Sale price, payout wallet and fee disclosure reviewed
        </label>
        <label>
          <input type="checkbox" /> Certificate metadata URI contains no personal data
        </label>
      </div>
      <div className="button-row">
        {item.status === "PENDING_REVIEW" && (
          <>
            <Button type="button" disabled={busy !== null} onClick={() => void decide(true)}>
              {busy === "approve" ? "Approving…" : "Approve submission"}
            </Button>
            <Button
              className="secondary"
              type="button"
              disabled={busy !== null}
              onClick={() => void decide(false)}
            >
              {busy === "reject" ? "Returning…" : "Return to draft"}
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
            {busy === "package" ? "Reading…" : "Recover publication package"}
          </Button>
        )}
      </div>
      {packageResult && (
        <div className="publication-package">
          <p className="eyebrow">ONCHAIN PUBLICATION PACKAGE</p>
          <dl>
            <div>
              <dt>Contract call</dt>
              <dd>
                {packageResult.catalogAddress}.{packageResult.functionName} (chain{" "}
                {packageResult.chainId})
              </dd>
            </div>
            <div>
              <dt>Chain course id</dt>
              <dd>{packageResult.args[0]}</dd>
            </div>
            <div>
              <dt>Price (atomic YD)</dt>
              <dd>{packageResult.args[1]}</dd>
            </div>
            <div>
              <dt>Payout wallet</dt>
              <dd>{packageResult.args[2]}</dd>
            </div>
            <div>
              <dt>Submission hash</dt>
              <dd>{packageResult.args[3]}</dd>
            </div>
          </dl>
          <p className="fine-print">
            This package is deployment input for an authorized operator transaction. The admin
            console never signs or sends it.
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        Checklist boxes are reviewer discipline only. The API re-validates every condition before
        accepting a decision.
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
      <h2>Comment moderation</h2>
      {queue.isLoading ? (
        <p className="muted">Loading comments…</p>
      ) : queue.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(queue.error)}
        </p>
      ) : !queue.data?.length ? (
        <p className="muted">No comments have been posted yet.</p>
      ) : (
        queue.data.map((item) => <CommentModerationRow key={item.id} api={api} item={item} />)
      )}
      <p className="fine-print">
        Hiding or restoring a comment records the admin account and reason server-side.
      </p>
    </Card>
  );
}

function CommentModerationRow({ api, item }: { api: UniversityApi; item: ApiCommentQueueItem }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = item.hidden ? "Restore" : "Hide";

  async function moderate() {
    if (reason.trim().length < 3) {
      setError("A moderation reason of at least 3 characters is required.");
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
            {item.parentId ? "REPLY" : "COMMENT"} · {item.courseTitle}
          </p>
          <p className="comment-body">{item.body}</p>
          <small className="muted">
            Author {item.authorId.slice(0, 6)}… · Posted {new Date(item.createdAt).toLocaleString()}
            {item.hidden &&
              ` · Hidden by ${item.moderatedBy ?? "unknown"}: ${item.moderationReason}`}
          </small>
        </div>
        <Status tone={item.hidden ? "error" : "neutral"}>
          {item.hidden ? "HIDDEN" : "VISIBLE"}
        </Status>
      </div>
      <div className="comment-new">
        <label className="field" htmlFor={`moderate-${item.id}`}>
          <span>Moderation reason</span>
          <textarea
            id={`moderate-${item.id}`}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this comment being hidden or restored?"
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
