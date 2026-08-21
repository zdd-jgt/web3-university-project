import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TriangleAlert, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { PageIntro } from "../../components/layout";
import { Button, Card, Field, Status } from "../../components/ui";
import {
  type ApiCourseStatus,
  type ApiTeacherCourse,
  type ApiTeacherLesson,
  apiErrorMessage,
  type LessonAssetStatus,
  type UniversityApi,
  useUniversityApi,
} from "../../lib/api";
import { assetFailureLabel, formatZhDateTime } from "../../lib/localization";
import { runtime, useWalletSession } from "../../lib/runtime";

const PRICE_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const IPFS_URI_PATTERN =
  /^ipfs:\/\/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?$/;

const DOCUMENT_MIME_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["text/plain", ".txt"],
]);

const COURSE_STATUS_LABEL: Record<ApiCourseStatus, string> = {
  DRAFT: "草稿",
  PENDING_REVIEW: "待审核",
  APPROVED: "已批准",
  PUBLISHED: "已发布",
  ARCHIVED: "已归档",
};

const ASSET_STATUS_LABEL: Record<LessonAssetStatus, string> = {
  UPLOADING: "上传中",
  PROCESSING: "处理中",
  READY: "就绪",
  FAILED: "失败",
};

const APPLICATION_STATUS_LABEL: Record<"PENDING" | "APPROVED" | "REJECTED", string> = {
  PENDING: "待审核",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
};

function courseStatusTone(status: ApiCourseStatus): "neutral" | "success" | "warning" | "error" {
  if (status === "PUBLISHED") return "success";
  if (status === "PENDING_REVIEW" || status === "APPROVED") return "warning";
  return "neutral";
}

function assetStatusTone(status: LessonAssetStatus): "neutral" | "success" | "warning" | "error" {
  if (status === "READY") return "success";
  if (status === "FAILED") return "error";
  return "warning";
}

export function TeacherPage() {
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
    ? `演示模式：${runtime.reason}。教师表单需要真实的 Privy 会话与 API。`
    : !api.available
      ? "VITE_API_BASE_URL 未配置，教师表单无法调用 API。"
      : !wallet.authenticated
        ? "请先通过 Privy 登录，再使用教师工作台。"
        : !wallet.address
          ? "请先连接钱包，再使用教师工作台。"
          : "";
  return (
    <div className="page">
      <PageIntro eyebrow="教师工作台" title="在审核边界内创建课程内容。">
        发布、改价与访问权限变更仍需管理员审核。服务端会核验你的教师角色，本页面本身不会授予该角色。
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
      ) : (
        <TeacherStudio
          api={api}
          canManageCourses={session.data?.role === "TEACHER" || session.data?.role === "ADMIN"}
        />
      )}
    </div>
  );
}

