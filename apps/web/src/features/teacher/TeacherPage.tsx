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
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
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
    ? `Demo mode: ${runtime.reason}. Teacher forms require a live Privy session and API.`
    : !api.available
      ? "VITE_API_BASE_URL is not configured, so teacher forms cannot call the API."
      : !wallet.authenticated
        ? "Sign in with Privy before using the teacher studio."
        : !wallet.address
          ? "Connect a wallet before using the teacher studio."
          : "";
  return (
    <div className="page">
      <PageIntro eyebrow="TEACHER STUDIO" title="Create coursework with a review boundary.">
        Publishing, price changes and access changes remain admin-reviewed actions. The server
        verifies your teacher role; this page never grants it.
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
        <Card className="empty-state">
          Course management unlocks only after the server grants the TEACHER role.
        </Card>
      ) : (
        <section className="detail-grid">
          <CreateCourseCard api={api} onCreated={refreshCourses} />
          <Card>
            <h2>Your courses</h2>
            {courses.isLoading ? (
              <p className="muted">Loading your courses…</p>
            ) : courses.isError ? (
              <p className="error" role="alert">
                {apiErrorMessage(courses.error)}
              </p>
            ) : !courses.data?.length ? (
              <p className="muted">
                No courses yet. A draft becomes reviewable after every required lesson has a READY
                protected asset.
              </p>
            ) : (
              courses.data.map((course) => (
                <div className="row spread" key={course.id}>
                  <div>
                    <strong>{course.title}</strong>
                    <p className="muted">
                      {course.lessons.length} lessons · updated{" "}
                      {new Date(course.updatedAt).toLocaleString()}
                      {course.requestedPriceYD
                        ? ` · proposed ${formatYD(course.requestedPriceYD)} YD`
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
                      {selectedCourseId === course.id ? "Close editor" : "Manage"}
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
      <h2>Teacher application</h2>
      {applications.isLoading ? (
        <p className="muted">Checking your application history…</p>
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
              {application.status}
            </Status>
          </div>
        ))
      )}
      {isApproved && (
        <p className="success-text" role="status">
          Your teacher status is approved. Draft courses below can be submitted for publication
          review.
        </p>
      )}
      {hasPending && (
        <p className="muted">An application is pending admin review. No resubmission is needed.</p>
      )}
      {showForm && (
        <>
          <label className="field" htmlFor="teacher-statement">
            <span>Teaching statement</span>
            <textarea
              id="teacher-statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              rows={4}
              placeholder="Describe your teaching focus, experience and course plans (at least 20 characters)."
            />
            <small
              className={
                statement.trim().length && statement.trim().length < 20 ? "error" : "muted"
              }
            >
              {statement.trim().length < 20
                ? `${statement.trim().length}/20 minimum characters.`
                : "Admin review is required before course publishing."}
            </small>
          </label>
          <Button
            type="button"
            disabled={phase === "submitting" || statement.trim().length < 20}
            onClick={() => void submit()}
          >
            {phase === "submitting" ? "Submitting…" : "Submit for review"}
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
      <h2>New course draft</h2>
      <Field
        label="Course title"
        id="new-course-title"
        value={title}
        maxLength={160}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="e.g. A practical ERC-20"
      />
      <label className="field" htmlFor="new-course-description">
        <span>Description</span>
        <textarea
          id="new-course-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={5}
          placeholder="What will learners build and verify?"
        />
      </label>
      <Button
        type="button"
        disabled={phase === "saving" || !title.trim() || !description.trim()}
        onClick={() => void create()}
      >
        {phase === "saving" ? "Creating…" : "Create draft"}
      </Button>
      {savedTitle && (
        <p className="success-text" role="status">
          Draft “{savedTitle}” created. Add required lessons and protected assets before submitting.
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
        <h2>Edit draft: {course.title}</h2>
        <DraftMetadataForm api={api} course={course} onChanged={onChanged} />
        <h2>Lessons</h2>
        {course.lessons.length ? (
          course.lessons.map((lesson) => (
            <LessonRow key={lesson.id} api={api} lesson={lesson} onChanged={onChanged} />
          ))
        ) : (
          <p className="muted">No lessons yet. At least one required lesson is mandatory.</p>
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
        label="Title"
        id={`draft-title-${course.id}`}
        value={title}
        maxLength={160}
        onChange={(event) => {
          setTitle(event.target.value);
          setSaved(false);
        }}
      />
      <label className="field" htmlFor={`draft-description-${course.id}`}>
        <span>Description</span>
        <textarea
          id={`draft-description-${course.id}`}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setSaved(false);
          }}
          rows={4}
        />
        <small className="muted">Saving clears any unreviewed publication request fields.</small>
      </label>
      <Button
        type="button"
        className="secondary"
        disabled={phase === "saving" || !dirty || !title.trim() || !description.trim()}
        onClick={() => void save()}
      >
        {phase === "saving" ? "Saving…" : "Save draft changes"}
      </Button>
      {saved && (
        <p className="success-text" role="status">
          Draft saved.
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
          {lesson.required ? "Required" : "Optional"}
          {asset
            ? ` · ${asset.status}${asset.durationMs ? ` · ${Math.ceil(asset.durationMs / 60_000)} min` : ""}${asset.failureCode ? ` · ${asset.failureCode}` : ""}`
            : " · no asset yet"}
        </small>
        {retryError && (
          <small className="error" role="alert">
            {retryError}
          </small>
        )}
      </div>
      {asset ? (
        <div className="row">
          <Status tone={assetStatusTone(asset.status)}>{asset.status}</Status>
          {retryable && (
            <Button className="secondary" type="button" onClick={() => void retry()}>
              Retry processing
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
      setError(
        "Only MP4 video or supported document types (pdf, docx, pptx, xlsx, txt) are accepted.",
      );
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
      if (!put.ok) throw new Error(`Storage upload failed (HTTP ${put.status}).`);
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
        <span>{busy ? phaseLabel(phase) : "Upload lesson asset"}</span>
        <input
          aria-label={`Upload asset for lesson ${lesson.title}`}
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
          Processing started. Status refreshes automatically.
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
  if (phase === "requesting") return "Requesting upload session…";
  if (phase === "uploading") return "Uploading to protected storage…";
  if (phase === "finalizing") return "Confirming upload…";
  return "Working…";
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
        label="New lesson title"
        id={`lesson-title-${course.id}`}
        value={title}
        maxLength={160}
        onChange={(event) => setTitle(event.target.value)}
        hint={`It will be appended as lesson ${position}.`}
      />
      <div>
        <label className="admin-checks" htmlFor={`lesson-required-${course.id}`}>
          <input
            id={`lesson-required-${course.id}`}
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />{" "}
          Required for completion
        </label>
        <Button
          type="button"
          disabled={phase === "saving" || !title.trim()}
          onClick={() => void add()}
        >
          {phase === "saving" ? "Adding…" : "Add lesson"}
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
      <h2>Submit “{course.title}” for publication review</h2>
      {!readyGate && (
        <p className="error" role="alert">
          Every required lesson needs a READY protected asset before submission. Current:{" "}
          {requiredLessons.length === 0
            ? "no required lessons"
            : `${requiredLessons.filter((lesson) => lesson.asset?.status === "READY").length}/${requiredLessons.length} ready`}
          .
        </p>
      )}
      <section className="detail-grid">
        <Field
          label="Proposed price in YD"
          id={`submit-price-${course.id}`}
          value={priceYD}
          inputMode="decimal"
          onChange={(event) => setPriceYD(event.target.value)}
          hint="Decimal string, e.g. 60. Admin review is required before on-chain publication."
          error={
            priceYD && !priceValid
              ? "Enter a positive decimal amount (max 18 decimals)."
              : undefined
          }
        />
        <Field
          label="Teacher payout wallet"
          id={`submit-wallet-${course.id}`}
          value={payoutWallet}
          onChange={(event) => setPayoutWallet(event.target.value)}
          placeholder="0x…"
          hint="Receives the 75% teacher settlement."
          error={payoutWallet && !walletValid ? "Enter a valid 0x Ethereum address." : undefined}
        />
        <Field
          label="Certificate metadata URI"
          id={`submit-uri-${course.id}`}
          value={metadataUri}
          onChange={(event) => setMetadataUri(event.target.value)}
          placeholder="ipfs://…"
          hint="IPFS URI for the SBT metadata. No personal data may be included."
          error={metadataUri.trim() && !uriValid ? "Enter a valid ipfs:// URI." : undefined}
        />
      </section>
      <Button
        type="button"
        disabled={phase === "submitting" || !readyGate || !formValid}
        onClick={() => void submit()}
      >
        {phase === "submitting" ? "Submitting…" : "Submit publication request"}
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fine-print">
        Submission freezes the draft. Only an admin review can approve or return it to draft.
      </p>
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
