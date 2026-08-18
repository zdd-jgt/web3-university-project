import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  BadgeCheck,
  Check,
  ExternalLink,
  GraduationCap,
  LockKeyhole,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useReducer, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { formatUnits, type Hash } from "viem";
import { usePublicClient, useReadContract, useSignTypedData, useWriteContract } from "wagmi";
import { AppShell, PageIntro, ProfileChip } from "../components/layout";
import { Button, Card, Field, Status } from "../components/ui";
import { AdminPage } from "../features/admin/AdminPage";
import { CommentsSection } from "../features/comments/CommentsSection";
import { DocumentLesson } from "../features/course-content/DocumentLesson";
import { VideoLessonPlayer } from "../features/course-content/VideoLessonPlayer";
import { SwapPage } from "../features/swap/SwapPage";
import { TeacherPage } from "../features/teacher/TeacherPage";
import { type ApiCourseDetail, apiErrorMessage, useUniversityApi } from "../lib/api";
import {
  certificateSbtAbi,
  chainlinkPriceOracleAbi,
  contractAddresses,
  courseCatalogAbi,
  courseMarketAbi,
  erc20ApprovalAbi,
  sepoliaChainId,
} from "../lib/chain";
import { type Course, courseById, courseFromApi, courses, profile } from "../lib/data";
import { initialPurchaseState, purchaseReducer } from "../lib/purchase-machine";
import { runtime, useWalletSession } from "../lib/runtime";

const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

function CourseCard({ course }: { course: Course }) {
  return (
    <article className={`course-card accent-${course.accent}`}>
      <div className="course-art" aria-hidden="true">
        <span>{course.title.slice(0, 1)}</span>
      </div>
      <div className="course-card-body">
        <div className="row spread">
          <Status>{course.level}</Status>
          <span className="muted">{course.lessons} lessons</span>
        </div>
        <h2>
          <Link to={`/courses/${course.id}`}>{course.title}</Link>
        </h2>
        <p>{course.summary}</p>
        <div className="course-meta">
          <span>{course.teacher}</span>
          <span>{course.hours}</span>
          <strong>{course.price} YD</strong>
        </div>
      </div>
    </article>
  );
}

function NotFound() {
  return (
    <div className="page narrow">
      <PageIntro eyebrow="NOT FOUND" title="This course does not exist.">
        The URL was not mapped to a known course. No fallback course has been selected.
      </PageIntro>
      <Link className="button" to="/courses">
        Return to the course catalog
      </Link>
    </div>
  );
}

function Home() {
  const api = useUniversityApi();
  const featured = useQuery({
    queryKey: ["courses", "home"],
    queryFn: () => api.listCourses(),
    enabled: api.available,
  });
  const featuredCourses = api.available ? (featured.data?.map(courseFromApi) ?? []) : courses;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">ON-CHAIN LEARNING, HUMAN-CENTERED</p>
          <h1>
            Learn the systems
            <br />
            <em>you can verify.</em>
          </h1>
          <p className="lede">
            Structured Web3 education, Sepolia test assets, and non-transferable
            certificates—without hiding risk behind a wallet button.
          </p>
          <div className="button-row">
            <Link className="button" to="/courses">
              Explore courses
            </Link>
            <Link className="button secondary" to="/how-it-works">
              How it works
            </Link>
          </div>
          <p className="supporting">
            <ShieldCheck size={16} /> Testnet assets only. They have no monetary value.
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbital-card">
            <span className="orbital-dot" />
            Evidence, not hype <BadgeCheck size={20} />
          </div>
          <div className="token token-yd">YD</div>
          <div className="token token-eth">Ξ</div>
          <div className="orbit-ring" />
        </div>
      </section>
      <section className="section-grid three-up">
        <Card>
          <span className="feature-icon">
            <ArrowDownUp />
          </span>
          <h2>1. Get test YD</h2>
          <p>
            Swap SepoliaETH or Test USDT. Quotes, slippage and deadlines are visible before intent.
          </p>
        </Card>
        <Card>
          <span className="feature-icon">
            <LockKeyhole />
          </span>
          <h2>2. Purchase once</h2>
          <p>Approve only the exact YD price, then submit a separate purchase transaction.</p>
        </Card>
        <Card>
          <span className="feature-icon">
            <GraduationCap />
          </span>
          <h2>3. Earn proof</h2>
          <p>
            Complete required lessons and receive a non-transferable certificate at the purchasing
            wallet.
          </p>
        </Card>
      </section>
      <section className="section-heading">
        <div>
          <p className="eyebrow">START HERE</p>
          <h2>Small courses, explicit boundaries</h2>
        </div>
        <Link to="/courses">Browse all courses →</Link>
      </section>
      {api.available && featured.isLoading ? (
        <Card className="empty-state">Loading published courses…</Card>
      ) : api.available && featured.isError ? (
        <Card className="empty-state">
          The live course catalog is unavailable. Demo links are not substituted.
        </Card>
      ) : (
        <section className="course-grid">
          {featuredCourses.slice(0, 3).map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </section>
      )}
    </>
  );
}