function TeacherStudio({
  api,
  canManageCourses,
}: {
  api: UniversityApi;
  canManageCourses: boolean;
}) {
  const queryClient = useQueryClient();
  const courses = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => api.myCourses(),
    enabled: canManageCourses,
  });
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const selectedCourse = courses.data?.find((course) => course.id === selectedCourseId);

  function refreshCourses() {
    void queryClient.invalidateQueries({ queryKey: ["my-courses"] });
  }

  return (
    <>
      <ApplicationSection api={api} />
      {!canManageCourses ? (
        <Card className="empty-state">课程管理只有在服务端授予教师角色后才会解锁。</Card>
      ) : (
        <section className="detail-grid">
          <CreateCourseCard api={api} onCreated={refreshCourses} />
          <Card>
            <h2>你的课程</h2>
            {courses.isLoading ? (
              <p className="muted">正在加载你的课程…</p>
            ) : courses.isError ? (
              <p className="error" role="alert">
                {apiErrorMessage(courses.error)}
              </p>
            ) : !courses.data?.length ? (
              <p className="muted">
                还没有课程。当每个必修课时都拥有就绪（READY）的受保护资产后，草稿即可提交审核。
              </p>
            ) : (
              courses.data.map((course) => (
                <div className="row spread" key={course.id}>
                  <div>
                    <strong>{course.title}</strong>
                    <p className="muted">
                      {course.lessons.length} 个课时 · 更新于 {formatZhDateTime(course.updatedAt)}
                      {course.requestedPriceYD
                        ? ` · 申报 ${formatYD(course.requestedPriceYD)} YD`
                        : ""}
                    </p>
                  </div>
                  <Status tone={courseStatusTone(course.status)}>
                    {COURSE_STATUS_LABEL[course.status]}
                  </Status>
                  {course.status === "DRAFT" && (
                    <Button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        setSelectedCourseId((current) => (current === course.id ? null : course.id))
                      }
                    >
                      {selectedCourseId === course.id ? "关闭编辑器" : "管理"}
                    </Button>
                  )}
                </div>
              ))
            )}
          </Card>
        </section>
      )}
      {selectedCourse && selectedCourse.status === "DRAFT" && (
        <DraftEditor api={api} course={selectedCourse} onChanged={refreshCourses} />
      )}
    </>
  );
}

