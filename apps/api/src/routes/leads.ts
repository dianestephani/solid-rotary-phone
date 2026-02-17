import { Router } from "express";
import type { Router as ExpressRouter, Request, Response } from "express";
import { prisma } from "@crm/db";
import type { ApiResponse, LeadResponse } from "@crm/types";
import { createLeadSchema, updateLeadSchema } from "../schemas/leads.js";

export const leadsRouter: ExpressRouter = Router();

// Shapes a Prisma Lead record into the API response format.
// Dates are serialized to ISO 8601 strings — Prisma returns Date objects.
function formatLead(lead: {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  sequenceDay: number;
  lastContactedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): LeadResponse {
  return {
    id: lead.id,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    status: lead.status as LeadResponse["status"],
    sequenceDay: lead.sequenceDay,
    lastContactedAt: lead.lastContactedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /leads
// Returns all leads ordered by creation date descending.
// ---------------------------------------------------------------------------
leadsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
    });
    const response: ApiResponse<LeadResponse[]> = {
      success: true,
      data: leads.map(formatLead),
    };
    res.json(response);
  } catch {
    const response: ApiResponse<never> = {
      success: false,
      error: "Failed to fetch leads",
    };
    res.status(500).json(response);
  }
});

// ---------------------------------------------------------------------------
// GET /leads/:id
// Returns a single lead by ID. 404 if not found.
// ---------------------------------------------------------------------------
leadsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
    });
    if (!lead) {
      const response: ApiResponse<never> = { success: false, error: "Lead not found" };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<LeadResponse> = { success: true, data: formatLead(lead) };
    res.json(response);
  } catch {
    const response: ApiResponse<never> = { success: false, error: "Failed to fetch lead" };
    res.status(500).json(response);
  }
});

// ---------------------------------------------------------------------------
// POST /leads
// Creates a new lead. Validates request body against createLeadSchema.
// Returns 201 with the created lead.
// ---------------------------------------------------------------------------
leadsRouter.post("/", async (req: Request, res: Response) => {
  const parsed = createLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
    res.status(400).json(response);
    return;
  }

  try {
    const lead = await prisma.lead.create({ data: parsed.data });
    const response: ApiResponse<LeadResponse> = { success: true, data: formatLead(lead) };
    res.status(201).json(response);
  } catch {
    const response: ApiResponse<never> = { success: false, error: "Failed to create lead" };
    res.status(500).json(response);
  }
});

// ---------------------------------------------------------------------------
// PATCH /leads/:id
// Partial update. Only provided fields are written. 404 if not found.
// ---------------------------------------------------------------------------
leadsRouter.patch("/:id", async (req: Request, res: Response) => {
  const parsed = updateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    const response: ApiResponse<never> = {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
    res.status(400).json(response);
    return;
  }

  try {
    const data = {
      ...parsed.data,
      // Convert ISO 8601 string to Date for Prisma
      ...(parsed.data.lastContactedAt !== undefined && {
        lastContactedAt: new Date(parsed.data.lastContactedAt),
      }),
    };

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data,
    });
    const response: ApiResponse<LeadResponse> = { success: true, data: formatLead(lead) };
    res.json(response);
  } catch (err: unknown) {
    // Prisma throws P2025 when the record doesn't exist
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      const response: ApiResponse<never> = { success: false, error: "Lead not found" };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<never> = { success: false, error: "Failed to update lead" };
    res.status(500).json(response);
  }
});

// ---------------------------------------------------------------------------
// DELETE /leads/:id
// Hard delete. 404 if not found. Cascade removes associated MessageLogs.
// ---------------------------------------------------------------------------
leadsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    // 204 No Content — success with no response body
    res.status(204).send();
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      const response: ApiResponse<never> = { success: false, error: "Lead not found" };
      res.status(404).json(response);
      return;
    }
    const response: ApiResponse<never> = { success: false, error: "Failed to delete lead" };
    res.status(500).json(response);
  }
});