function HowItWorks() {
  return (
    <div className="page">
      <PageIntro eyebrow="HOW IT WORKS" title="A course purchase is not an account permission.">
        The browser guides an explicit wallet intention. The course contracts remain the source of
        truth for sale status, price and ownership.
      </PageIntro>
      <section className="timeline">
        <div>
          <b>01</b>
          <h2>Connect an embedded or browser wallet</h2>
          <p>
            Desktop browser wallets only for this MVP. No mobile-wallet integration is provided.
          </p>
        </div>
        <div>
          <b>02</b>
          <h2>Use Sepolia test assets</h2>
          <p>
            Test assets are for learning and have no value. Never send real assets to a test
            address.
          </p>
        </div>
        <div>
          <b>03</b>
          <h2>Approve the exact course price</h2>
          <p>
            You review an allowance for the displayed price only. The UI cannot authorize a contract
            action.
          </p>
        </div>
        <div>
          <b>04</b>
          <h2>Complete verified lessons</h2>
          <p>
            Progress and certificate entitlement are evaluated by the API and contracts when
            integration is configured.
          </p>
        </div>
      </section>
    </div>
  );
}

export function Courses() {
  const api = useUniversityApi();
  const catalog = useQuery({
    queryKey: ["courses", "api"],
    queryFn: () => api.listCourses(),
    enabled: api.available,
  });
  const [level, setLevel] = useState("All");
  const visible = level === "All" ? courses : courses.filter((course) => course.level === level);
  const displayedCourses = api.available ? (catalog.data?.map(courseFromApi) ?? []) : visible;
  return (
    <div className="page">
      <PageIntro eyebrow="COURSE CATALOG" title="Learn by doing, not by guessing.">
        Every course pairs conceptual lessons with an explicit on-chain outcome.
      </PageIntro>
      <div className="filter-row">
        <label htmlFor="level-filter">Filter by level</label>
        <select id="level-filter" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option>All</option>
          <option>Foundation</option>
          <option>Intermediate</option>
          <option>Advanced</option>
        </select>
        <span aria-live="polite" className="muted">
          {api.available
            ? catalog.isLoading
              ? "Loading API catalog…"
              : catalog.isError
                ? "API catalog unavailable"
                : `${catalog.data?.length ?? 0} API courses`
            : `${visible.length} demo courses`}
        </span>
      </div>
      {api.available && catalog.isError && (
        <p className="error" role="alert">
          The configured API catalog could not be loaded. Demo cards are not presented as live data.
        </p>
      )}
      {api.available && catalog.isLoading ? (
        <Card className="empty-state">Loading the published course index…</Card>
      ) : displayedCourses.length ? (
        <section className="course-grid">
          {displayedCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </section>
      ) : (
        <Card className="empty-state">
          <BookOpenIcon />
          No courses match this level. Choose another filter to recover.
        </Card>
      )}
    </div>
  );
}

function BookOpenIcon() {
  return <GraduationCap aria-hidden="true" />;
}

function CourseDetail() {
  const { id = "solidity-basics" } = useParams();
  const api = useUniversityApi();
  const detail = useQuery({
    queryKey: ["course", id],
    queryFn: () => api.courseDetail(id),
    enabled: api.available,
  });
  if (api.available && detail.isLoading) {
    return <Card className="empty-state">Loading the published course…</Card>;
  }
  if (api.available && detail.isError) {
    return (
      <div className="page narrow">
        <PageIntro eyebrow="COURSE UNAVAILABLE" title="The API course could not be loaded.">
          Retry after checking the API. Demo content is not substituted for a failed live course.
        </PageIntro>
      </div>
    );
  }
  const course = api.available && detail.data ? courseFromApi(detail.data) : courseById(id);
  if (!course) return <NotFound />;
  const lessonOutline = api.available
    ? (detail.data?.lessons ?? [])
    : Array.from({ length: course.lessons }, (_, index) => ({
        id: `demo-${index + 1}`,
        title: index === 0 ? "Orientation and safety boundary" : `Required lesson ${index + 1}`,
        position: index + 1,
        required: true,
        asset: {
          kind: "VIDEO" as const,
          durationMs: (index % 2 ? 24 : 18) * 60_000,
          detectedMimeType: "video/mp4",
          status: "READY" as const,
        },
      }));
  return (
    <div className="page">
      <Link className="back-link" to="/courses">
        ← Course catalog
      </Link>
      <section className="course-detail-head">
        <div>
          <Status>{course.level}</Status>
          <h1>{course.title}</h1>
          <p className="lede">{course.summary}</p>
          <div className="detail-facts">
            <span>{course.teacher}</span>
            <span>{course.lessons} lessons</span>
            <span>{course.hours}</span>
          </div>
        </div>
        <Card className="purchase-summary">
          <span className="muted">One-time testnet price</span>
          <strong>{course.price} YD</strong>
          <p>Sale status and price are re-read from the contract at checkout.</p>
          <Link className="button" to={`/courses/${course.id}/checkout`}>
            Purchase course
          </Link>
        </Card>
      </section>
      <section className="detail-grid">
        <Card>
          <h2>{api.available ? "Course overview" : "What you will learn"}</h2>
          {api.available ? (
            <p>{course.summary}</p>
          ) : (
            <ul className="check-list">
              <li>
                <Check /> Read contract state without trusting UI claims
              </li>
              <li>
                <Check /> Separate wallet intent from on-chain authority
              </li>
              <li>
                <Check /> Recognize testnet and production boundaries
              </li>
            </ul>
          )}
        </Card>
        <Card>
          <h2>Lesson outline</h2>
          {lessonOutline.map((lesson) => (
            <div className="lesson-row" key={lesson.id}>
              <span>{String(lesson.position).padStart(2, "0")}</span>
              <div>
                <strong>{lesson.title}</strong>
                <small>
                  {lesson.required ? "Required" : "Optional"} ·{" "}
                  {lesson.asset?.kind === "VIDEO" && lesson.asset.durationMs
                    ? `${Math.ceil(lesson.asset.durationMs / 60_000)} min video`
                    : lesson.asset?.kind === "DOCUMENT"
                      ? "Document"
                      : "Pending"}
                </small>
              </div>
              <LockKeyhole size={16} aria-label="Available after purchase" />
            </div>
          ))}
        </Card>
      </section>
      <aside className="notice">
        <PlayCircle size={19} />
        <div>
          <strong>No video preview is available.</strong>
          <br />
          Video access is intentionally limited to purchased-course entitlement checks.
        </div>
      </aside>
      <CommentsSection courseId={course.id} teacherId={detail.data?.teacherId} />
    </div>
  );
}

function Checkout() {
  const { id = "solidity-basics" } = useParams();
  const api = useUniversityApi();
  const detail = useQuery({
    queryKey: ["checkout-course", id],
    queryFn: () => api.courseDetail(id),
    enabled: api.available,
  });
  if (api.available && detail.isLoading) {
    return <Card className="empty-state">Loading the contract-bound course…</Card>;
  }
  if (api.available && detail.isError) return <NotFound />;
  const course = api.available && detail.data ? courseFromApi(detail.data) : courseById(id);
  return course ? <CheckoutCourse course={course} /> : <NotFound />;
}

function CheckoutCourse({ course }: { course: NonNullable<ReturnType<typeof courseById>> }) {
  const [state, dispatch] = useReducer(purchaseReducer, initialPurchaseState);
  const [approvalHash, setApprovalHash] = useState<Hash>();
  const [purchaseHash, setPurchaseHash] = useState<Hash>();
  const wallet = useWalletSession();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const catalogAddress = contractAddresses.courseCatalog ?? zeroAddress;
  const marketAddress = contractAddresses.courseMarket ?? zeroAddress;
  const tokenAddress = contractAddresses.ydToken ?? zeroAddress;
  const liveCapable =
    !runtime.isDemo &&
    runtime.hasMarketplace &&
    course.chainId === sepoliaChainId &&
    course.catalogAddress?.toLowerCase() === catalogAddress.toLowerCase() &&
    course.contractCourseId > 0n &&
    wallet.canTransact &&
    Boolean(publicClient);
  const offer = useReadContract({
    address: catalogAddress,
    abi: courseCatalogAbi,
    functionName: "getPurchasableCourse",
    args: [course.contractCourseId],
    query: { enabled: liveCapable },
  });
  const livePrice = offer.data?.[0];
  const displayedPrice = livePrice === undefined ? course.price : formatUnits(livePrice, 18);
  const busy = state.phase === "approving" || state.phase === "purchasing";

  async function readFreshPrice(): Promise<bigint> {
    if (!publicClient || !liveCapable) throw new Error("Live Sepolia checkout is unavailable.");
    const [price] = await publicClient.readContract({
      address: catalogAddress,
      abi: courseCatalogAbi,
      functionName: "getPurchasableCourse",
      args: [course.contractCourseId],
    });
    return price;
  }

  async function approveExact() {
    try {
      if (!wallet.address || !publicClient) throw new Error("Connect a Sepolia wallet first.");
      const price = await readFreshPrice();
      const approvalKey = price.toString();
      dispatch({ type: "START_APPROVAL", amount: approvalKey });
      const hash = await writeContractAsync({
        chainId: sepoliaChainId,
        address: tokenAddress,
        abi: erc20ApprovalAbi,
        functionName: "approve",
        args: [marketAddress, price],
      });
      setApprovalHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The approval transaction reverted.");
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20ApprovalAbi,
        functionName: "allowance",
        args: [wallet.address, marketAddress],
      });
      if (allowance < price) throw new Error("The confirmed allowance is below the course price.");
      dispatch({ type: "APPROVAL_CONFIRMED", amount: approvalKey });
    } catch (error) {
      dispatch({ type: "FAILED", message: walletErrorMessage(error) });
    }
  }

  async function buyCourse() {
    try {
      if (!wallet.address || !publicClient || !state.approvedAmount) {
        throw new Error("An exact confirmed approval is required first.");
      }
      const approvedPrice = BigInt(state.approvedAmount);
      const freshPrice = await readFreshPrice();
      if (freshPrice !== approvedPrice) {
        throw new Error("The on-chain price changed. Review and approve the new exact price.");
      }
      dispatch({ type: "START_PURCHASE", price: state.approvedAmount });
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 5 * 60);
      const hash = await writeContractAsync({
        chainId: sepoliaChainId,
        address: marketAddress,
        abi: courseMarketAbi,
        functionName: "buyCourse",
        args: [course.contractCourseId, freshPrice, deadline],
      });
      setPurchaseHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The purchase transaction reverted.");
      const purchased = await publicClient.readContract({
        address: marketAddress,
        abi: courseMarketAbi,
        functionName: "hasPurchased",
        args: [wallet.address, course.contractCourseId],
      });
      if (!purchased) throw new Error("The receipt was mined but purchase state was not found.");
      await offer.refetch();
      dispatch({ type: "PURCHASE_CONFIRMED" });
    } catch (error) {
      dispatch({ type: "FAILED", message: walletErrorMessage(error) });
    }
  }

  return (
    <div className="page narrow">
      <Link className="back-link" to={`/courses/${course.id}`}>
        ← {course.title}
      </Link>
      <PageIntro eyebrow="SECURE CHECKOUT" title="Approve exactly, then purchase.">
        This UI does not grant permission. Before a live call, the integration must re-read contract
        price and sale state.
      </PageIntro>
      <Card className="checkout-card">
        <div className="row spread">
          <span>Course</span>
          <strong>{course.title}</strong>
        </div>
        <div className="row spread">
          <span>Network</span>
          <Status tone="warning">Sepolia testnet</Status>
        </div>
        <div className="row spread total">
          <span>Exact approval and purchase price</span>
          <strong>
            {liveCapable && offer.isLoading ? "Reading chain…" : `${displayedPrice} YD`}
          </strong>
        </div>
        <ol className="stepper">
          <li className={state.phase === "idle" || state.phase === "failed" ? "active" : "done"}>
            <span>1</span>Approve <b>{displayedPrice} YD only</b>
          </li>
          <li
            className={
              state.phase === "readyToBuy" ||
              state.phase === "purchasing" ||
              state.phase === "complete"
                ? "active"
                : ""
            }
          >
            <span>2</span>Buy course
          </li>
          <li className={state.phase === "complete" ? "active" : ""}>
            <span>3</span>Confirm enrollment
          </li>
        </ol>
        {state.error && (
          <div className="inline-error" role="alert">
            <TriangleAlert />
            {state.error}
            <Button type="button" onClick={() => dispatch({ type: "RETRY" })}>
              Retry safely
            </Button>
          </div>
        )}
        {state.phase === "complete" ? (
          <div className="success-panel" role="status">
            <BadgeCheck size={28} />
            <div>
              <strong>
                {runtime.isDemo ? "Demo enrollment confirmed" : "On-chain purchase confirmed"}
              </strong>
              <p>
                {runtime.isDemo
                  ? "No transaction occurred."
                  : "The receipt and contract state agree. Course access appears after the indexer finalizes the event."}
              </p>
              <Link to={`/learn/${course.id}`}>Start learning →</Link>
            </div>
          </div>
        ) : (
          <div className="button-row">
            <Button
              disabled={
                busy ||
                state.phase === "readyToBuy" ||
                (!runtime.isDemo && (!liveCapable || livePrice === undefined || offer.isError))
              }
              onClick={() =>
                runtime.isDemo
                  ? dispatch({ type: "START_APPROVAL", amount: course.price })
                  : void approveExact()
              }
            >
              {state.phase === "approving"
                ? "Confirming exact approval…"
                : `Approve ${displayedPrice} YD`}
            </Button>
            <Button
              className="secondary"
              disabled={busy || state.phase !== "readyToBuy" || (!runtime.isDemo && !liveCapable)}
              onClick={() =>
                runtime.isDemo
                  ? dispatch({ type: "START_PURCHASE", price: course.price })
                  : void buyCourse()
              }
            >
              {state.phase === "purchasing" ? "Confirming purchase…" : "Buy course"}
            </Button>
          </div>
        )}
        {runtime.isDemo && state.phase === "approving" && (
          <Button
            className="secondary"
            type="button"
            onClick={() => dispatch({ type: "APPROVAL_CONFIRMED", amount: course.price })}
          >
            Mark simulated exact approval confirmed
          </Button>
        )}
        {runtime.isDemo && state.phase === "purchasing" && (
          <Button
            className="secondary"
            type="button"
            onClick={() => dispatch({ type: "PURCHASE_CONFIRMED" })}
          >
            Mark simulated purchase receipt confirmed
          </Button>
        )}
        {!runtime.isDemo && (!liveCapable || offer.isError) && (
          <p className="error" role="alert">
            {!runtime.hasMarketplace
              ? "CourseCatalog, CourseMarket and YDToken addresses must all be configured."
              : wallet.blockedReason || "The contract offer could not be read from Sepolia."}
          </p>
        )}
        {!runtime.isDemo && (approvalHash || purchaseHash) && (
          <div className="fine-print">
            {approvalHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${approvalHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Approval receipt <ExternalLink size={13} />
              </a>
            )}
            {purchaseHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${purchaseHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Purchase receipt <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}
        <p className="fine-print">
          {runtime.isDemo
            ? "Demo action only—no transaction, signature or value transfer occurs."
            : "A wallet request will require explicit user confirmation."}
        </p>
      </Card>
    </div>
  );
}

function walletErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "UserRejectedRequestError" || /user rejected|denied/i.test(error.message)) {
      return "The wallet request was cancelled. No later transaction was sent.";
    }
    if (/price changed/i.test(error.message)) return error.message;
    if (/reverted|allowance|purchase state|unavailable|connect/i.test(error.message)) {
      return error.message;
    }
  }
  return "The wallet operation did not complete. Verify Sepolia, balance and contract status, then retry.";
}

