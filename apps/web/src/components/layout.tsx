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
import { runtime, useWalletSession } from "../lib/runtime";
import { Button, Status } from "./ui";

const navItems = [
  ["Courses", "/courses", BookOpen],
  ["Learn", "/learn/solidity-basics", GraduationCap],
  ["Swap", "/swap", WalletCards],
  ["Dashboard", "/profile", LayoutDashboard],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const wallet = useWalletSession();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Web3 University home">
          <span className="brand-mark">W³</span>
          <span>Web3 University</span>
        </Link>
        <nav aria-label="Primary navigation">
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
            ? "Demo only"
            : wallet.address
              ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
              : "Connect wallet"}{" "}
          <ChevronRight size={16} />
        </Button>
      </header>
      {runtime.isDemo && (
        <aside className="demo-banner" aria-label="Demo mode notice">
          <ShieldAlert size={17} />
          <span>
            <strong>Demo mode.</strong> {runtime.reason}. Wallet actions are simulated and have no
            value.
          </span>
          <Status tone="warning">Sepolia only</Status>
        </aside>
      )}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer>
        <span>Web3 University · learn on testnet</span>
        <span>Never share a seed phrase or private key.</span>
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
      {wallet.address
        ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
        : "Wallet status"}
    </Link>
  );
}
