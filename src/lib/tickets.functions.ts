import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { TicketStatus } from "@/lib/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const submitSchema = z.object({
  hotelId: z.string().uuid(),
  locationId: z.string().uuid().nullable().optional(),
  locationText: z.string().trim().max(160).optional().default(""),
  description: z.string().trim().min(5, "Please describe the problem").max(2000),
  reporterEmail: z.string().trim().email().max(255).optional().or(z.literal("")),
  notifyReporter: z.boolean().default(false),
  reporterType: z.enum(["guest", "receptionist", "hotel_manager", "technician"]).default("guest"),
  inputMethod: z.enum(["text", "voice", "image"]).default("text"),
  transcription: z.string().trim().max(4000).optional().or(z.literal("")),
  language: z.string().max(8).default("en"),
  imageDataUrl: z.string().max(8_000_000).optional().or(z.literal("")),
});

export type SubmitResult = {
  ticketNumber: string;
  ticketId: string;
  status: string;
  assignedTo?: string | null;
  ai:
    | { ok: true; categoryName: string; priority: string; reason: string }
    | { ok: false; error: string };
  guidance:
    | { ok: true; guidance: string; danger: boolean }
    | { ok: false; error: string };
};

/**
 * Public endpoint used by guests (QR flow) and staff.
 * The ticket is always saved first; AI classification is best-effort.
 */