function Learn() {
  const { id = "solidity-basics" } = useParams();
  const api = useUniversityApi();
  const detail = useQuery({
    queryKey: ["learn-course", id],
    queryFn: () => api.courseDetail(id),
    enabled: api.available,
  });
  if (api.available && detail.isLoading) {
    return <Card className="empty-state">Loading protected course metadata…</Card>;
  }
  if (api.available && detail.isError) return <NotFound />;
  const course = api.available && detail.data ? courseFromApi(detail.data) : courseById(id);
  return course ? <LearningCourse course={course} apiCourse={detail.data} /> : <NotFound />;
}

function LearningCourse({ course, apiCourse }: { course: Course; apiCourse?: ApiCourseDetail }) {
  const api = useUniversityApi();
  const queryClient = useQueryClient();
  const [completed, setCompleted] = useState(3);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const activeLesson = apiCourse?.lessons[activeLessonIndex];
  const progress = useQuery({
    queryKey: ["course-progress", course.id],
    queryFn: () => api.courseProgress(course.id),
    enabled: api.available && Boolean(apiCourse),
  });
  const liveCompleted = progress.data?.completedLessons ?? 0;
  const completedCount = api.available ? liveCompleted : completed;
  const requiredCount = api.available
    ? (progress.data?.requiredLessons ?? course.lessons)
    : course.lessons;
  const percentage = api.available
    ? (progress.data?.percentage ?? 0)
    : course.lessons > 0
      ? Math.round((completed / course.lessons) * 100)
      : 0;
  const activeProgress = activeLesson
    ? progress.data?.lessons.find((item) => item.lessonId === activeLesson.id)
    : undefined;
  const activeDetailLesson = apiCourse?.lessons.find((lesson) => lesson.id === activeLesson?.id);

  function refreshProgress() {
    void queryClient.invalidateQueries({ queryKey: ["course-progress", course.id] });
  }
  const liveLessons = apiCourse
    ? apiCourse.lessons
    : Array.from({ length: course.lessons }, (_, index) => ({
        id: `demo-${index + 1}`,
        title: index === 3 ? "Storage and state" : `Lesson ${index + 1}`,
        position: index + 1,
        required: true,
        asset: null,
      }));
  return (
    <div className="learning-layout">
      <aside className="lesson-sidebar">
        <Link className="brand mini" to="/">
          W³
        </Link>
        <p className="eyebrow">YOUR COURSE</p>
        <h1>{course.title}</h1>
        <div className="progress-label">
          <span>
            {completedCount}/{requiredCount} complete
          </span>
          <strong>{percentage}%</strong>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${percentage}%` }} />
        </div>
        {liveLessons.map((lesson, index) => {
          const lessonProgress = api.available
            ? progress.data?.lessons.find((item) => item.lessonId === lesson.id)
            : undefined;
          const done = api.available ? Boolean(lessonProgress?.complete) : index < completed;
          return (
            <button
              className={done ? "lesson-nav done" : "lesson-nav"}
              type="button"
              key={lesson.id}
              onClick={() => setActiveLessonIndex(index)}
            >
              <span>{done ? <Check size={15} /> : String(lesson.position).padStart(2, "0")}</span>{" "}
              {lesson.title}
              {api.available && lessonProgress && !done && (
                <small className="muted"> · {lessonProgress.percentage}%</small>
              )}
            </button>
          );
        })}
      </aside>
      <main className="lesson-main">
        <header className="learn-head">
          <Link to={`/courses/${course.id}`}>← Course overview</Link>
          <ProfileChip />
        </header>
        {api.available && activeLesson ? (
          activeProgress?.contentKind === "DOCUMENT" ||
          activeDetailLesson?.asset?.kind === "DOCUMENT" ? (
            <DocumentLesson
              key={activeLesson.id}
              api={api}
              lessonId={activeLesson.id}
              fileName={activeLesson.title}
              mimeType={activeDetailLesson?.asset?.detectedMimeType ?? null}
              complete={Boolean(activeProgress?.complete)}
              onProgressChanged={refreshProgress}
            />
          ) : activeProgress?.contentKind === "VIDEO" ||
            activeDetailLesson?.asset?.kind === "VIDEO" ? (
            <VideoLessonPlayer
              key={activeLesson.id}
              api={api}
              lessonId={activeLesson.id}
              complete={Boolean(activeProgress?.complete)}
              onProgressChanged={refreshProgress}
            />
          ) : (
            <div className="video-shell">
              <PlayCircle size={42} />
              <span>No ready learning content</span>
              <small>
                This lesson has no READY video or document asset, so no learning session can start.
              </small>
            </div>
          )
        ) : (
          <div
            className="video-shell"
            role="img"
            aria-label="Protected lesson player shell without a video preview"
          >
            <PlayCircle size={42} />
            <span>Protected lesson player</span>
            <small>Demo shell only; no video is loaded.</small>
          </div>
        )}
        <article className="lesson-content">
          <p className="eyebrow">LESSON {String(activeLessonIndex + 1).padStart(2, "0")}</p>
          <h2>{activeLesson?.title ?? "Storage and state"}</h2>
          <p>
            Completion is recorded server-side only: verified video coverage or an explicit document
            confirmation after successful access.
          </p>
          <div className="button-row">
            <Button
              className="secondary"
              type="button"
              disabled={activeLessonIndex === 0}
              onClick={() => setActiveLessonIndex((value) => Math.max(0, value - 1))}
            >
              Previous lesson
            </Button>
            <Button
              disabled={api.available || completed >= course.lessons}
              type="button"
              onClick={() => setCompleted((value) => Math.min(course.lessons, value + 1))}
            >
              {api.available
                ? "Live progress syncs from verified sessions"
                : completed >= course.lessons
                  ? "All required lessons complete"
                  : "Mark lesson complete (demo)"}
            </Button>
          </div>
          {api.available && progress.isError && (
            <p className="error" role="alert">
              {apiErrorMessage(progress.error)}{" "}
              <Button className="secondary" type="button" onClick={() => void progress.refetch()}>
                Retry
              </Button>
            </p>
          )}
          {percentage === 100 && (
            <div className="success-panel">
              <BadgeCheck />
              <div>
                <strong>Completion submitted for verification.</strong>
                <p>Certificate status stays pending until API and worker checks finish.</p>
              </div>
            </div>
          )}
        </article>
      </main>
    </div>
  );
}

function Profile() {
  const api = useUniversityApi();
  const wallet = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();
  const [username, setUsername] = useState(runtime.isDemo ? profile.username : "");
  const [profileStatus, setProfileStatus] = useState<"idle" | "signing" | "saved" | "failed">(
    "idle",
  );

  async function saveUsername() {
    if (runtime.isDemo) {
      setProfileStatus("saved");
      return;
    }
    try {
      setProfileStatus("signing");
      const challenge = await api.profileChallenge(username.trim());
      const signature = await signTypedDataAsync({
        ...challenge.typedData,
        message: {
          ...challenge.typedData.message,
          expiresAt: BigInt(challenge.typedData.message.expiresAt),
        },
      });
      await api.confirmProfile(username.trim(), challenge.nonce, signature);
      setProfileStatus("saved");
    } catch {
      setProfileStatus("failed");
    }
  }

  return (
    <div className="page">
      <PageIntro eyebrow="YOUR DASHBOARD" title="Wallet, learning and credentials.">
        Your on-chain assets remain tied to your wallet. A username signature is a display-name
        request, not a transfer of wallet control.
      </PageIntro>
      <section className="dashboard-grid">
        <Card>
          <p className="eyebrow">CONNECTED WALLET</p>
          <h2>{wallet.address ?? (runtime.isDemo ? profile.address : "Not connected")}</h2>
          <p className="muted">
            Sepolia only ·{" "}
            {runtime.isDemo ? profile.testAssets : (wallet.connectorName ?? "No wallet")}
          </p>
          <Button
            className="secondary"
            type="button"
            disabled={!wallet.address}
            onClick={() => wallet.address && void navigator.clipboard.writeText(wallet.address)}
          >
            Copy address
          </Button>
        </Card>
        <Card>
          <p className="eyebrow">TEST BALANCE</p>
          <h2>{profile.ydBalance}</h2>
          <p className="muted">Test YD · no monetary value</p>
          <Link className="button secondary" to="/swap">
            Get test YD
          </Link>
        </Card>
        <Card>
          <p className="eyebrow">CERTIFICATES</p>
          <h2>1 earned</h2>
          <Link to="/certificates/solidity-basics">View credential →</Link>
        </Card>
      </section>
      <section className="detail-grid">
        <Card>
          <h2>Set a username</h2>
          <Field
            label="Display username"
            id="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setProfileStatus("idle");
            }}
            hint="A wallet signature is required before this can be shown publicly."
          />
          <Button
            type="button"
            disabled={
              !username.trim() ||
              profileStatus === "signing" ||
              profileStatus === "saved" ||
              (!runtime.isDemo && (!api.available || !wallet.canTransact))
            }
            onClick={() => void saveUsername()}
          >
            {profileStatus === "signing"
              ? "Confirm in wallet…"
              : profileStatus === "saved"
                ? runtime.isDemo
                  ? "Signature recorded (demo)"
                  : "Username updated"
                : "Sign username request"}
          </Button>
          {profileStatus === "saved" && (
            <p className="success-text" role="status">
              {runtime.isDemo
                ? "Display-name request stored in demo state."
                : "The API verified and consumed the one-time EIP-712 signature."}
            </p>
          )}
          {profileStatus === "failed" && (
            <p className="error" role="alert">
              Username update was not accepted. The challenge may be expired, cancelled or invalid.
            </p>
          )}
        </Card>
        <Card>
          <h2>Purchases and progress</h2>
          <div className="purchase-line">
            <div>
              <strong>Solidity Foundations</strong>
              <small>3/12 required lessons complete</small>
            </div>
            <Status tone="success">Owned (demo)</Status>
          </div>
          <div className="purchase-line">
            <div>
              <strong>DeFi Protocol Patterns</strong>
              <small>Not purchased</small>
            </div>
            <Link to="/courses/defi-patterns">View course →</Link>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Certificate() {
  const { id = "solidity-basics" } = useParams();
  const api = useUniversityApi();
  const wallet = useWalletSession();
  const detail = useQuery({
    queryKey: ["certificate-course", id],
    queryFn: () => api.courseDetail(id),
    enabled: api.available,
  });
  const course = api.available && detail.data ? courseFromApi(detail.data) : courseById(id);
  const chainCourseId = course?.contractCourseId ?? 0n;
  const certificateAddress =
    contractAddresses.certificate ?? "0x0000000000000000000000000000000000000000";
  const live =
    !runtime.isDemo &&
    Boolean(wallet.address && contractAddresses.certificate) &&
    course?.chainId === sepoliaChainId &&
    course?.catalogAddress?.toLowerCase() === contractAddresses.courseCatalog?.toLowerCase() &&
    chainCourseId > 0n;
  const certificate = useReadContract({
    address: certificateAddress,
    abi: certificateSbtAbi,
    functionName: "certificateOf",
    args: [wallet.address ?? "0x0000000000000000000000000000000000000000", chainCourseId],
    query: { enabled: live },
  });
  const tokenId = certificate.data;
  if (api.available && detail.isLoading) {
    return <Card className="empty-state">Loading the certificate-bound course…</Card>;
  }
  if (api.available && detail.isError) return <NotFound />;
  if (!course) return <NotFound />;
  return (
    <div className="page narrow">
      <PageIntro eyebrow="CERTIFICATE" title={course.title}>
        A non-transferable completion credential for the purchasing wallet.
      </PageIntro>
      <Card className="certificate">
        <BadgeCheck size={48} />
        <p>{live ? "Contract lookup for" : "Demo metadata for"}</p>
        <h2>
          {wallet.address
            ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
            : "No connected wallet"}
        </h2>
        <p>
          completed <strong>{course.title}</strong>
        </p>
        <dl>
          <div>
            <dt>Credential ID</dt>
            <dd>
              {runtime.isDemo
                ? "#000042 (demo)"
                : certificate.isLoading
                  ? "Reading…"
                  : certificate.isError
                    ? "Unavailable"
                    : tokenId && tokenId > 0n
                      ? `#${tokenId}`
                      : "No certificate"}
            </dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>{wallet.address ?? "Not connected"}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>Sepolia</dd>
          </div>
          <div>
            <dt>Transferability</dt>
            <dd>Non-transferable</dd>
          </div>
        </dl>
        <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">
          View transaction explorer <ExternalLink size={15} />
        </a>
        <p className="fine-print">
          {runtime.isDemo
            ? "Fake demo metadata; it is not an on-chain credential."
            : "Read-only contract result. A receipt and API status remain separate evidence."}
        </p>
      </Card>
    </div>
  );
}

