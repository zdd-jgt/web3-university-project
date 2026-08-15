import { courseById } from "./data";

export type AdapterMode = "demo" | "unavailable" | "live";

export type CourseOffer = {
  courseId: string;
  priceYD: string;
  saleActive: boolean;
  source: "demo" | "contract";
};

/**
 * Adapter boundary: pages ask for a course offer, while a future integration owns
 * RPC calls, receipt waiting and fresh contract reads. No adapter grants authority.
 */
export interface MarketplaceAdapter {
  readonly mode: AdapterMode;
  getCourseOffer(courseId: string): Promise<CourseOffer>;
}

export class DemoMarketplaceAdapter implements MarketplaceAdapter {
  readonly mode = "demo" as const;

  async getCourseOffer(courseId: string): Promise<CourseOffer> {
    const course = courseById(courseId);
    if (!course) throw new Error("Unknown course slug.");
    return { courseId: course.id, priceYD: course.price, saleActive: true, source: "demo" };
  }
}

export class UnavailableMarketplaceAdapter implements MarketplaceAdapter {
  readonly mode = "unavailable" as const;

  async getCourseOffer(): Promise<CourseOffer> {
    throw new Error("A configured CourseMarket adapter is required to read a live offer.");
  }
}
