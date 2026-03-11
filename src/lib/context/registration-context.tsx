"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  RegistrationWizardState,
  RegistrationType,
  RoomGroupInput,
  ParticipantInput,
  AirportPickupInput,
} from "@/lib/types/registration";

const STORAGE_KEY = "eckcm_registration";

interface RegistrationState extends RegistrationWizardState {
  step: number;
  keyDeposit: number; // key count total
  airportPickup: AirportPickupInput;
}

type Action =
  | { type: "SET_STEP"; step: number }
  | { type: "SET_REGISTRATION_TYPE"; registrationType: RegistrationType }
  | { type: "SET_DATES"; startDate: string; endDate: string; nightsCount: number }
  | { type: "SET_ACCESS_CODE"; code: string }
  | { type: "SET_REGISTRATION_GROUP"; groupId: string }
  | { type: "SET_ROOM_GROUPS"; groups: RoomGroupInput[] }
  | { type: "UPDATE_ROOM_GROUP"; index: number; group: RoomGroupInput }
  | { type: "ADD_ROOM_GROUP"; group: RoomGroupInput }
  | { type: "REMOVE_ROOM_GROUP"; index: number }
  | { type: "UPDATE_PARTICIPANT"; groupIndex: number; participantIndex: number; participant: ParticipantInput }
  | { type: "SET_KEY_DEPOSIT"; count: number }
  | { type: "SET_AIRPORT_PICKUP"; pickup: AirportPickupInput }
  | { type: "SET_ADDITIONAL_REQUESTS"; text: string }
  | { type: "RESET" };

const initialState: RegistrationState = {
  eventId: "",
  registrationType: "self",
  startDate: "",
  endDate: "",
  nightsCount: 0,
  roomGroups: [],
  step: 1,
  keyDeposit: 1,
  airportPickup: { needed: false, selectedRides: [] },
};

function reducer(state: RegistrationState, action: Action): RegistrationState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_REGISTRATION_TYPE":
      return { ...state, registrationType: action.registrationType };
    case "SET_DATES": {
      const datesChanged =
        state.startDate !== action.startDate || state.endDate !== action.endDate;
      const roomGroups =
        datesChanged && state.roomGroups.length > 0
          ? state.roomGroups.map((g) => ({
              ...g,
              participants: g.participants.map((p) => {
                if (p.isDateOverridden) {
                  // Keep overridden participant dates, but clear meals if group dates changed
                  return { ...p, mealSelections: [] };
                }
                // Sync non-overridden participants to new group dates
                return {
                  ...p,
                  checkInDate: action.startDate,
                  checkOutDate: action.endDate,
                  mealSelections: [],
                };
              }),
            }))
          : state.roomGroups;
      return {
        ...state,
        startDate: action.startDate,
        endDate: action.endDate,
        nightsCount: action.nightsCount,
        roomGroups,
      };
    }
    case "SET_ACCESS_CODE":
      return { ...state, accessCode: action.code };
    case "SET_REGISTRATION_GROUP":
      return { ...state, registrationGroupId: action.groupId };
    case "SET_ROOM_GROUPS":
      return { ...state, roomGroups: action.groups };
    case "UPDATE_ROOM_GROUP": {
      const groups = [...state.roomGroups];
      groups[action.index] = action.group;
      return { ...state, roomGroups: groups };
    }
    case "ADD_ROOM_GROUP":
      return { ...state, roomGroups: [...state.roomGroups, action.group] };
    case "REMOVE_ROOM_GROUP":
      return {
        ...state,
        roomGroups: state.roomGroups.filter((_, i) => i !== action.index),
      };
    case "UPDATE_PARTICIPANT": {
      const groups = [...state.roomGroups];
      const group = { ...groups[action.groupIndex] };
      const participants = [...group.participants];
      participants[action.participantIndex] = action.participant;
      group.participants = participants;
      groups[action.groupIndex] = group;
      return { ...state, roomGroups: groups };
    }
    case "SET_KEY_DEPOSIT":
      return { ...state, keyDeposit: action.count };
    case "SET_AIRPORT_PICKUP":
      return { ...state, airportPickup: action.pickup };
    case "SET_ADDITIONAL_REQUESTS":
      return { ...state, additionalRequests: action.text };
    case "RESET":
      return { ...initialState, eventId: state.eventId };
    default:
      return state;
  }
}

interface RegistrationContextValue {
  state: RegistrationState;
  dispatch: React.Dispatch<Action>;
  hydrated: boolean;
}

const RegistrationContext = createContext<RegistrationContextValue | null>(null);

export function RegistrationProvider({
  eventId,
  children,
}: {
  eventId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    eventId,
  });
  const [hydrated, setHydrated] = useState(false);

  // Restore from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.eventId === eventId) {
          dispatch({ type: "SET_DATES", startDate: parsed.startDate, endDate: parsed.endDate, nightsCount: parsed.nightsCount });
          if (parsed.registrationType) {
            dispatch({ type: "SET_REGISTRATION_TYPE", registrationType: parsed.registrationType });
          }
          if (parsed.registrationGroupId) {
            dispatch({ type: "SET_REGISTRATION_GROUP", groupId: parsed.registrationGroupId });
          }
          if (parsed.roomGroups) {
            // Migrate legacy isLeader → isRepresentative
            const migratedGroups = parsed.roomGroups.map((g: any) => ({
              ...g,
              participants: g.participants?.map((p: any) => {
                if ("isLeader" in p && !("isRepresentative" in p)) {
                  const { isLeader, ...rest } = p;
                  return { ...rest, isRepresentative: isLeader };
                }
                return p;
              }) ?? [],
            }));
            dispatch({ type: "SET_ROOM_GROUPS", groups: migratedGroups });
          }
          if (parsed.step) {
            dispatch({ type: "SET_STEP", step: parsed.step });
          }
          if (parsed.keyDeposit) {
            dispatch({ type: "SET_KEY_DEPOSIT", count: parsed.keyDeposit });
          }
          if (parsed.airportPickup) {
            dispatch({ type: "SET_AIRPORT_PICKUP", pickup: parsed.airportPickup });
          }
          if (parsed.additionalRequests) {
            dispatch({ type: "SET_ADDITIONAL_REQUESTS", text: parsed.additionalRequests });
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    // URL type param always takes priority (set by dashboard before navigation)
    if (typeof window !== "undefined") {
      const urlType = new URLSearchParams(window.location.search).get("type");
      if (urlType === "self" || urlType === "others") {
        dispatch({ type: "SET_REGISTRATION_TYPE", registrationType: urlType });
      }
    }

    setHydrated(true);
  }, [eventId]);

  // Persist to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // Warn before closing/refreshing tab during registration
  useEffect(() => {
    if (state.step <= 1) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.step]);

  return (
    <RegistrationContext.Provider value={{ state, dispatch, hydrated }}>
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration() {
  const ctx = useContext(RegistrationContext);
  if (!ctx) {
    throw new Error("useRegistration must be used within RegistrationProvider");
  }
  return ctx;
}
