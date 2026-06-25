import { z } from "zod";
import { isValidCalendarDate } from "@/lib/utils/validators";

// -- Reusable primitives --

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

// -- Participant & Room Group (shared by submit + estimate) --

const mealSelectionSchema = z.object({
  date: dateStr,
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
  selected: z.boolean(),
});

const participantSchema = z
  .object({
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
    checkInDate: dateStr.optional(),
    checkOutDate: dateStr.optional(),
    isDateOverridden: z.boolean().optional(),
    tshirtSize: z.string().max(5).optional(),
    guardianName: z.string().max(200).optional(),
    guardianPhone: z.string().max(30).optional(),
    guardianPhoneCountry: z.string().max(5).optional(),
    guardianConsent: z.boolean().optional(),
    guardianSignature: z.string().max(200000).optional(),
    memberAccessCode: z.string().max(20).optional(),
    memberRegistrationGroupId: uuid.optional(),
    mealSelections: z.array(mealSelectionSchema).max(100).default([]),
  })
  .superRefine((participant, ctx) => {
    if (
      !isValidCalendarDate(
        participant.birthYear,
        participant.birthMonth,
        participant.birthDay
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthDay"],
        message: "Invalid birth date",
      });
    }
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
  registrationType: z.enum(["self", "others"]).default("self"),
  startDate: dateStr,
  endDate: dateStr,
  nightsCount: z.number().int().min(0).max(30),
  registrationGroupId: uuid,
  roomGroups: z.array(roomGroupSchema).min(1).max(20),
  keyDeposit: z.number().int().min(0).default(0),
  airportPickup: airportPickupSchema.default({ needed: false, selectedRides: [] }),
  additionalRequests: z.string().max(2000).optional(),
});

export const createIntentSchema = z.object({
  registrationId: uuid,
  coversFees: z.boolean().optional(),
});

export const confirmPaymentSchema = z.object({
  registrationId: uuid,
  paymentIntentId: z.string().min(1),
});

export const freeSubmitSchema = z.object({
  registrationId: uuid,
});

export const zelleSubmitSchema = z.object({
  registrationId: uuid,
  zellePayerName: z.string().min(1).optional(),
  zellePayerPhone: z.string().min(1).optional(),
  zellePayerEmail: z.string().min(1).optional(),
});

export const emailConfirmationSchema = z.object({
  registrationId: uuid,
});

export const emailInvoiceSchema = z.object({
  invoiceId: uuid,
  email: z.string().email().optional(),
});

// -- Donation --

export const donationCreateIntentSchema = z.object({
  amountCents: z.number().int().min(100).max(1_000_000), // $1 – $10,000
  donorName: z.string().max(200).optional(),
  donorEmail: z.string().email().max(255).optional(),
  coversFees: z.boolean().optional(),
  departmentId: z.string().uuid().optional(),
});

export const donationConfirmSchema = z.object({
  donationId: uuid,
  paymentIntentId: z.string().min(1),
});

// -- Custom payment (public "pay any amount" page) --

export const customPaymentCreateIntentSchema = z.object({
  amountCents: z.number().int().min(100).max(5_000_000), // $1 – $50,000
  payerName: z.string().max(200).optional(),
  payerEmail: z.string().email().max(255).optional(),
  purpose: z.string().max(500).optional(),
  coversFees: z.boolean().optional(),
});

export const customPaymentConfirmSchema = z.object({
  paymentId: uuid,
  paymentIntentId: z.string().min(1),
});

// Manual (non-card) donation: Zelle / Check / Cash. Recorded as PENDING,
// admin confirms receipt later in the Donation Tracker.
export const donationManualSchema = z.object({
  amountCents: z.number().int().min(100).max(1_000_000), // $1 – $10,000
  donorName: z.string().max(200).optional(),
  donorEmail: z.string().email().max(255).optional(),
  method: z.enum(["ZELLE", "CHECK", "CASH"]),
  departmentId: z.string().uuid().optional(),
});

// -- Self-service card payment link (SUBMITTED → PAID) --

export const linkCreateIntentSchema = z.object({
  token: z.string().min(1).max(256),
  coversFees: z.boolean().optional(),
});

export const linkConfirmSchema = z.object({
  token: z.string().min(1).max(256),
  paymentIntentId: z.string().min(1),
});

