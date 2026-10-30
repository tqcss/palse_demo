import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type UserRole = "clinician" | "admin";
export type AccountStatus = "pending" | "active" | "disabled";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  department: string | null;
  /** Free-text job title ("Neonatologist"); edited by the owner on /profile. */
  job_title: string | null;
  /** App role: clinician (patient-facing) or admin (manages the org in /admin). */
  role: UserRole;
  /** pending = awaiting superadmin approval; disabled = locked out. */
  status: AccountStatus;
  org_id: string | null;
  /** True until the clinician replaces their admin-issued temporary password. */
  must_set_password: boolean;
  created_at: string;
  updated_at: string;
}

/** Approved administrator with a session; the only user of /admin. */
export function isAdminProfile(profile: Profile | null): boolean {
  return profile?.role === "admin" && profile.status === "active";
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** True until the initial local-session lookup resolves. */
  loading: boolean;
  /** True while the profile row belonging to the current user is loading. */
  profileLoading: boolean;
  /** True while a password-recovery link redirect is being processed. */
  recovering: boolean;
  /** True when the countdown banner before idle sign-out should show. */
  idling: boolean;
  signOut: () => Promise<void>;
  /** Re-fetches the profile row (used by the pending-approval re-check). */
  refetchProfile: () => Promise<Profile | null>;
  clearRecovery: () => void;
  clearIdle: () => void;
}

/** Shared auth store; consumed through `useAuth` and populated by AuthProvider. */
export const AuthContext = createContext<AuthContextValue | null>(null);
