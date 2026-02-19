import type { Gender, Grade, MealType, ChurchRole } from "./database";

/**
 * Registration wizard state (persisted to sessionStorage)
 */
export interface RegistrationWizardState {
  eventId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  nightsCount: number;
  accessCode?: string;
  registrationGroupId?: string;
  roomGroups: RoomGroupInput[];
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
  gender: Gender;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
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
}

export interface PriceLineItem {
  description: string;
  descriptionKo: string;
  quantity: number;
  unitPrice: number; // cents
  amount: number; // cents
}
