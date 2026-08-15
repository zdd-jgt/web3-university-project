import { Injectable } from "@nestjs/common";
import { Errors } from "../common/app-error";
import { PrismaService } from "../prisma/prisma.service";
@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}
  async mine(userId: string, courseId: string) {
    const completion = await this.prisma.courseCompletion.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { status: true, txHash: true, tokenId: true, updatedAt: true },
    });
    // Do not reveal whether another wallet has completed this course.
    if (!completion) throw Errors.notFound();
    return completion;
  }
}
