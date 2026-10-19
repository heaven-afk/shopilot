export type BusinessRole = "owner" | "manager" | "staff";
export type PlatformRole = "owner" | "admin" | "viewer";
export type Workspace = {
  id: string;
  name: string;
  business_type?: string;
  phone?: string;
  address?: string;
  receipt_footer?: string;
  receipt_width?: 58 | 80;
  logo_url?: string;
  role?: BusinessRole;
};
export type Invitation = {
  id: string;
  businessName: string;
  role: "manager" | "staff";
  expiresAt: string;
};
export type Team = {
  members: { userId: string; email: string; role: BusinessRole }[];
  invitations: {
    id: string;
    email: string;
    role: BusinessRole;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
  }[];
};
export type PlatformDashboard = {
  businessCount: number;
  accountCount: number;
  staffCount: number;
  salesCount: number;
  scansToday: number;
  activeBusinesses: number;
  businesses: {
    id: string;
    name: string;
    business_type: string;
    created_at: string;
    owner_email: string;
    last_synced_at: string | null;
    members: number;
    sales: number;
  }[];
  administrators: { userId: string; email: string; role: PlatformRole }[];
  audit: {
    action: string;
    created_at: string;
    actor_email?: string;
    target_email?: string;
  }[];
};
