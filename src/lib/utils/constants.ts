// Confirmation code character set (ambiguous chars removed)
export const CONFIRMATION_CODE_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CONFIRMATION_CODE_CHARSET = CONFIRMATION_CODE_CHARS;
export const CONFIRMATION_CODE_LENGTH = 6;

// Registration constraints
export const MAX_GROUPS = 4;
export const MAX_ROOM_GROUPS_PER_REGISTRATION = MAX_GROUPS;
export const MAX_PARTICIPANTS_PER_GROUP = 6;
export const MAX_ADULTS_PER_GROUP = 4;
export const MAX_K12_PER_GROUP = 6;
export const MAX_INFANTS_PER_GROUP = 5;
export const MIN_KEY_DEPOSIT = 1;
export const MAX_KEY_DEPOSIT = 2;

// Age classification (based on event start date)
export const ADULT_AGE_THRESHOLD = 18;
export const INFANT_AGE_THRESHOLD = 4;
export const VBS_MIN_AGE = 4;
export const VBS_MAX_AGE = 8;

// Grades
export const GRADES = [
  "PRE_K",
  "KINDERGARTEN",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
  "GRADE_12",
] as const;

export const GRADE_LABELS: Record<string, { en: string; ko: string }> = {
  PRE_K: { en: "Pre-K", ko: "유아반" },
  KINDERGARTEN: { en: "Kindergarten", ko: "유치원" },
  GRADE_1: { en: "1st Grade", ko: "1학년" },
  GRADE_2: { en: "2nd Grade", ko: "2학년" },
  GRADE_3: { en: "3rd Grade", ko: "3학년" },
  GRADE_4: { en: "4th Grade", ko: "4학년" },
  GRADE_5: { en: "5th Grade", ko: "5학년" },
  GRADE_6: { en: "6th Grade", ko: "6학년" },
  GRADE_7: { en: "7th Grade", ko: "7학년" },
  GRADE_8: { en: "8th Grade", ko: "8학년" },
  GRADE_9: { en: "9th Grade", ko: "9학년" },
  GRADE_10: { en: "10th Grade", ko: "10학년" },
  GRADE_11: { en: "11th Grade", ko: "11학년" },
  GRADE_12: { en: "12th Grade", ko: "12학년" },
};
