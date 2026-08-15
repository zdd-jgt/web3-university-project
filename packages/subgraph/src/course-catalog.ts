import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  CourseConfigured,
  CourseStatusChanged,
} from "../generated/CourseCatalog/CourseCatalog";
import { Course } from "../generated/schema";

const STATUS_UNKNOWN = "UNKNOWN";
const STATUS_PUBLISHED = "PUBLISHED";
const STATUS_DELISTED = "DELISTED";

function statusName(status: i32): string {
  if (status == 1) return STATUS_PUBLISHED;
  if (status == 2) return STATUS_DELISTED;
  return STATUS_UNKNOWN;
}

function getOrCreateCourse(courseId: BigInt, timestamp: BigInt, block: BigInt): Course {
  let course = Course.load(courseId.toString());
  if (course == null) {
    course = new Course(courseId.toString());
    course.courseId = courseId;
    course.priceYD = BigInt.zero();
    course.payoutWallet = new Bytes(20);
    course.metadataHash = new Bytes(32);
    course.version = BigInt.zero();
    course.status = STATUS_UNKNOWN;
  }
  course.updatedAt = timestamp;
  course.updatedBlock = block;
  return course;
}

export function handleCourseConfigured(event: CourseConfigured): void {
  let course = getOrCreateCourse(event.params.courseId, event.block.timestamp, event.block.number);
  course.priceYD = event.params.priceYD;
  course.payoutWallet = event.params.payoutWallet;
  course.metadataHash = event.params.metadataHash;
  course.version = event.params.version;
  course.status = STATUS_PUBLISHED;
  course.save();
}

export function handleCourseStatusChanged(event: CourseStatusChanged): void {
  let course = getOrCreateCourse(event.params.courseId, event.block.timestamp, event.block.number);
  course.status = statusName(event.params.newStatus);
  course.version = event.params.version;
  course.save();
}
