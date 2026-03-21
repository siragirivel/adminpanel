import { supabase } from "@/lib/supabase";

export type ActivityEntityType =
  | "vehicle"
  | "enquiry"
  | "spare_part"
  | "spare_order"
  | "transaction"
  | "invoice"
  | "quotation";

export type ActivityAction = "create" | "edit" | "delete";

interface LogActivityInput {
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  entityLabel: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity({
  action,
  entityType,
  entityId,
  entityLabel,
  description,
  metadata = {},
}: LogActivityInput) {
  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      throw authError;
    }

    const { error } = await supabase.from("activity_logs").insert([
      {
        action,
        entity_type: entityType,
        entity_id: entityId,
        entity_label: entityLabel,
        description,
        metadata,
        created_by: user?.id,
      },
    ]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error("Failed to write activity log", error);
  }
}
