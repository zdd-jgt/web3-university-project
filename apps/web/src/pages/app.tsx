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
          <span className="muted">{course.lessons} 节课</span>
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
      <PageIntro eyebrow="未找到" title="该课程不存在。">
        该链接未对应任何已知课程，也未选择兜底课程。
      </PageIntro>
      <Link className="button" to="/courses">
        返回课程目录
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
          <p className="eyebrow">链上学习，以人为本</p>
          <h1>
            学习那些
            <br />
            <em>你可以亲自验证的系统。</em>
          </h1>
          <p className="lede">
            结构化的 Web3 教学、Sepolia 测试资产与不可转让的证书——不把风险藏在钱包按钮背后。
          </p>
          <div className="button-row">
            <Link className="button" to="/courses">
              浏览课程
            </Link>
            <Link className="button secondary" to="/how-it-works">
              工作原理
            </Link>
          </div>
          <p className="supporting">
            <ShieldCheck size={16} /> 仅使用测试网资产，没有任何真实价值。
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbital-card">
            <span className="orbital-dot" />
            证据，而非炒作 <BadgeCheck size={20} />
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
          <h2>1. 获取测试 YD</h2>
          <p>用 SepoliaETH 或 Test USDT 兑换，报价、滑点与截止时间都在确认前可见。</p>
        </Card>
        <Card>
          <span className="feature-icon">
            <LockKeyhole />
          </span>
          <h2>2. 一次购买</h2>
          <p>仅授权与价格完全一致的 YD，再单独提交购买交易。</p>
        </Card>
        <Card>
          <span className="feature-icon">
            <GraduationCap />
          </span>
          <h2>3. 获得证明</h2>
          <p>完成必修课时后，购买钱包将收到不可转让的证书。</p>
        </Card>
      </section>
      <section className="section-heading">
        <div>
          <p className="eyebrow">从这里开始</p>
          <h2>小班课程，明确边界</h2>
        </div>
        <Link to="/courses">浏览全部课程 →</Link>
      </section>
      {api.available && featured.isLoading ? (
        <Card className="empty-state">正在加载已发布课程…</Card>
      ) : api.available && featured.isError ? (
        <Card className="empty-state">线上课程目录暂不可用，且不会用演示内容替代。</Card>
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
      <PageIntro eyebrow="工作原理" title="购买课程不等于授予账户权限。">
        浏览器只引导明确的钱包意图，课程合约始终是售卖状态、价格与所有权的唯一事实来源。
      </PageIntro>
      <section className="timeline">
        <div>
          <b>01</b>
          <h2>连接内嵌钱包或浏览器钱包</h2>
          <p>本 MVP 仅支持桌面浏览器钱包，不提供移动端钱包集成。</p>
        </div>
        <div>
          <b>02</b>
          <h2>使用 Sepolia 测试资产</h2>
          <p>测试资产仅用于学习，没有任何价值。切勿向测试地址发送真实资产。</p>
        </div>
        <div>
          <b>03</b>
          <h2>授权与价格完全一致的金额</h2>
          <p>你只审批展示的标价额度，界面无法代替合约授权。</p>
        </div>
        <div>
          <b>04</b>
          <h2>完成可验证的课时</h2>
          <p>集成配置完成后，进度与证书资格将由 API 和合约核验。</p>
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
  const [level, setLevel] = useState("全部");
  const visible = level === "全部" ? courses : courses.filter((course) => course.level === level);
  const displayedCourses = api.available ? (catalog.data?.map(courseFromApi) ?? []) : visible;
  return (
    <div className="page">
      <PageIntro eyebrow="课程目录" title="动手学习，而不是凭空猜测。">
        每门课程都把概念课时与明确的链上结果结合起来。
      </PageIntro>
      <div className="filter-row">
        <label htmlFor="level-filter">按级别筛选</label>
        <select id="level-filter" value={level} onChange={(event) => setLevel(event.target.value)}>
          <option>全部</option>
          <option>入门</option>
          <option>进阶</option>
          <option>高级</option>
        </select>
        <span aria-live="polite" className="muted">
          {api.available
            ? catalog.isLoading
              ? "正在加载 API 目录…"
              : catalog.isError
                ? "API 目录不可用"
                : `${catalog.data?.length ?? 0} 门 API 课程`
            : `${visible.length} 门演示课程`}
        </span>
      </div>
      {api.available && catalog.isError && (
        <p className="error" role="alert">
          无法加载已配置的 API 目录，演示卡片不会冒充真实数据。
        </p>
      )}
      {api.available && catalog.isLoading ? (
        <Card className="empty-state">正在加载已发布课程索引…</Card>
      ) : displayedCourses.length ? (
        <section className="course-grid">
          {displayedCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </section>
      ) : (
        <Card className="empty-state">
          <BookOpenIcon />
          没有符合该级别的课程，请换一个筛选条件。
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
    return <Card className="empty-state">正在加载已发布课程…</Card>;
  }
  if (api.available && detail.isError) {
    return (
      <div className="page narrow">
        <PageIntro eyebrow="课程不可用" title="无法加载该 API 课程。">
          请检查 API 后重试。真实课程加载失败时不会用演示内容替代。
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
        title: index === 0 ? "入门与安全边界" : `必修课时 ${index + 1}`,
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
        ← 课程目录
      </Link>
      <section className="course-detail-head">
        <div>
          <Status>{course.level}</Status>
          <h1>{course.title}</h1>
          <p className="lede">{course.summary}</p>
          <div className="detail-facts">
            <span>{course.teacher}</span>
            <span>{course.lessons} 节课</span>
            <span>{course.hours}</span>
          </div>
        </div>
        <Card className="purchase-summary">
          <span className="muted">测试网一次性价格</span>
          <strong>{course.price} YD</strong>
          <p>结算时会重新从合约读取售卖状态与价格。</p>
          <Link className="button" to={`/courses/${course.id}/checkout`}>
            购买课程
          </Link>
        </Card>
      </section>
      <section className="detail-grid">
        <Card>
          <h2>{api.available ? "课程概览" : "你将学到什么"}</h2>
          {api.available ? (
            <p>{course.summary}</p>
          ) : (
            <ul className="check-list">
              <li>
                <Check /> 不信任界面声明，直接读取合约状态
              </li>
              <li>
                <Check /> 区分钱包意图与链上授权
              </li>
              <li>
                <Check /> 认清测试网与生产环境的边界
              </li>
            </ul>
          )}
        </Card>
        <Card>
          <h2>课时大纲</h2>
          {lessonOutline.map((lesson) => (
            <div className="lesson-row" key={lesson.id}>
              <span>{String(lesson.position).padStart(2, "0")}</span>
              <div>
                <strong>{lesson.title}</strong>
                <small>
                  {lesson.required ? "必修" : "选修"} ·{" "}
                  {lesson.asset?.kind === "VIDEO" && lesson.asset.durationMs
                    ? `${Math.ceil(lesson.asset.durationMs / 60_000)} 分钟视频`
                    : lesson.asset?.kind === "DOCUMENT"
                      ? "文档"
                      : "待处理"}
                </small>
              </div>
              <LockKeyhole size={16} aria-label="购买后可学" />
            </div>
          ))}
        </Card>
      </section>
      <aside className="notice">
        <PlayCircle size={19} />
        <div>
          <strong>暂无视频预览。</strong>
          <br />
          视频访问仅在购买后通过权益校验开放。
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
    return <Card className="empty-state">正在加载合约绑定的课程…</Card>;
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
    if (!publicClient || !liveCapable) throw new Error("无法进行 Sepolia 真实结算。");
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
      if (!wallet.address || !publicClient) throw new Error("请先连接 Sepolia 钱包。");
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
      if (receipt.status !== "success") throw new Error("授权交易已回滚。");
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20ApprovalAbi,
        functionName: "allowance",
        args: [wallet.address, marketAddress],
      });
      if (allowance < price) throw new Error("已确认的授权额度低于课程价格。");
      dispatch({ type: "APPROVAL_CONFIRMED", amount: approvalKey });
    } catch (error) {
      dispatch({ type: "FAILED", message: walletErrorMessage(error) });
    }
  }

  async function buyCourse() {
    try {
      if (!wallet.address || !publicClient || !state.approvedAmount) {
        throw new Error("请先完成与价格一致的授权确认。");
      }
      const approvedPrice = BigInt(state.approvedAmount);
      const freshPrice = await readFreshPrice();
      if (freshPrice !== approvedPrice) {
        throw new Error("链上价格已变化，请核对并重新授权新价格。");
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
      if (receipt.status !== "success") throw new Error("购买交易已回滚。");
      const purchased = await publicClient.readContract({
        address: marketAddress,
        abi: courseMarketAbi,
        functionName: "hasPurchased",
        args: [wallet.address, course.contractCourseId],
      });
      if (!purchased) throw new Error("回执已上链，但未找到购买状态。");
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
      <PageIntro eyebrow="安全结算" title="先精确授权，再购买。">
        本界面不授予任何权限。真实调用前，集成必须重新读取合约价格与售卖状态。
      </PageIntro>
      <Card className="checkout-card">
        <div className="row spread">
          <span>课程</span>
          <strong>{course.title}</strong>
        </div>
        <div className="row spread">
          <span>网络</span>
          <Status tone="warning">Sepolia 测试网</Status>
        </div>
        <div className="row spread total">
          <span>精确授权与购买价格</span>
          <strong>
            {liveCapable && offer.isLoading ? "正在读取链上数据…" : `${displayedPrice} YD`}
          </strong>
        </div>
        <ol className="stepper">
          <li className={state.phase === "idle" || state.phase === "failed" ? "active" : "done"}>
            <span>1</span>仅授权 <b>{displayedPrice} YD</b>
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
            <span>2</span>购买课程
          </li>
          <li className={state.phase === "complete" ? "active" : ""}>
            <span>3</span>确认入学
          </li>
        </ol>
        {state.error && (
          <div className="inline-error" role="alert">
            <TriangleAlert />
            {state.error}
            <Button type="button" onClick={() => dispatch({ type: "RETRY" })}>
              安全重试
            </Button>
          </div>
        )}
        {state.phase === "complete" ? (
          <div className="success-panel" role="status">
            <BadgeCheck size={28} />
            <div>
              <strong>{runtime.isDemo ? "演示入学已确认" : "链上购买已确认"}</strong>
              <p>
                {runtime.isDemo
                  ? "未发生任何交易。"
                  : "回执与合约状态一致。索引器处理完事件后即可访问课程。"}
              </p>
              <Link to={`/learn/${course.id}`}>开始学习 →</Link>
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
              {state.phase === "approving" ? "正在确认精确授权…" : `授权 ${displayedPrice} YD`}
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
              {state.phase === "purchasing" ? "正在确认购买…" : "购买课程"}
            </Button>
          </div>
        )}
        {runtime.isDemo && state.phase === "approving" && (
          <Button
            className="secondary"
            type="button"
            onClick={() => dispatch({ type: "APPROVAL_CONFIRMED", amount: course.price })}
          >
            标记模拟精确授权已完成
          </Button>
        )}
        {runtime.isDemo && state.phase === "purchasing" && (
          <Button
            className="secondary"
            type="button"
            onClick={() => dispatch({ type: "PURCHASE_CONFIRMED" })}
          >
            标记模拟购买回执已确认
          </Button>
        )}
        {!runtime.isDemo && (!liveCapable || offer.isError) && (
          <p className="error" role="alert">
            {!runtime.hasMarketplace
              ? "必须先配置 CourseCatalog、CourseMarket 和 YDToken 地址。"
              : wallet.blockedReason || "无法从 Sepolia 读取合约报价。"}
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
                授权回执 <ExternalLink size={13} />
              </a>
            )}
            {purchaseHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${purchaseHash}`}
                target="_blank"
                rel="noreferrer"
              >
                购买回执 <ExternalLink size={13} />
              </a>
            )}
          </div>
        )}
        <p className="fine-print">
          {runtime.isDemo
            ? "仅为演示操作——不会产生交易、签名或价值转移。"
            : "钱包请求需要你明确确认。"}
        </p>
      </Card>
    </div>
  );
}

function walletErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (/[一-鿿]/.test(error.message)) return error.message;
    if (error.name === "UserRejectedRequestError" || /user rejected|denied/i.test(error.message)) {
      return "钱包请求已取消，未发送任何后续交易。";
    }
  }
  return "钱包操作未完成。请检查 Sepolia 网络、余额与合约状态后重试。";
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
    return <Card className="empty-state">正在加载受保护的课程数据…</Card>;
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
        title: index === 3 ? "存储与状态" : `第 ${index + 1} 课`,
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
        <p className="eyebrow">你的课程</p>
        <h1>{course.title}</h1>
        <div className="progress-label">
          <span>
            已完成 {completedCount}/{requiredCount}
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
          <Link to={`/courses/${course.id}`}>← 课程概览</Link>
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
              <span>暂无就绪的学习内容</span>
              <small>该课时没有就绪的视频或文档素材，无法开始学习会话。</small>
            </div>
          )
        ) : (
          <div className="video-shell" role="img" aria-label="无视频预览的受保护课时播放器">
            <PlayCircle size={42} />
            <span>受保护的课时播放器</span>
            <small>仅为演示外壳，未加载任何视频。</small>
          </div>
        )}
        <article className="lesson-content">
          <p className="eyebrow">第 {String(activeLessonIndex + 1).padStart(2, "0")} 课</p>
          <h2>{activeLesson?.title ?? "存储与状态"}</h2>
          <p>完成情况仅由服务端记录：视频观看覆盖核验，或成功访问后的文档显式确认。</p>
          <div className="button-row">
            <Button
              className="secondary"
              type="button"
              disabled={activeLessonIndex === 0}
              onClick={() => setActiveLessonIndex((value) => Math.max(0, value - 1))}
            >
              上一课
            </Button>
            <Button
              disabled={api.available || completed >= course.lessons}
              type="button"
              onClick={() => setCompleted((value) => Math.min(course.lessons, value + 1))}
            >
              {api.available
                ? "实时进度来自已验证的学习会话"
                : completed >= course.lessons
                  ? "所有必修课时已完成"
                  : "标记课时完成（演示）"}
            </Button>
          </div>
          {api.available && progress.isError && (
            <p className="error" role="alert">
              {apiErrorMessage(progress.error)}{" "}
              <Button className="secondary" type="button" onClick={() => void progress.refetch()}>
                重试
              </Button>
            </p>
          )}
          {percentage === 100 && (
            <div className="success-panel">
              <BadgeCheck />
              <div>
                <strong>完成记录已提交核验。</strong>
                <p>证书状态在 API 与 Worker 校验完成前保持待处理。</p>
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
      <PageIntro eyebrow="你的仪表盘" title="钱包、学习与凭证。">
        你的链上资产始终由钱包掌控。用户名签名只是展示名请求，不会转移钱包控制权。
      </PageIntro>
      <section className="dashboard-grid">
        <Card>
          <p className="eyebrow">已连接钱包</p>
          <h2>{wallet.address ?? (runtime.isDemo ? profile.address : "未连接")}</h2>
          <p className="muted">
            仅限 Sepolia ·{" "}
            {runtime.isDemo ? profile.testAssets : (wallet.connectorName ?? "无钱包")}
          </p>
          <Button
            className="secondary"
            type="button"
            disabled={!wallet.address}
            onClick={() => wallet.address && void navigator.clipboard.writeText(wallet.address)}
          >
            复制地址
          </Button>
        </Card>
        <Card>
          <p className="eyebrow">测试余额</p>
          <h2>{profile.ydBalance}</h2>
          <p className="muted">测试 YD · 无真实价值</p>
          <Link className="button secondary" to="/swap">
            获取测试 YD
          </Link>
        </Card>
        <Card>
          <p className="eyebrow">证书</p>
          <h2>已获得 1 张</h2>
          <Link to="/certificates/solidity-basics">查看凭证 →</Link>
        </Card>
      </section>
      <section className="detail-grid">
        <Card>
          <h2>设置用户名</h2>
          <Field
            label="展示用户名"
            id="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setProfileStatus("idle");
            }}
            hint="公开展示前需要钱包签名确认。"
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
              ? "钱包确认中…"
              : profileStatus === "saved"
                ? runtime.isDemo
                  ? "签名已记录（演示）"
                  : "用户名已更新"
                : "签署用户名请求"}
          </Button>
          {profileStatus === "saved" && (
            <p className="success-text" role="status">
              {runtime.isDemo
                ? "展示名请求已保存在演示状态中。"
                : "API 已验证并消费该一次性 EIP-712 签名。"}
            </p>
          )}
          {profileStatus === "failed" && (
            <p className="error" role="alert">
              用户名更新未被接受，挑战可能已过期、被取消或无效。
            </p>
          )}
        </Card>
        <Card>
          <h2>购买与进度</h2>
          <div className="purchase-line">
            <div>
              <strong>Solidity 基础</strong>
              <small>已完成 3/12 节必修课时</small>
            </div>
            <Status tone="success">已拥有（演示）</Status>
          </div>
          <div className="purchase-line">
            <div>
              <strong>DeFi 协议模式</strong>
              <small>未购买</small>
            </div>
            <Link to="/courses/defi-patterns">查看课程 →</Link>
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
    return <Card className="empty-state">正在加载证书关联的课程…</Card>;
  }
  if (api.available && detail.isError) return <NotFound />;
  if (!course) return <NotFound />;
  return (
    <div className="page narrow">
      <PageIntro eyebrow="证书" title={course.title}>
        发放给购买钱包的不可转让完成凭证。
      </PageIntro>
      <Card className="certificate">
        <BadgeCheck size={48} />
        <p>{live ? "合约查询对象" : "演示数据对象"}</p>
        <h2>
          {wallet.address
            ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
            : "未连接钱包"}
        </h2>
        <p>
          完成了 <strong>{course.title}</strong>
        </p>
        <dl>
          <div>
            <dt>凭证编号</dt>
            <dd>
              {runtime.isDemo
                ? "#000042（演示）"
                : certificate.isLoading
                  ? "读取中…"
                  : certificate.isError
                    ? "暂不可用"
                    : tokenId && tokenId > 0n
                      ? `#${tokenId}`
                      : "暂无证书"}
            </dd>
          </div>
          <div>
            <dt>钱包</dt>
            <dd>{wallet.address ?? "未连接"}</dd>
          </div>
          <div>
            <dt>网络</dt>
            <dd>Sepolia</dd>
          </div>
          <div>
            <dt>可转让性</dt>
            <dd>不可转让</dd>
          </div>
        </dl>
        <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer">
          查看区块浏览器 <ExternalLink size={15} />
        </a>
        <p className="fine-print">
          {runtime.isDemo
            ? "演示数据，并非链上凭证。"
            : "合约只读结果；回执与 API 状态仍是相互独立的证据。"}
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
      <PageIntro eyebrow="独立演示" title="Chainlink ETH / USD 参考喂价">
        该教学页面与兑换或购买定价无关，绝不能作为 CourseMarket 的价格来源。
      </PageIntro>
      <Card className="oracle-card">
        <div className="row spread">
          <div>
            <p className="eyebrow">ETH / USD</p>
            <h2>
              {runtime.isDemo
                ? "$3,412.18（虚假数据）"
                : oracle.isLoading
                  ? "读取中…"
                  : oracle.isError || price === undefined || decimals === undefined
                    ? "暂不可用"
                    : `$${formatUnits(price, decimals)}`}
            </h2>
            <p className="muted">
              {runtime.isDemo ? "演示快照 · Sepolia 标签" : "ChainlinkPriceOracle 只读结果"}
            </p>
          </div>
          <Status tone="warning">只读</Status>
        </div>
        {oracle.isError && !runtime.isDemo && (
          <p className="error" role="alert">
            预言机适配器未能返回结果。重试也不会生成权威报价。
          </p>
        )}
        <div className="button-row">
          <Button type="button" disabled>
            <RefreshCw size={16} /> {runtime.isDemo ? "仅演示数据" : "只读查询"}
          </Button>
        </div>
        <p className="fine-print">
          只有配置好的 Chainlink 适配器才能读取喂价。该展示与 YD 定价、结算或任何用户资金均无关联。
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
