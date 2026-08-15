import { CertificateMinted } from "../generated/CertificateSBT/CertificateSBT";
import { Certificate } from "../generated/schema";

export function handleCertificateMinted(event: CertificateMinted): void {
  const certificate = new Certificate(event.params.tokenId.toString());
  certificate.student = event.params.student;
  certificate.courseId = event.params.courseId;
  certificate.tokenId = event.params.tokenId;
  certificate.tokenURI = event.params.tokenURI;
  certificate.transactionHash = event.transaction.hash;
  certificate.blockNumber = event.block.number;
  certificate.blockTimestamp = event.block.timestamp;
  certificate.save();
}
