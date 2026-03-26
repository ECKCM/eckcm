import type { Gender, Grade, MealType, ChurchRole } from "./database";

export type RegistrationType = "self" | "others";

/**
 * Registration wizard state (persisted to sessionStorage)
 */
export interface RegistrationWizardState {
  eventId: string;
  registrationType: RegistrationType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  nightsCount: number;
  accessCode?: string;
  registrationGroupId?: string;
  hasOtherVolunteers?: boolean;
  roomGroups: RoomGroupInput[];
  additionalRequests?: string;
}

export interface RoomGroupInput {
  id: string; // client-side temp ID
  participants: ParticipantInput[];
  lodgingType?: string; // fee category code e.g. "LODGING_AC"
  preferences: LodgingPreferences;
  keyCount: number;
}

export interface ParticipantInput {
  id: string; // client-side temp ID
  isRepresentative: boolean;
  isExistingPerson: boolean;
  personId?: string; // existing person ID if logged-in user
  lastName: string;
  firstName: string;
  displayNameKo?: string;
  gender: Gender | "";
  birthYear: number | undefined;
  birthMonth: number | undefined;
  birthDay: number | undefined;
  isK12: boolean;
  grade?: Grade;
  departmentId?: string;
  phone: string;
  phoneCountry: string;
  noPhone?: boolean;
  email: string;
  noEmail?: boolean;
  churchId?: string;
  churchRole?: ChurchRole;
  churchOther?: string;
  checkInDate?: string; // YYYY-MM-DD, participant-specific override
  checkOutDate?: string; // YYYY-MM-DD, participant-specific override
  isDateOverridden?: boolean; // true if participant manually changed their dates
  tshirtSize?: string; // XS, S, M, L, XL
  guardianName?: string; // required if representative is minor
  guardianPhone?: string; // required if representative is minor
  guardianPhoneCountry?: string; // US|CA|KR|OTHER
  guardianConsent?: boolean; // required if representative is minor
  guardianSignature?: string; // data URL of e-signature
  memberAccessCode?: string; // per-member access code (non-representative only)
  memberRegistrationGroupId?: string; // resolved group from member's access code
  mealSelections: MealSelection[];
}

export interface MealSelection {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  selected: boolean;
}

export interface LodgingPreferences {
  elderly: boolean;
  handicapped: boolean;
  firstFloor: boolean;
}

export interface AirportRideSelection {
  rideId: string;
  selectedParticipantIds: string[]; // client-side temp IDs from ParticipantInput
  flightInfo: string;
}

export interface AirportPickupInput {
  needed: boolean;
  details?: string; // legacy free-text fallback
  selectedRides: AirportRideSelection[];
}

/**
 * Estimate response from pricing service
 */
export interface PriceEstimate {
  registrationFee: number; // cents
  lodgingFee: number;
  additionalLodgingFee: number;
  mealFee: number;
  vbsFee: number;
  keyDeposit: number;
  subtotal: number;
  total: number;
  breakdown: PriceLineItem[];
  manualPaymentDiscount: number; // cents — per-person discount × participants (informational, NOT subtracted from total)
  fundingDiscount: number; // cents — total funding discount applied (subtracted from total)
}

export interface PriceLineItem {
  description: string;
  descriptionKo: string;
  quantity: number;
  unitPrice: number; // cents
  amount: number; // cents
  category?: "registration" | "lodging" | "additional_lodging" | "key_deposit" | "meal" | "vbs" | "funding";
}
