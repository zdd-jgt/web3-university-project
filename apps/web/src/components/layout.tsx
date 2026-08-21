import {
  BookOpen,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  ShieldAlert,
  UserRound,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { PLATFORM_NAME } from "../lib/localization";
import { runtime, useWalletSession } from "../lib/runtime";
import { Button, Status } from "./ui";

const navItems = [
  ["课程", "/courses", BookOpen],
  ["学习", "/learn/solidity-basics", GraduationCap],
  ["兑换", "/swap", WalletCards],
  ["我的", "/profile", LayoutDashboard],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const wallet = useWalletSession();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主内容
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label={`${PLATFORM_NAME}首页`}>
          <span className="brand-mark">W³</span>
          <span>{PLATFORM_NAME}</span>
        </Link>
        <nav aria-label="主导航">
          {navItems.map(([label, to, Icon]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button
          className="wallet-button"
          type="button"
          onClick={wallet.connect}
          disabled={wallet.mode === "demo"}
        >
          {wallet.mode === "demo"
            ? "仅演示模式"
            : wallet.address
              ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
              : "连接钱包"}{" "}
          <ChevronRight size={16} />
        </Button>
      </header>
      {runtime.isDemo && (
        <aside className="demo-banner" aria-label="演示模式提示">
          <ShieldAlert size={17} />
          <span>
            <strong>演示模式。</strong>
            {runtime.reason}。钱包操作均为模拟，没有任何真实价值。
          </span>
          <Status tone="warning">仅限 Sepolia</Status>
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer>
        <span>{PLATFORM_NAME} · 在测试网上学习</span>
        <span>切勿泄露助记词或私钥。</span>
      </footer>
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{children}</p>
      </div>
      {action}
    </section>
  );
}

export function ProfileChip() {
  const wallet = useWalletSession();
  return (
    <Link className="profile-chip" to="/profile">
      <UserRound size={16} />
      {wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : "钱包状态"}
    </Link>
  );
}
