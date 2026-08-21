import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { useState } from "react";
import { Button, Card, Status } from "../../components/ui";
import {
  type ApiCommentThread,
  apiErrorMessage,
  type UniversityApi,
  useUniversityApi,
} from "../../lib/api";
import { formatZhDateTime } from "../../lib/localization";
import { runtime, useWalletSession } from "../../lib/runtime";

export function CommentsSection({ courseId, teacherId }: { courseId: string; teacherId?: string }) {
  const api = useUniversityApi();
  const wallet = useWalletSession();
  const canAct =
    !runtime.isDemo && api.available && wallet.authenticated && Boolean(wallet.address);
  const threads = useQuery({
    queryKey: ["course-comments", courseId],
    queryFn: () => api.comments(courseId),
    enabled: api.available,
  });
  const session = useQuery({
    queryKey: ["session-me"],
    queryFn: () => api.me(),
    enabled: canAct,
  });
  const currentUserId = session.data?.userId;
  const isCourseTeacher = Boolean(currentUserId && teacherId && currentUserId === teacherId);
  const queryClient = useQueryClient();

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["course-comments", courseId] });
  }

  if (!api.available) {
    return (
      <Card className="empty-state">
        <MessageSquareText size={18} aria-hidden="true" /> API 配置完成后，将展示已发布课程的评论。
      </Card>
    );
  }

  return (
    <Card>
      <h2>购买者讨论</h2>
      {threads.isLoading ? (
        <p className="muted">正在加载评论…</p>
      ) : threads.isError ? (
        <p className="error" role="alert">
          {apiErrorMessage(threads.error)}
        </p>
      ) : !threads.data?.length ? (
        <p className="muted">暂无评论。只有经过验证的购买者才能发起讨论。</p>
      ) : (
        threads.data.map((thread) => (
          <CommentThread
            key={thread.id}
            api={api}
            courseId={courseId}
            thread={thread}
            teacherId={teacherId}
            currentUserId={currentUserId}
            canReply={canAct && isCourseTeacher}
            onChanged={refresh}
          />
        ))
      )}
      <NewCommentForm api={api} courseId={courseId} canAct={canAct} onChanged={refresh} />
    </Card>
  );
}

function CommentThread({
  api,
  courseId,
  thread,
  teacherId,
  currentUserId,
  canReply,
  onChanged,
}: {
  api: UniversityApi;
  courseId: string;
  thread: ApiCommentThread;
  teacherId?: string;
  currentUserId?: string;
  canReply: boolean;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendReply() {
    setError(null);
    setPhase("sending");
    try {
      await api.createComment(courseId, replyBody.trim(), thread.id);
      setReplyBody("");
      setReplying(false);
      onChanged();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="comment-thread">
      <div className="comment-meta">
        <strong>{authorLabel(thread.authorId, currentUserId)}</strong>
        {thread.authorId === teacherId && <Status tone="success">教师</Status>}
        <span className="muted">{formatZhDateTime(thread.createdAt)}</span>
      </div>
      <p className="comment-body">{thread.body}</p>
      {thread.replies.map((reply) => (
        <div className="comment-reply" key={reply.id}>
          <div className="comment-meta">
            <strong>{authorLabel(reply.authorId, currentUserId)}</strong>
            {reply.authorId === teacherId && <Status tone="success">教师</Status>}
            <span className="muted">{formatZhDateTime(reply.createdAt)}</span>
          </div>
          <p className="comment-body">{reply.body}</p>
        </div>
      ))}
      {canReply && !replying && (
        <Button className="secondary" type="button" onClick={() => setReplying(true)}>
          以教师身份回复
        </Button>
      )}
      {replying && (
        <div className="comment-reply-form">
          <label className="field" htmlFor={`reply-${thread.id}`}>
            <span>教师回复</span>
            <textarea
              id={`reply-${thread.id}`}
              rows={3}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
            />
          </label>
          <div className="button-row">
            <Button
              type="button"
              disabled={phase === "sending" || !replyBody.trim()}
              onClick={() => void sendReply()}
            >
              {phase === "sending" ? "发送中…" : "发送回复"}
            </Button>
            <Button className="secondary" type="button" onClick={() => setReplying(false)}>
              取消
            </Button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NewCommentForm({
  api,
  courseId,
  canAct,
  onChanged,
}: {
  api: UniversityApi;
  courseId: string;
  canAct: boolean;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  async function submit() {
    setError(null);
    setPosted(false);
    setPhase("sending");
    try {
      await api.createComment(courseId, body.trim());
      setBody("");
      setPosted(true);
      onChanged();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  if (!canAct) {
    return (
      <p className="fine-print">
        {runtime.isDemo
          ? "演示模式：评论功能已禁用。真实评论需要 Privy 会话，服务端会在接受评论前核验购买资格。"
          : "请先登录并连接钱包再评论。服务端会在接受评论前核验购买资格。"}
      </p>
    );
  }

  return (
    <div className="comment-new">
      <label className="field" htmlFor={`new-comment-${courseId}`}>
        <span>添加评论</span>
        <textarea
          id={`new-comment-${courseId}`}
          rows={3}
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setPosted(false);
          }}
          placeholder="对其他购买者可见。服务端将核验你的购买资格。"
        />
      </label>
      <Button
        type="button"
        disabled={phase === "sending" || !body.trim()}
        onClick={() => void submit()}
      >
        {phase === "sending" ? "发布中…" : "发布评论"}
      </Button>
      {posted && (
        <p className="success-text" role="status">
          评论已发布。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function authorLabel(authorId: string, currentUserId?: string): string {
  if (currentUserId && authorId === currentUserId) return "你";
  return `${authorId.slice(0, 6)}…`;
}
