import { z } from "zod";

export const emailSchema = z.string().email("Invalid email address");

export const phoneSchema = z
  .string()
  .min(10, "Phone number must be at least 10 digits")
  .regex(/^[\d\s\-+()]+$/, "Invalid phone number format");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name is too long")
  .regex(/^[a-zA-Z\s'-]+$/, "Only English characters allowed");

export const koreanNameSchema = z
  .string()
  .max(50, "Name is too long")
  .optional();

export const birthDateSchema = z.object({
  year: z.number().min(1900).max(new Date().getFullYear()),
  month: z.number().min(1).max(12),
  day: z.number().min(1).max(31),
});

/**
 * Calculate age at a specific date
 */
export function calculateAge(birthDate: Date, referenceDate: Date): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}