function OracleDemo() {
  const oracleAddress =
    contractAddresses.chainlinkPriceOracle ?? "0x0000000000000000000000000000000000000000";
  const live = !runtime.isDemo && Boolean(contractAddresses.chainlinkPriceOracle);
  const oracle = useReadContract({
    address: oracleAddress,
    abi: chainlinkPriceOracleAbi,
    functionName: "latestPrice",
    query: { enabled: live },
  });
  const price = oracle.data?.[0];
  const decimals = oracle.data?.[1];
  return (
    <div className="page narrow">
      <PageIntro eyebrow="ISOLATED DEMO" title="Chainlink ETH / USD reference feed">
        This educational screen is not connected to swap or purchase pricing. It must never be
        treated as the CourseMarket price source.
      </PageIntro>
      <Card className="oracle-card">
        <div className="row spread">
          <div>
            <p className="eyebrow">ETH / USD</p>
            <h2>
              {runtime.isDemo
                ? "$3,412.18 (fake)"
                : oracle.isLoading
                  ? "Reading…"
                  : oracle.isError || price === undefined || decimals === undefined
                    ? "Unavailable"
                    : `$${formatUnits(price, decimals)}`}
            </h2>
            <p className="muted">
              {runtime.isDemo
                ? "Fake demo snapshot · Sepolia label"
                : "Read-only ChainlinkPriceOracle result"}
            </p>
          </div>
          <Status tone="warning">Read only</Status>
        </div>
        {oracle.isError && !runtime.isDemo && (
          <p className="error" role="alert">
            The oracle adapter could not return an answer. Retry does not substitute an
            authoritative quote.
          </p>
        )}
        <div className="button-row">
          <Button type="button" disabled>
            <RefreshCw size={16} /> {runtime.isDemo ? "Fake data only" : "Read-only query"}
          </Button>
        </div>
        <p className="fine-print">
          Only a configured Chainlink adapter may read a feed. This display has no connection to YD
          pricing, settlement or any user funds.
        </p>
      </Card>
    </div>
  );
}

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/courses/:id" element={<CourseDetail />} />
        <Route path="/courses/:id/checkout" element={<Checkout />} />
        <Route path="/swap" element={<SwapPage />} />
        <Route path="/learn/:id" element={<Learn />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/teacher" element={<TeacherPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/certificates/:id" element={<Certificate />} />
        <Route path="/oracle-demo" element={<OracleDemo />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
