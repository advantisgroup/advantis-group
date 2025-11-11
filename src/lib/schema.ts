import { z } from "zod";

export const FormDataSchema = z.object({
  company: z.string().min(1, "Company is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  message: z.string().min(1, "Message is required"),
  mode: z.string().min(1, "Mode is required"),
});
