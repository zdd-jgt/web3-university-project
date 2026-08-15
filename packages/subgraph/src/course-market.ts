import { CoursePurchased } from "../generated/CourseMarket/CourseMarket";
import { CoursePurchase } from "../generated/schema";

export function handleCoursePurchased(event: CoursePurchased): void {
  const purchase = new CoursePurchase(
    `${event.transaction.hash.toHexString()}-${event.logIndex.toString()}`,
  );
  purchase.buyer = event.params.buyer;
  purchase.courseId = event.params.courseId;
  purchase.priceYD = event.params.priceYD;
  purchase.payoutWallet = event.params.payoutWallet;
  purchase.teacherAmount = event.params.teacherAmount;
  purchase.treasury = event.params.treasury;
  purchase.platformAmount = event.params.platformAmount;
  purchase.purchasedAt = event.params.purchasedAt;
  purchase.transactionHash = event.transaction.hash;
  purchase.blockNumber = event.block.number;
  purchase.blockTimestamp = event.block.timestamp;
  purchase.save();
}