export const submitMaintenanceRequest = createServerFn({ method: "POST" })
  .validator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data }): Promise<SubmitResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let imageUrl: string | null = null;
    if (data.imageDataUrl && data.imageDataUrl.startsWith("data:image/")) {
      const [meta, base64] = data.imageDataUrl.split(",");
      const mime = meta?.slice(5).split(";")[0] ?? "image/jpeg";
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      if (base64) {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const path = `tickets/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabaseAdmin.storage
          .from("ticket-media")
          .upload(path, bytes, { contentType: mime, upsert: false });
        if (!error) imageUrl = path;
      }
    }

    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("name")
      .eq("id", data.hotelId)
      .maybeSingle();

    let locationLabel = data.locationText ?? "";
    if (data.locationId) {
      const { data: loc } = await supabaseAdmin
        .from("hotel_locations")
        .select("name, room_number")
        .eq("id", data.locationId)
        .maybeSingle();
      if (loc) locationLabel = loc.room_number ? `${loc.name}` : loc.name;
    }

    const { data: ticket, error: insertError } = await supabaseAdmin
      .from("tickets")
      .insert({
        hotel_id: data.hotelId,
        location_id: data.locationId ?? null,
        location_text: locationLabel || null,
        description: data.description,
        title: data.description.slice(0, 80),
        reporter_type: data.reporterType,
        reporter_email: data.reporterEmail || null,
        notify_reporter: Boolean(data.notifyReporter && data.reporterEmail),
        input_method: data.inputMethod,
        language: data.language,
        transcription: data.transcription || null,
        image_url: imageUrl,
        status: "new",
        ai_status: "pending",
      } as never)
      .select("id, ticket_number")
      .single();

    if (insertError || !ticket) {
      throw new Error(insertError?.message ?? "Could not save the maintenance request.");
    }

    await supabaseAdmin.from("ticket_activity").insert({
      ticket_id: ticket.id,
      actor_label: data.reporterType === "guest" ? "Guest" : "Staff",
      event_type: "created",
      message: `Ticket ${ticket.ticket_number} created via ${data.inputMethod} input.`,
    });

    // --- AI classification (best effort) ---
    const { classifyMaintenanceRequest } = await import("./ai/service.server");
    const result = await classifyMaintenanceRequest({
      description: `${data.description}${data.transcription ? `\nTranscript: ${data.transcription}` : ""}`,
      location: locationLabel,
      hotel: hotel?.name ?? null,
    });

    if (result.ok) {
      const { data: category } = await supabaseAdmin
        .from("maintenance_categories")
        .select("id, name")
        .eq("slug", result.categorySlug)
        .maybeSingle();

      await supabaseAdmin
        .from("tickets")
        .update({
          category_id: category?.id ?? null,
          ai_category_slug: result.categorySlug,
          ai_priority: result.priority,
          ai_reason: result.reason,
          ai_confidence: result.confidence,
          ai_model: result.model,
          ai_status: "classified",
          priority: result.priority,
          needs_manual_classification: false,
        })
        .eq("id", ticket.id);

      await supabaseAdmin.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_label: "MaintainX AI",
        event_type: "ai_classified",
        message: `Classified as ${category?.name ?? result.categorySlug} · suggested priority ${result.priority}.`,
        metadata: { reason: result.reason, confidence: result.confidence },
      });

      // --- SLA targets (new tickets only) ---
      const { applySlaTargets } = await import("./escalation.server");
      await applySlaTargets({ ticketId: ticket.id, priority: result.priority });



      // --- Automatic technician assignment (skill + availability aware) ---
      const { assignTechnician } = await import("./assignment.server");
      const assignment = await assignTechnician({
        ticketId: ticket.id,
        hotelId: data.hotelId,
        categorySlug: result.categorySlug,
        priority: result.priority,
      });

      await supabaseAdmin.from("ticket_activity").insert({
        ticket_id: ticket.id,
        actor_label: "MaintainX AI",
        event_type: assignment.ok ? "assigned" : "assignment_failed",
        message: assignment.ok
          ? `Assigned to ${assignment.technicianName} (${assignment.serviceSlug.replace(/_/g, " ")}).`
          : `Automatic assignment not possible — ${assignment.reason}`,
      });

      // --- Notifications (receptionist always, guest only when opted in) ---
      const { notifyReceptionistsOfAssignment, notifyGuest, notifyTechnicianOfAssignment } =
        await import("./notifications.server");
      await notifyReceptionistsOfAssignment({
        ticketId: ticket.id,
        assigned: assignment.ok,
        technicianName: assignment.ok ? assignment.technicianName : null,
        reason: assignment.ok ? null : assignment.reason,
      });
      if (assignment.ok) {
        await notifyTechnicianOfAssignment({ ticketId: ticket.id });
        await notifyGuest({ ticketId: ticket.id, event: "assigned", status: "assigned" });
      }

      // --- Suggested response (best effort) ---
      const { generateTicketResponse } = await import("./ai/service.server");
      const suggestion = await generateTicketResponse({
        description: data.description,
        category: category?.name ?? result.categorySlug,
        priority: result.priority,
        status: assignment.ok ? "assigned" : "new",
        location: locationLabel,
      });
      if (suggestion.ok) {
        await supabaseAdmin
          .from("tickets")
          .update({
            ai_suggested_response: suggestion.message,
            ai_response_at: new Date().toISOString(),
          })
          .eq("id", ticket.id);
      }

      // --- Immediate guest guidance (best effort) ---
      const { generateImmediateGuidance } = await import("./ai/service.server");
      const guidance = await generateImmediateGuidance({
        description: data.description,
        category: category?.name ?? result.categorySlug,
        priority: result.priority,
        location: locationLabel,
      });

      return {
        ticketId: ticket.id,
        ticketNumber: ticket.ticket_number,
        status: assignment.ok ? "assigned" : "new",
        assignedTo: assignment.ok ? assignment.technicianName : null,
        ai: {
          ok: true,
          categoryName: category?.name ?? result.categorySlug,
          priority: result.priority,
          reason: result.reason,
        },
        guidance,
      };
    }

    await supabaseAdmin
      .from("tickets")
      .update({ ai_status: "failed", ai_reason: result.error, needs_manual_classification: true })
      .eq("id", ticket.id);

    await supabaseAdmin.from("ticket_activity").insert({
      ticket_id: ticket.id,
      actor_label: "MaintainX AI",
      event_type: "ai_failed",
      message: "AI classification unavailable — flagged for manual classification.",
      metadata: { error: result.error },
    });

    // --- SLA targets still apply when classification fails ---
    const { applySlaTargets: applySla } = await import("./escalation.server");
    await applySla({ ticketId: ticket.id, priority: "medium" });



    const { notifyReceptionistsOfAssignment } = await import("./notifications.server");
    await notifyReceptionistsOfAssignment({
      ticketId: ticket.id,
      assigned: false,
      reason: "AI classification was unavailable, so no technician could be matched.",
    });

    const { generateImmediateGuidance } = await import("./ai/service.server");
    const guidance = await generateImmediateGuidance({
      description: data.description,
      location: locationLabel,
    });

    return {
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number,
      status: "new",
      ai: { ok: false, error: result.error },
      guidance,
    };
  });

const TICKET_SELECT = `
  id, ticket_number, hotel_id, location_id, location_text, description, title,
  image_url, transcription, input_method, reporter_type, reporter_email,
  priority, status, ai_category_slug, ai_priority, ai_reason, ai_confidence,
  ai_status, ai_suggested_response, ai_response_at,
  needs_manual_classification, assigned_technician_id,
  created_at, updated_at, resolved_at, assigned_at, started_at,
  sla_tracked, assign_due_at, resolve_due_at, external_eta_at,
  is_escalated, escalated_at, escalation_reason, escalation_count,

  hotels ( id, name, city ),
  hotel_locations ( id, name, room_number ),
  maintenance_categories ( id, slug, name ),
  technicians ( id, full_name, technician_type )
`;

/** Roles of the signed-in user plus a "technician only" flag. */
async function getViewer(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data: roleRows } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((roleRows ?? []) as { role: string }[]).map((r) => r.role);
  const technicianOnly =
    roles.includes("technician") &&
    !roles.includes("receptionist") &&
    !roles.includes("hotel_manager") &&
    !roles.includes("admin");
  let technicianId: string | null = null;
  if (technicianOnly) {
    const { data: tech } = await context.supabase
      .from("technicians")
      .select("id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    technicianId = (tech as { id?: string } | null)?.id ?? null;
  }
  return { roles, technicianOnly, technicianId };
}

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const viewer = await getViewer(context);
    let query = context.supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);

    // Technicians only ever see the tickets assigned to them.
    if (viewer.technicianOnly) {
      if (!viewer.technicianId) return [];
      query = query.eq("assigned_technician_id", viewer.technicianId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) return { ticket: null, activity: [], imageUrl: null, technicians: [] };

    const viewer = await getViewer(context);
    if (
      viewer.technicianOnly &&
      (!viewer.technicianId || ticket.assigned_technician_id !== viewer.technicianId)
    ) {
      return { ticket: null, activity: [], imageUrl: null, technicians: [] };
    }

    const { data: activity } = await context.supabase
      .from("ticket_activity")
      .select("id, event_type, message, actor_label, created_at, metadata")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: false });

    // Only technicians registered for the ticket's category may be assigned
    // (in-house and outsourced alike).
    const { eligibleTechniciansForCategory } = await import("@/lib/assignment-eligibility.server");
    const technicians = await eligibleTechniciansForCategory(
      ticket.maintenance_categories?.id ?? null,
    );

    const { data: statusHistory } = await context.supabase
      .from("ticket_status_history")
      .select("id, from_status, to_status, changed_by_label, created_at")
      .eq("ticket_id", data.id)
      .order("created_at", { ascending: false });

    let imageUrl: string | null = null;
    if (ticket.image_url) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin.storage
        .from("ticket-media")
        .createSignedUrl(ticket.image_url, 60 * 60);
      imageUrl = signed?.signedUrl ?? null;
    }

    return {
      ticket,
      activity: activity ?? [],
      technicians: technicians ?? [],
      statusHistory: statusHistory ?? [],
      imageUrl,
    };
  });

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum(["new", "assigned", "in_progress", "pending", "scheduled", "resolved"])
          .optional(),
        priority: z.enum(["critical", "medium", "low"]).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        technicianId: z.string().uuid().nullable().optional(),
        note: z.string().trim().max(500).optional(),
        /** Receptionist-recorded ETA for an external technician (ISO string). */
        externalEtaAt: z.string().datetime().nullable().optional(),
        /** Reason a technician is handing the ticket back to New Ticket. */
        escalationReason: z.string().trim().max(500).optional(),

      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRows } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => r.role);
    const canAssign = roles.includes("receptionist") || roles.includes("admin");
    const isTechnicianOnly =
      roles.includes("technician") &&
      !roles.includes("receptionist") &&
      !roles.includes("hotel_manager") &&
      !roles.includes("admin");

    if (data.technicianId !== undefined && !canAssign) {
      throw new Error("Only receptionists can assign or reassign tickets.");
    }

    // Fetch current status so we can record status history
    const { data: current } = await context.supabase
      .from("tickets")
      .select("id, status, assigned_technician_id, category_id, sla_tracked, external_eta_at")
      .eq("id", data.id)
      .maybeSingle();
    const previousStatus = (current as { status?: TicketStatus } | null)?.status ?? null;
    const currentTechnicianId =
      (current as { assigned_technician_id?: string | null } | null)?.assigned_technician_id ??
      null;

    if (isTechnicianOnly) {
      const { data: me } = await context.supabase
        .from("technicians")
        .select("id")
        .eq("profile_id", context.userId)
        .maybeSingle();
      const assignedTo = currentTechnicianId;
      if (!me || !assignedTo || assignedTo !== me.id) {
        throw new Error("You can only update tickets assigned to you.");
      }
    }

    // Category-based assignment: a ticket may only go to a technician
    // registered for the service its category maps to.
    if (data.technicianId) {
      const categoryId =
        data.categoryId !== undefined
          ? data.categoryId
          : ((current as { category_id?: string | null } | null)?.category_id ?? null);
      const { eligibleTechniciansForCategory } =
        await import("@/lib/assignment-eligibility.server");
      const eligible = await eligibleTechniciansForCategory(categoryId);
      if (!eligible.some((t) => t.id === data.technicianId)) {
        throw new Error("This technician is not registered for the ticket's maintenance category.");
      }
    }

    // A technician can only actively work on one ticket at a time.
    if (data.status === "in_progress") {
      const technicianId = data.technicianId ?? currentTechnicianId;
      if (technicianId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: busy } = await supabaseAdmin
          .from("tickets")
          .select("ticket_number")
          .eq("assigned_technician_id", technicianId)
          .eq("status", "in_progress")
          .neq("id", data.id)
          .limit(1)
          .maybeSingle();
        if (busy) {
          // Business rule, not a crash: return it so the UI can show a toast.
          return {
            ok: false as const,
            error: `This technician is already working on ticket ${busy.ticket_number}. Complete or resolve it before starting another job.`,
          };
        }
      }
    }

    const patch: Record<string, unknown> = {};
    if (data.status) {
      patch["status"] = data.status;
      patch["resolved_at"] = data.status === "resolved" ? new Date().toISOString() : null;
      if (data.status === "in_progress") patch["started_at"] = new Date().toISOString();
    }
    if (data.priority) patch["priority"] = data.priority;
    if (data.categoryId !== undefined) patch["category_id"] = data.categoryId;
    if (data.technicianId !== undefined) {
      patch["assigned_technician_id"] = data.technicianId;
      if (data.technicianId && !data.status) patch["status"] = "assigned";
      // A fresh assignment starts a new ETA window.
      if (data.externalEtaAt === undefined) patch["external_eta_at"] = null;
    }
    if (data.externalEtaAt !== undefined) patch["external_eta_at"] = data.externalEtaAt;

    // A technician handing the ticket back to "New Ticket" releases it so the
    // receptionist can find another suitable technician.
    const handedBack =
      isTechnicianOnly &&
      data.status === "new" &&
      (previousStatus === "assigned" || previousStatus === "in_progress");
    if (handedBack) {
      patch["assigned_technician_id"] = null;
      patch["external_eta_at"] = null;
    }


    if (Object.keys(patch).length > 0) {
      const { error } = await context.supabase
        .from("tickets")
        .update(patch as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    // Acknowledgement: once the technician starts (or otherwise moves the
    // ticket off "assigned"), its "new job" alerts stop counting in the badge.
    if (data.status && data.status !== "assigned" && previousStatus === "assigned") {
      await context.supabase
        .from("app_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("ticket_id", data.id)
        .eq("kind", "new_job")
        .is("read_at", null);
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const actorLabel = profile?.full_name || "Staff";

    // Record status change in ticket_status_history
    const newStatus = (patch["status"] as TicketStatus | undefined) ?? null;
    if (data.status && newStatus && newStatus !== previousStatus) {
      await context.supabase.from("ticket_status_history").insert({
        ticket_id: data.id,
        from_status: previousStatus,
        to_status: newStatus,
        changed_by: context.userId,
        changed_by_label: actorLabel,
      });
    }

    const parts: string[] = [];
    if (data.status) parts.push(`status → ${data.status}`);
    if (data.priority) parts.push(`priority → ${data.priority}`);
    if (data.technicianId !== undefined)
      parts.push(data.technicianId ? "technician assigned" : "technician cleared");
    if (data.externalEtaAt) parts.push(`external ETA recorded`);
    if (data.note) parts.push(data.note);


    if (parts.length > 0) {
      await context.supabase.from("ticket_activity").insert({
        ticket_id: data.id,
        actor_user_id: context.userId,
        actor_label: actorLabel,
        event_type: "updated",
        message: parts.join(" · "),
      });
    }

    if (data.technicianId) {
      await context.supabase.from("ticket_assignments").insert({
        ticket_id: data.id,
        technician_id: data.technicianId,
        assigned_by: context.userId,
      });
    }

    // --- Notifications ---
    const { notifyGuest, notifyReceptionistsOfAssignment, notifyTechnicianOfAssignment } =
      await import("./notifications.server");
    if (data.technicianId) {
      const { data: tech } = await context.supabase
        .from("technicians")
        .select("full_name")
        .eq("id", data.technicianId)
        .maybeSingle();
      await notifyReceptionistsOfAssignment({
        ticketId: data.id,
        assigned: true,
        technicianName: tech?.full_name ?? null,
      });
      await notifyTechnicianOfAssignment({ ticketId: data.id });
      await notifyGuest({ ticketId: data.id, event: "assigned", status: "assigned" });
    }
    if (data.status && newStatus && newStatus !== previousStatus) {
      await notifyGuest({
        ticketId: data.id,
        event: newStatus === "resolved" ? "resolved" : "status",
        status: newStatus,
      });
    }
    if (handedBack) {
      const { notifyHandback } = await import("./notifications.server");
      await notifyHandback({
        ticketId: data.id,
        technicianName: actorLabel,
        reason: data.escalationReason ?? null,
      });
    }


    // --- SLA / escalation side effects (tracked tickets only) ---
    const isTracked = Boolean((current as { sla_tracked?: boolean } | null)?.sla_tracked);
    if (isTracked) {
      const { recomputeSlaTargets, escalateTicket } = await import("./escalation.server");
      if (data.priority) await recomputeSlaTargets(data.id, data.priority);

      if (handedBack) {
        await escalateTicket({
          ticketId: data.id,
          key: `handback:${new Date().toISOString()}`,
          actorLabel,
          reason: `Technician ${actorLabel} returned the ticket to New Ticket — ${
            data.escalationReason || "the issue could not be resolved"
          }. A suitable technician must be assigned by the receptionist.`,
        });
      }
    }

    return { ok: true as const, error: null };
  });

/**
 * SLA sweep — escalates tracked tickets that breached an assignment,
 * ETA or resolution target. Called by staff dashboards on load.
 */
export const runSlaEscalationCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runEscalationSweep } = await import("./escalation.server");
    return runEscalationSweep();
  });


/** Regenerate the AI suggested response for a ticket. */
export const regenerateTicketResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: z.string().uuid().parse(input.id) }))
  .handler(async ({ data, context }) => {
    const { data: ticket, error } = await context.supabase
      .from("tickets")
      .select("id, description, priority, status, location_text, maintenance_categories ( name )")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found.");

    const { generateTicketResponse } = await import("./ai/service.server");
    const result = await generateTicketResponse({
      description: ticket.description,
      category: ticket.maintenance_categories?.name ?? "Unclassified",
      priority: ticket.priority,
      status: ticket.status,
      location: ticket.location_text,
    });
    if (!result.ok) return { ok: false as const, error: result.error };

    const { error: updateError } = await context.supabase
      .from("tickets")
      .update({
        ai_suggested_response: result.message,
        ai_response_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const, message: result.message };
  });

/**
 * Sprint 2 — AI-classified tickets with their assigned technicians.
 * Receptionists use this to see which tickets AI has classified and who was assigned.
 * Technicians use this to see and update their own assigned work.
 */
export const listAiTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleList = (roles ?? []).map((r) => r.role);
    const isTechnician =
      roleList.includes("technician") &&
      !roleList.includes("hotel_manager") &&
      !roleList.includes("admin");

    let query = context.supabase
      .from("tickets")
      .select(TICKET_SELECT)
      .order("created_at", { ascending: false })
      .limit(200);

    // Technicians only see tickets assigned to them
    if (isTechnician) {
      const { data: tech } = await context.supabase
        .from("technicians")
        .select("id")
        .eq("profile_id", context.userId)
        .maybeSingle();
      if (tech) {
        query = query.eq("assigned_technician_id", tech.id);
      } else {
        return [];
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  });