// -- Standalone meal passes (public /mealpay + admin bulk print) --

// A buyer purchases N generic meal redemptions. Tier picks the MEAL_* fee
// category whose amount_cents is the per-meal price (read server-side; the
// client never sends a price). Quantity is the number of meals.
const mealTier = z.enum(["MEAL_GENERAL", "MEAL_YOUTH"]);

export const mealpayCreateIntentSchema = z.object({
  eventId: uuid,
  tierCode: mealTier,
  quantity: z.number().int().min(1).max(50),
  payerName: z.string().max(200).optional(),
  payerEmail: z.string().email().max(255).optional(),
  payerPhone: z.string().max(40).optional(),
  churchName: z.string().max(200).optional(),
  coversFees: z.boolean().optional(),
});

export const mealpayConfirmSchema = z.object({
  mealPassId: uuid,
  paymentIntentId: z.string().min(1),
});

// On-site (manual, non-card) meal-pass request: Zelle / Cash / Check. Unlike
// card (one tier), an on-site request can stack multiple tiers in one go
// (e.g. General × 5 + Youth × 3). No QR is issued on screen — the desk hands
// out pre-printed QR cards; this records the aggregate request for the admin to
// confirm payment and approve. At least one tier must be > 0.
export const mealpayOnsiteSchema = z
  .object({
    eventId: uuid,
    general: z.number().int().min(0).max(200),
    youth: z.number().int().min(0).max(200),
    payerName: z.string().max(200).optional(),
    payerEmail: z.string().email().max(255).optional(),
    payerPhone: z.string().max(40).optional(),
    churchName: z.string().max(200).optional(),
    method: z.enum(["CARD", "ZELLE", "CASH", "CHECK"]),
  })
  .refine((d) => d.general + d.youth >= 1, {
    message: "At least one pass is required",
    path: ["general"],
  });

// Physical meal-pass request paid online by CARD (multi-tier, no on-screen QR).
// Same aggregate request as the on-site flow — admin hands out pre-printed cards
// at the desk — but the buyer pays now via Stripe instead of at the desk. Prices
// are read server-side; the client only sends counts. At least one tier must be
// > 0.
export const mealpayOnsiteCardIntentSchema = z
  .object({
    eventId: uuid,
    general: z.number().int().min(0).max(200),
    youth: z.number().int().min(0).max(200),
    payerName: z.string().max(200).optional(),
    payerEmail: z.string().email().max(255).optional(),
    payerPhone: z.string().max(40).optional(),
    churchName: z.string().max(200).optional(),
    coversFees: z.boolean().optional(),
  })
  .refine((d) => d.general + d.youth >= 1, {
    message: "At least one pass is required",
    path: ["general"],
  });

// Admin edits an on-site/card meal-pass REQUEST. Buyer contact is always
// editable; tier counts recompute the amount server-side. For card-paid
// (Stripe-linked) requests the counts/amount are locked (the card was already
// charged) — the API rejects count changes on those.
export const mealPassRequestEditSchema = z
  .object({
    payerName: z.string().max(200).optional(),
    payerEmail: z.string().max(255).optional(),
    payerPhone: z.string().max(40).optional(),
    churchName: z.string().max(200).optional(),
    general: z.number().int().min(0).max(200),
    youth: z.number().int().min(0).max(200),
  })
  .refine((d) => d.general + d.youth >= 1, {
    message: "At least one pass is required",
    path: ["general"],
  });

// Staff scans a disposable meal-pass QR at the food line.
export const mealPassRedeemSchema = z.object({
  token: z.string().min(1).max(256),
  mealDate: dateStr,
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
  scanSessionId: uuid.optional(),
});

// Admin generates a batch of single-use meal passes for printing, split by
// tier (e.g. General × 5 + Youth × 5). At least one tier must be > 0.
export const bulkMealPassSchema = z
  .object({
    general: z.number().int().min(0).max(500),
    youth: z.number().int().min(0).max(500),
    eventId: uuid.optional(),
    label: z.string().max(200).optional(),
  })
  .refine((d) => d.general + d.youth >= 1, {
    message: "At least one pass is required",
    path: ["general"],
  })
  .refine((d) => d.general + d.youth <= 500, {
    message: "Up to 500 passes per batch",
    path: ["general"],
  });
