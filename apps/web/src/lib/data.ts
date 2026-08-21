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
  level: "入门" | "进阶" | "高级";
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
    title: "Solidity 基础",
    summary: "建立对合约、交易与存储的心智模型。",
    teacher: "Maya Chen",
    level: "入门",
    price: "50",
    lessons: 12,
    hours: "4 小时 20 分",
    accent: "violet",
  },
  {
    id: "defi-patterns",
    chainId: 11_155_111,
    catalogAddress: null,
    contractCourseId: 2n,
    title: "DeFi 协议模式",
    summary: "理解兑换机制、价格风险与常见协议不变量。",
    teacher: "Omar Diallo",
    level: "进阶",
    price: "75",
    lessons: 16,
    hours: "6 小时 10 分",
    accent: "cyan",
  },
  {
    id: "secure-dapps",
    chainId: 11_155_111,
    catalogAddress: null,
    contractCourseId: 3n,
    title: "安全的 DApp 设计",
    summary: "在浏览器连接合约之前，先厘清信任边界。",
    teacher: "Alice Nguyen",
    level: "高级",
    price: "90",
    lessons: 14,
    hours: "5 小时 35 分",
    accent: "pink",
  },
];

export const courseById = (id: string | undefined) => courses.find((course) => course.id === id);

export function courseFromApi(course: ApiCourse | ApiCourseDetail): Course {
  let contractCourseId = 0n;
  let price = "暂不可用";
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
    level: "入门",
    price,
    lessons,
    hours: lessons ? `${lessons} 节必修/选修课时` : "自主安排进度",
    accent: "cyan",
  };
}

export const profile = {
  address: "0x72E4…A91C",
  username: "juno.eth",
  ydBalance: "420.00 YD",
  testAssets: "0.80 SepoliaETH · 310 Test USDT",
};