function ApplicationSection({ api }: { api: UniversityApi }) {
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ["teacher-applications", "me"],
    queryFn: () => api.myTeacherApplications(),
  });
  const [statement, setStatement] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const isApproved = applications.data?.some((item) => item.status === "APPROVED");
  const hasPending = applications.data?.some((item) => item.status === "PENDING");
  const showForm = !isApproved && !hasPending;

  async function submit() {
    setError(null);
    setPhase("submitting");
    try {
      await api.applyTeacher(statement.trim());
      setStatement("");
      await queryClient.invalidateQueries({ queryKey: ["teacher-applications", "me"] });
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Card>
      <h2>教师申请</h2>
      {applications.isLoading ? (
        <p className="muted">正在查询你的申请记录…</p>
      ) : (
        applications.data?.map((application) => (
          <div className="row spread" key={application.id}>
            <p className="muted">
              {application.statement.length > 140
                ? `${application.statement.slice(0, 140)}…`
                : application.statement}
            </p>
            <Status
              tone={
                application.status === "APPROVED"
                  ? "success"
                  : application.status === "REJECTED"
                    ? "error"
                    : "warning"
              }
            >
              {APPLICATION_STATUS_LABEL[application.status] ??
                `未知申请状态（${application.status}）`}
            </Status>
          </div>
        ))
      )}
      {isApproved && (
        <p className="success-text" role="status">
          你的教师身份已通过审核，下方的课程草稿可以提交发布审核。
        </p>
      )}
      {hasPending && <p className="muted">已有一份申请正在等待管理员审核，无需重复提交。</p>}
      {showForm && (
        <>
          <label className="field" htmlFor="teacher-statement">
            <span>教学陈述</span>
            <textarea
              id="teacher-statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              rows={4}
              placeholder="请描述你的教学重点、经验与课程规划（至少 20 个字符）。"
            />
            <small
              className={
                statement.trim().length && statement.trim().length < 20 ? "error" : "muted"
              }
            >
              {statement.trim().length < 20
                ? `已输入 ${statement.trim().length}/20 个字符（最少要求）。`
                : "课程发布前需经管理员审核。"}
            </small>
          </label>
          <Button
            type="button"
            disabled={phase === "submitting" || statement.trim().length < 20}
            onClick={() => void submit()}
          >
            {phase === "submitting" ? "正在提交…" : "提交审核"}
          </Button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function CreateCourseCard({ api, onCreated }: { api: UniversityApi; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  async function create() {
    setError(null);
    setSavedTitle(null);
    setPhase("saving");
    try {
      const course = await api.createCourse(title.trim(), description.trim());
      setSavedTitle(course.title);
      setTitle("");
      setDescription("");
      onCreated();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Card>
      <h2>新建课程草稿</h2>
      <Field
        label="课程标题"
        id="new-course-title"
        value={title}
        maxLength={160}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：实战 ERC-20"
      />
      <label className="field" htmlFor="new-course-description">
        <span>课程描述</span>
        <textarea
          id="new-course-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="学员将构建并验证什么？"
        />
      </label>
      <Button
        type="button"
        disabled={phase === "saving" || !title.trim() || !description.trim()}
        onClick={() => void create()}
      >
        {phase === "saving" ? "正在创建…" : "创建草稿"}
      </Button>
      {savedTitle && (
        <p className="success-text" role="status">
          草稿“{savedTitle}”已创建。提交前请添加必修课时与受保护资产。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}

function DraftEditor({
  api,
  course,
  onChanged,
}: {
  api: UniversityApi;
  course: ApiTeacherCourse;
  onChanged: () => void;
}) {
  return (
    <>
      <Card>
        <h2>编辑草稿：{course.title}</h2>
        <DraftMetadataForm api={api} course={course} onChanged={onChanged} />
        <h2>课时列表</h2>
        {course.lessons.length ? (
          course.lessons.map((lesson) => (
            <LessonRow key={lesson.id} api={api} lesson={lesson} onChanged={onChanged} />
          ))
        ) : (
          <p className="muted">还没有课时，至少需要一个必修课时。</p>
        )}
        <AddLessonForm api={api} course={course} onChanged={onChanged} />
      </Card>
      <PublicationForm api={api} course={course} onChanged={onChanged} />
    </>
  );
}

function DraftMetadataForm({
  api,
  course,
  onChanged,
}: {
  api: UniversityApi;
  course: ApiTeacherCourse;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [phase, setPhase] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = title.trim() !== course.title || description.trim() !== course.description;

  async function save() {
    setError(null);
    setSaved(false);
    setPhase("saving");
    try {
      await api.updateCourse(course.id, { title: title.trim(), description: description.trim() });
      setSaved(true);
      onChanged();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <>
      <Field
        label="标题"
        id={`draft-title-${course.id}`}
        value={title}
        maxLength={160}
        onChange={(event) => {
          setTitle(event.target.value);
          setSaved(false);
        }}
      />
      <label className="field" htmlFor={`draft-description-${course.id}`}>
        <span>课程描述</span>
        <textarea
          id={`draft-description-${course.id}`}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setSaved(false);
          }}
          rows={4}
        />
        <small className="muted">保存后会清空尚未审核的发布申请字段。</small>
      </label>
      <Button
        type="button"
        className="secondary"
        disabled={phase === "saving" || !dirty || !title.trim() || !description.trim()}
        onClick={() => void save()}
      >
        {phase === "saving" ? "正在保存…" : "保存草稿修改"}
      </Button>
      {saved && (
        <p className="success-text" role="status">
          草稿已保存。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function LessonRow({
  api,
  lesson,
  onChanged,
}: {
  api: UniversityApi;
  lesson: ApiTeacherLesson;
  onChanged: () => void;
}) {
  const asset = lesson.asset;
  const retryable =
    asset?.status === "FAILED" &&
    asset.failureCode !== null &&
    !asset.failureCode.startsWith("UPLOAD_");
  const [retryError, setRetryError] = useState<string | null>(null);

  async function retry() {
    if (!asset) return;
    setRetryError(null);
    try {
      await api.retryAsset(asset.id);
      onChanged();
    } catch (caught) {
      setRetryError(apiErrorMessage(caught));
    }
  }

  return (
    <div className="lesson-row">
      <span>{String(lesson.position).padStart(2, "0")}</span>
      <div>
        <strong>{lesson.title}</strong>
        <small>
          {lesson.required ? "必修" : "选修"}
          {asset
            ? ` · ${ASSET_STATUS_LABEL[asset.status]}${asset.durationMs ? ` · ${Math.ceil(asset.durationMs / 60_000)} 分钟` : ""}${asset.failureCode ? ` · ${assetFailureLabel(asset.failureCode)}` : ""}`
            : " · 暂无资产"}
        </small>
        {retryError && (
          <small className="error" role="alert">
            {retryError}
          </small>
        )}
      </div>
      {asset ? (
        <div className="row">
          <Status tone={assetStatusTone(asset.status)}>{ASSET_STATUS_LABEL[asset.status]}</Status>
          {retryable && (
            <Button className="secondary" type="button" onClick={() => void retry()}>
              重试处理
            </Button>
          )}
        </div>
      ) : (
        <LessonUpload api={api} lesson={lesson} onChanged={onChanged} />
      )}
    </div>
  );
}

function LessonUpload({
  api,
  lesson,
  onChanged,
}: {
  api: UniversityApi;
  lesson: ApiTeacherLesson;
  onChanged: () => void;
}) {
  const [phase, setPhase] = useState<
    "idle" | "requesting" | "uploading" | "finalizing" | "processing" | "failed"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [trackedAssetId, setTrackedAssetId] = useState<string | null>(null);

  const tracked = useQuery({
    queryKey: ["asset-status", trackedAssetId],
    queryFn: () => api.assetStatus(trackedAssetId as string),
    enabled: Boolean(trackedAssetId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "UPLOADING" || status === "PROCESSING" ? 2_000 : false;
    },
  });
  const trackedStatus = tracked.data?.status;
  useEffect(() => {
    if (trackedStatus === "READY" || trackedStatus === "FAILED") onChanged();
  }, [trackedStatus, onChanged]);

  async function uploadFile(file: File) {
    setError(null);
    const kind =
      file.type === "video/mp4" ? "VIDEO" : DOCUMENT_MIME_TYPES.has(file.type) ? "DOCUMENT" : null;
    if (!kind) {
      setPhase("failed");
      setError("仅接受 MP4 视频或支持的文档类型（pdf、docx、pptx、xlsx、txt）。");
      return;
    }
    try {
      setPhase("requesting");
      const session = await api.createUploadSession(lesson.id, {
        kind,
        fileName: file.name,
        declaredMimeType: file.type,
        sizeBytes: file.size,
      });
      setTrackedAssetId(session.assetId);
      setPhase("uploading");
      const put = await fetch(session.uploadUrl, {
        method: "PUT",
        headers: { ...session.requiredHeaders, "content-type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`存储上传失败（HTTP ${put.status}）。`);
      setPhase("finalizing");
      await api.finalizeAsset(session.assetId);
      setPhase("processing");
      onChanged();
    } catch (caught) {
      setPhase("failed");
      setError(caught instanceof Error ? caught.message : apiErrorMessage(caught));
      onChanged();
    }
  }

  const busy = phase === "requesting" || phase === "uploading" || phase === "finalizing";
  return (
    <div>
      <label className="upload-zone">
        <UploadCloud />
        <span>{busy ? phaseLabel(phase) : "上传课时资产"}</span>
        <input
          aria-label={`为课时 ${lesson.title} 上传资产`}
          type="file"
          accept="video/mp4,.pdf,.docx,.pptx,.xlsx,.txt"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadFile(file);
          }}
        />
      </label>
      {phase === "processing" && (
        <p className="muted" role="status">
          已开始处理，状态会自动刷新。
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

function phaseLabel(phase: string): string {
  if (phase === "requesting") return "正在申请上传会话…";
  if (phase === "uploading") return "正在上传到受保护存储…";
  if (phase === "finalizing") return "正在确认上传…";
  return "处理中…";
}

function AddLessonForm({
  api,
  course,
  onChanged,
}: {
  api: UniversityApi;
  course: ApiTeacherCourse;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [required, setRequired] = useState(true);
  const [phase, setPhase] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const position = course.lessons.length + 1;

  async function add() {
    setError(null);
    setPhase("saving");
    try {
      await api.addLesson(course.id, { title: title.trim(), position, required });
      setTitle("");
      onChanged();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="detail-grid">
      <Field
        label="新课时标题"
        id={`lesson-title-${course.id}`}
        value={title}
        maxLength={160}
        onChange={(event) => setTitle(event.target.value)}
        hint={`将作为第 ${position} 个课时追加。`}
      />
      <div>
        <label className="admin-checks" htmlFor={`lesson-required-${course.id}`}>
          <input
            id={`lesson-required-${course.id}`}
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />{" "}
          完成课程所需
        </label>
        <Button
          type="button"
          disabled={phase === "saving" || !title.trim()}
          onClick={() => void add()}
        >
          {phase === "saving" ? "正在添加…" : "添加课时"}
        </Button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PublicationForm({
  api,
  course,
  onChanged,
}: {
  api: UniversityApi;
  course: ApiTeacherCourse;
  onChanged: () => void;
}) {
  const [priceYD, setPriceYD] = useState("");
  const [payoutWallet, setPayoutWallet] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const requiredLessons = course.lessons.filter((lesson) => lesson.required);
  const readyGate =
    requiredLessons.length > 0 &&
    requiredLessons.every((lesson) => lesson.asset?.status === "READY");
  const priceValid = PRICE_PATTERN.test(priceYD) && Number(priceYD) > 0;
  const walletValid = ADDRESS_PATTERN.test(payoutWallet);
  const uriValid = IPFS_URI_PATTERN.test(metadataUri.trim());
  const formValid = priceValid && walletValid && uriValid;

  async function submit() {
    setError(null);
    setPhase("submitting");
    try {
      await api.submitCourse(course.id, {
        priceYD,
        payoutWallet,
        certificateMetadataUri: metadataUri.trim(),
      });
      onChanged();
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setPhase("idle");
    }
  }

  return (
    <Card>
      <h2>提交“{course.title}”进入发布审核</h2>
      {!readyGate && (
        <p className="error" role="alert">
          提交前，每个必修课时都需要就绪（READY）的受保护资产。当前：{" "}
          {requiredLessons.length === 0
            ? "没有必修课时"
            : `${requiredLessons.filter((lesson) => lesson.asset?.status === "READY").length}/${requiredLessons.length} 个已就绪`}
          。
        </p>
      )}
      <section className="detail-grid">
        <Field
          label="申报价格（YD）"
          id={`submit-price-${course.id}`}
          value={priceYD}
          inputMode="decimal"
          onChange={(event) => setPriceYD(event.target.value)}
          hint="十进制数字，例如 60。链上发布前需经管理员审核。"
          error={priceYD && !priceValid ? "请输入正数金额（最多 18 位小数）。" : undefined}
        />
        <Field
          label="教师收款钱包"
          id={`submit-wallet-${course.id}`}
          value={payoutWallet}
          onChange={(event) => setPayoutWallet(event.target.value)}
          placeholder="0x…"
          hint="接收 75% 的教师分成。"
          error={payoutWallet && !walletValid ? "请输入有效的 0x 以太坊地址。" : undefined}
        />
        <Field
          label="证书元数据 URI"
          id={`submit-uri-${course.id}`}
          value={metadataUri}
          onChange={(event) => setMetadataUri(event.target.value)}
          placeholder="ipfs://…"
          hint="SBT 元数据的 IPFS URI，不得包含个人数据。"
          error={metadataUri.trim() && !uriValid ? "请输入有效的 ipfs:// URI。" : undefined}
        />
      </section>
      <Button
        type="button"
        disabled={phase === "submitting" || !readyGate || !formValid}
        onClick={() => void submit()}
      >
        {phase === "submitting" ? "正在提交…" : "提交发布申请"}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">提交后草稿将被冻结，只有管理员审核可以批准或将其退回为草稿。</p>
    </Card>
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
