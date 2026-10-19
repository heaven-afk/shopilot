import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { State } from "./domain";
import type {
  BusinessRole,
  Invitation,
  PlatformRole,
  PlatformDashboard,
  Team,
  Workspace,
} from "./contracts";
type Business = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  business_type: string;
  phone: string;
  address: string;
  receipt_footer: string;
  receipt_width: 58 | 80;
  logo_url: string;
};
type Database = {
  public: {
    Tables: {
      memberships: {
        Row: { business_id: string; user_id: string; role: BusinessRole };
        Insert: { business_id: string; user_id: string; role: BusinessRole };
        Update: { role?: BusinessRole };
        Relationships: [];
      };
      businesses: {
        Row: Business;
        Insert: Business;
        Update: Partial<Business>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_workspace: { Args: { workspace_name: string }; Returns: string };
      setup_business: {
        Args: {
          workspace_name: string;
          business_type: string;
          business_phone: string;
          business_address: string;
        };
        Returns: string;
      };
      sync_workspace: {
        Args: { bid: string; payload: State & { deviceId?: string } };
        Returns: State;
      };
      business_role: { Args: { bid: string }; Returns: BusinessRole | null };
      invite_staff: {
        Args: { bid: string; staff_email: string; staff_role: string };
        Returns: string;
      };
      my_invitations: { Args: Record<string, never>; Returns: Invitation[] };
      accept_staff_invitation: {
        Args: { invitation_id: string };
        Returns: string;
      };
      business_team: { Args: { bid: string }; Returns: Team };
      update_team_access: {
        Args: { bid: string; target_user: string; new_role: string };
        Returns: undefined;
      };
      revoke_staff_invitation: {
        Args: { bid: string; invitation_id: string };
        Returns: undefined;
      };
      update_business_settings: {
        Args: { bid: string; details: Workspace };
        Returns: Workspace;
      };
      platform_access: {
        Args: Record<string, never>;
        Returns: PlatformRole | null;
      };
      platform_dashboard: {
        Args: Record<string, never>;
        Returns: PlatformDashboard;
      };
      set_platform_access: {
        Args: { target_email: string; access_role: string };
        Returns: undefined;
      };
      reserve_scan: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
let client: SupabaseClient<Database> | null = null;
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key);
  return client;
}
