import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { State } from "./domain";
type Business = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  business_type: string;
  phone: string;
  address: string;
};
type Database = {
  public: {
    Tables: {
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
      sync_workspace: { Args: { bid: string; payload: State }; Returns: State };
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
