import { z } from "zod";

// Valid lead status values — mirrors LeadStatus in @crm/types.
// Enforced here at the API boundary; the database stores them as plain strings.
const leadStatusSchema = z.enum([
  "NEW",
  "IN_SEQUENCE",
  "RESPONDED",
  "BOOKED",
  "CLOSED",
]);

export const createLeadSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("email must be a valid email address"),
  // E.164: + followed by 7–15 digits
  phone: z
    .string()
    .regex(/^\+\d{7,15}$/, "phone must be in E.164 format, e.g. +15551234567"),
  status: leadStatusSchema.optional(),
});

export const updateLeadSchema = z
  .object({
    name: z.string().min(1, "name cannot be empty").optional(),
    email: z.string().email("email must be a valid email address").optional(),
    phone: z
      .string()
      .regex(/^\+\d{7,15}$/, "phone must be in E.164 format, e.g. +15551234567")
      .optional(),
    status: leadStatusSchema.optional(),
    sequenceDay: z.number().int().min(0, "sequenceDay must be a non-negative integer").optional(),
    lastContactedAt: z
      .string()
      .datetime({ message: "lastContactedAt must be an ISO 8601 datetime string" })
      .optional(),
  })
  // Prevent empty PATCH requests — at least one field must be provided
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field must be provided for update",
  });

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
