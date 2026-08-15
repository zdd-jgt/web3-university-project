import { formatUnits } from "viem";
import type { ApiCourse, ApiCourseDetail } from "./api";

export type Course = {
  id: string;
  chainId: number | null;
  catalogAddress: `0x${string}` | null;
  contractCourseId: bigint;
  title: string;
  summary: string;
  teacher: string;
  level: "Foundation" | "Intermediate" | "Advanced";
  price: string;
  lessons: number;
  hours: string;
  accent: string;
};

export const courses: Course[] = [
  {
    id: "solidity-basics",
    chainId: 11_155_111,
    catalogAddress: null,
    contractCourseId: 1n,
    title: "Solidity Foundations",
    summary: "Build a mental model for contracts, transactions and storage.",
    teacher: "Maya Chen",
    level: "Foundation",
    price: "50",
    lessons: 12,
    hours: "4h 20m",
    accent: "violet",
  },
  {
    id: "defi-patterns",
    chainId: 11_155_111,
    catalogAddress: null,
    contractCourseId: 2n,
    title: "DeFi Protocol Patterns",
    summary: "Understand swap mechanics, price risk and common protocol invariants.",
    teacher: "Omar Diallo",
    level: "Intermediate",
    price: "75",
    lessons: 16,
    hours: "6h 10m",
    accent: "cyan",
  },
  {
    id: "secure-dapps",
    chainId: 11_155_111,
    catalogAddress: null,
    contractCourseId: 3n,
    title: "Secure DApp Design",
    summary: "Model trust boundaries before connecting a browser to a contract.",
    teacher: "Alice Nguyen",
    level: "Advanced",
    price: "90",
    lessons: 14,
    hours: "5h 35m",
    accent: "pink",
  },
];

export const courseById = (id: string | undefined) => courses.find((course) => course.id === id);

export function courseFromApi(course: ApiCourse | ApiCourseDetail): Course {
  let contractCourseId = 0n;
  let price = "Unavailable";
  try {
    if (course.chainCourseId) contractCourseId = BigInt(course.chainCourseId);
    if (course.priceYD) price = formatUnits(BigInt(course.priceYD), 18);
  } catch {
    // Keep the course visible, but a zero ID prevents the checkout capability from opening.
  }
  const lessons = "lessons" in course ? course.lessons.length : 0;
  return {
    id: course.id,
    chainId: course.chainId,
    catalogAddress: course.catalogAddress,
    contractCourseId,
    title: course.title,
    summary: course.description,
    teacher: course.teacherId,
    level: "Foundation",
    price,
    lessons,
    hours: lessons ? `${lessons} required/optional lessons` : "Self-paced",
    accent: "cyan",
  };
}

export const profile = {
  address: "0x72E4…A91C",
  username: "juno.eth",
  ydBalance: "420.00 YD",
  testAssets: "0.80 SepoliaETH · 310 Test USDT",
};
