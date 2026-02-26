import { z } from "zod";

// -- Reusable primitives --

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

// -- Participant & Room Group (shared by submit + estimate) --

const mealSelectionSchema = z.object({
  date: dateStr,
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
  selected: z.boolean(),
});

const participantSchema = z.object({
  id: z.string(),
  isRepresentative: z.boolean(),
  isExistingPerson: z.boolean(),
  personId: uuid.optional(),
  lastName: z.string().min(1).max(100),
  firstName: z.string().min(1).max(100),
  displayNameKo: z.string().max(100).optional(),
  gender: z.enum(["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]),
  birthYear: z.number().int().min(1900).max(2100),
  birthMonth: z.number().int().min(1).max(12),
  birthDay: z.number().int().min(1).max(31),
  isK12: z.boolean(),
  grade: z
    .enum([
      "PRE_K", "KINDERGARTEN",
      "GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4",
      "GRADE_5", "GRADE_6", "GRADE_7", "GRADE_8",
      "GRADE_9", "GRADE_10", "GRADE_11", "GRADE_12",
    ])
    .optional(),
  departmentId: uuid.optional(),
  phone: z.string().max(30).default(""),
  phoneCountry: z.string().max(5).default("US"),
  noPhone: z.boolean().optional(),
  email: z.string().max(255).default(""),
  noEmail: z.boolean().optional(),
  churchId: uuid.optional(),
  churchRole: z.enum(["MEMBER", "DEACON", "ELDER", "MINISTER", "PASTOR"]).optional(),
  churchOther: z.string().max(255).optional(),
  mealSelections: z.array(mealSelectionSchema).max(100).default([]),
});

const lodgingPreferencesSchema = z.object({
  elderly: z.boolean(),
  handicapped: z.boolean(),
  firstFloor: z.boolean(),
});

const roomGroupSchema = z.object({
  id: z.string(),
  participants: z.array(participantSchema).min(1).max(20),
  lodgingType: z.string().optional(),
  preferences: lodgingPreferencesSchema,
  keyCount: z.number().int().min(0).max(10),
});

const airportRideSchema = z.object({
  rideId: z.string(),
  selectedParticipantIds: z.array(z.string()),
  flightInfo: z.string().max(500).default(""),
});

const airportPickupSchema = z.object({
  needed: z.boolean(),
  details: z.string().max(1000).optional(),
  selectedRides: z.array(airportRideSchema).max(20).default([]),
});

// -- API Route Schemas --

export const estimateSchema = z.object({
  eventId: uuid,
  startDate: dateStr,
  endDate: dateStr,
  nightsCount: z.number().int().min(0).max(30),
  registrationGroupId: uuid,
  roomGroups: z.array(roomGroupSchema).min(1).max(20),
});

export const submitRegistrationSchema = z.object({
  eventId: uuid,
  startDate: dateStr,
  endDate: dateStr,
  nightsCount: z.number().int().min(0).max(30),
  registrationGroupId: uuid,
  roomGroups: z.array(roomGroupSchema).min(1).max(20),
  keyDeposit: z.number().int().min(0).default(0),
  airportPickup: airportPickupSchema.default({ needed: false, selectedRides: [] }),
});

export const createIntentSchema = z.object({
  registrationId: uuid,
  coversFees: z.boolean().optional(),
});

export const confirmPaymentSchema = z.object({
  registrationId: uuid,
  paymentIntentId: z.string().min(1),
});

export const zelleSubmitSchema = z.object({
  registrationId: uuid,
});

export const emailConfirmationSchema = z.object({
  registrationId: uuid,
});

export const emailInvoiceSchema = z.object({
  invoiceId: uuid,
  email: z.string().email().optional(),
});
