import "server-only";
import { adminClient } from "../admin";
import { serverEnv } from "../env";
import { IntakeService } from "./service";
import { SupabaseIntakeRepo } from "./supabase-repo";

let service: IntakeService | undefined;

export function intakeService(): IntakeService {
  service ??= new IntakeService(new SupabaseIntakeRepo(adminClient(), serverEnv().maskMapKey));
  return service;
}
