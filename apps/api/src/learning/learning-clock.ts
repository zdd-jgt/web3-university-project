export interface LearningClock {
  now(): Date;
}

export const LEARNING_CLOCK = Symbol("LEARNING_CLOCK");

export const systemLearningClock: LearningClock = { now: () => new Date() };
