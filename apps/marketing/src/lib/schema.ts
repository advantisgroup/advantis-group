import { isWithinCallbackHours } from "@advantis/convex/marketing/inquiry";
import { z } from "zod";

// same grace as the API, so a slot picked "now" isn't refused on the way out
const PAST_GRACE_MS = 5 * 60 * 1000;

/** A datetime-local value the team can actually call at: not past, inside callback hours. */
const isBookable = (value: string) => {
  // an empty field is "required", not "outside hours"
  if (!value) return true;
  const at = new Date(value).getTime();
  return !Number.isNaN(at) && at >= Date.now() - PAST_GRACE_MS && isWithinCallbackHours(at);
};

export const FormDataSchema = z.object({
  company: z.string().min(1, "Company is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Invalid email address"),
  phone: z.string().optional(),
  message: z.string().min(1, "Message is required"),
  mode: z.string().min(1, "Mode is required"),
});

export const OtherFormDataSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.email("Invalid email address"),
  phone: z.string().optional(),
  topic: z.enum(["withdrawal", "question", "legal"], {
    message: "Please select a topic",
  }),
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(1, "Message is required"),
  mode: z.string().min(1, "Mode is required"),
});

export const CallbackFormDataSchema = z.object({
  company: z.string().min(1, "Company is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.email("Invalid email address"),
  dateTime: z
    .string()
    .min(1, "Date/time is required")
    // "hours" is a code, not copy: the form swaps in its own localized line
    .refine(isBookable, "hours"),
  notes: z.string().optional(),
});

export const WhitepaperFormDataSchema = z.object({
  company: z.string().min(1, "Company is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Invalid email address"),
  phone: z.string().min(1, "Phone is required"),
  consent: z.boolean().refine((value) => value, "Consent is required"),
});
