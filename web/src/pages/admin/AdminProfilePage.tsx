import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

import FormInput from "../../components/FormInput.tsx";
import Notice from "../../components/Notice.tsx";
import Panel from "../../components/Panel.tsx";
import PasswordEye from "../../components/PasswordEye.tsx";
import PasswordRequirements from "../../components/PasswordRequirements.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import Badge from "../../components/ui/Badge.tsx";
import ConfirmDialog from "../../components/ConfirmDialog.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import RelativeTime from "../../components/ui/RelativeTime.tsx";
import { useToast } from "../../components/ui/toast.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";
import { guide } from "../../lib/authErrors.ts";
import { passwordViolations } from "../../lib/password.ts";
import { supabase } from "../../lib/supabase.ts";

interface ProfileForm {
  firstName: string;
  lastName: string;
  jobTitle: string;
}

function isWrongPassword(error: { code?: string | null; message?: string }): boolean {
  const code = error.code ?? "";
  const message = error.message ?? "";
  return code === "invalid_credentials" || message.includes("Invalid login credentials");
}

/**
 * Administrator profile (/admin/profile): account identity (name and free-text
 * job title editable; email/role are fixed attributes), plus password change.
 * A router-level unsaved-changes guard protects the identity form.
 */
export default function AdminProfilePage() {
  useAdminPageTitle("Profile");
  const { user, profile, refetchProfile } = useAuth();
  const toast = useToast();

  /* ------------------------------ identity form ----------------------------- */
  const email = user?.email ?? "—";
  const memberSince = user?.created_at ?? null;

  const [form, setForm] = useState<ProfileForm>({ firstName: "", lastName: "", jobTitle: "" });
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Synch the form once the profile (or the metadata fallback) arrives.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    setForm({
      firstName:
        profile?.first_name ?? (user?.user_metadata?.first_name as string | undefined) ?? "",
      lastName:
        profile?.last_name ?? (user?.user_metadata?.last_name as string | undefined) ?? "",
      jobTitle: profile?.job_title ?? "",
    });
    setHydrated(true);
  }, [hydrated, profile, user]);

  const saved = useMemo<ProfileForm>(
    () => ({
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      jobTitle: profile?.job_title ?? "",
    }),
    [profile],
  );

  const dirty =
    hydrated &&
    (form.firstName !== saved.firstName ||
      form.lastName !== saved.lastName ||
      form.jobTitle !== saved.jobTitle);

  /* Router-level unsaved-changes guard: leaving (link, Back, Redirect) with
     dirty fields blocks and asks; a dirty window also warns on refresh. */
  const blocker = useBlocker(dirty);

  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtyRef.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  async function handleSave() {
    if (pending) return;
    setFormError(null);
    if (form.firstName.trim() === "" && form.lastName.trim() === "") {
      setFormError("Keep at least a name on record — both fields can't be empty.");
      return;
    }
    setPending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { first_name: form.firstName.trim(), last_name: form.lastName.trim() },
      });
      if (updateError != null) throw updateError;
      if (profile != null) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            first_name: form.firstName.trim() || "Unknown",
            last_name: form.lastName.trim() || "Unknown",
            job_title: form.jobTitle.trim() === "" ? null : form.jobTitle.trim(),
          })
          .eq("id", profile.id);
        if (profileError != null) throw profileError;
      }
      await refetchProfile();
      toast.push("success", "Profile changes saved.");
    } catch (cause) {
      console.error("[palse admin profile]", cause);
      setFormError(guide(cause, "Could not save your profile. Please try again."));
    } finally {
      setPending(false);
    }
  }

  /* ----------------------------- password change ----------------------------- */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwPending, setPwPending] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const violations = passwordViolations(newPassword);
  const passwordsMatch = confirmPassword === "" || confirmPassword === newPassword;

  async function handleChangePassword() {
    if (pwPending) return;
    setPwError(null);
    if (currentPassword === "") {
      setPwError("Enter your current password first.");
      return;
    }
    if (violations.length > 0) {
      setPwError(`New password requirements not met: ${violations.join("; ")}.`);
      return;
    }
    if (newPassword === currentPassword) {
      setPwError("Your new password must be different from the current one.");
      return;
    }
    if (confirmPassword !== newPassword) {
      setPwError("The confirmation doesn't match the new password.");
      return;
    }

    setPwPending(true);
    try {
      if (email === "—") {
        setPwError("Your session is missing an email; sign in again and retry.");
        return;
      }
      // Supabase's password update has no current-password check: re-verify
      // explicitly before the swap (protects an unlocked session).
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError != null) {
        setPwError(
          isWrongPassword(reauthError)
            ? "Your current password is incorrect."
            : guide(reauthError),
        );
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError != null) throw updateError;
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.push("success", "Password updated — use it next time you sign in.");
    } catch (cause) {
      console.error("[palse admin password change]", cause);
      setPwError(guide(cause, "Could not update the password. Please try again."));
    } finally {
      setPwPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account · Your administrator profile"
        title="Profile"
        subtitle="Displayed to your organization's members in the console."
      />

      <Panel title="Administrator identity">
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="admin-profile-first-name"
            label="First name"
            value={form.firstName}
            onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
            disabled={pending}
          />
          <FormInput
            id="admin-profile-last-name"
            label="Last name"
            value={form.lastName}
            onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
            disabled={pending}
          />
          <FormInput
            id="admin-profile-job-title"
            label="Job title"
            placeholder="e.g. Chief of Neonatology"
            hint="Free text — displayed next to your name."
            value={form.jobTitle}
            onChange={(event) => setForm((prev) => ({ ...prev, jobTitle: event.target.value }))}
            disabled={pending}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-theme-gray">Email</span>
            <span className="text-sm text-theme-ink-soft">{email}</span>
            <span className="text-xs text-theme-gray">
              Fixed account attribute. Lost access? Ask a superadmin.
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-theme-gray">Role</span>
            <span>
              <Badge tone="maroon" icon="shield">Administrator</Badge>
            </span>
          </div>
          {memberSince != null ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-theme-gray">Member since</span>
              <span className="text-sm text-theme-ink-soft">
                <RelativeTime iso={memberSince} />
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
          {dirty ? <span className="text-xs text-risk-moderate-fg">Unsaved changes</span> : null}
          <PrimaryButton pending={pending} onClick={() => void handleSave()} className="w-auto px-5">
            Save changes
          </PrimaryButton>
        </div>
      </Panel>

      {formError ? <Notice tone="danger">{formError}</Notice> : null}

      <Panel
        title="Change password"
        subtitle="Your session is re-verified against the current password before the change is applied."
      >
        <div className="flex flex-col gap-5">
          <FormInput
            id="admin-security-current"
            label="Current password"
            autoComplete="current-password"
            type="password"
            placeholder="••••••••••••"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={pwPending}
            trailing={
              <PasswordEye visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} />
            }
          />

          <div className="flex flex-col gap-2">
            <FormInput
              id="admin-security-new"
              label="New password"
              autoComplete="new-password"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={pwPending}
              trailing={
                <PasswordEye visible={showNew} onToggle={() => setShowNew((value) => !value)} />
              }
            />
            <PasswordRequirements password={newPassword} />
          </div>

          <FormInput
            id="admin-security-confirm"
            label="Confirm new password"
            autoComplete="new-password"
            type="password"
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={passwordsMatch ? null : "The confirmation doesn't match the new password."}
            disabled={pwPending}
            trailing={
              <PasswordEye visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} />
            }
          />

          <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
            <PrimaryButton
              pending={pwPending}
              onClick={() => void handleChangePassword()}
              className="w-auto px-5"
            >
              Update password
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      {pwError ? <Notice tone="danger">{pwError}</Notice> : null}

      {blocker.state === "blocked" ? (
        <ConfirmDialog
          title="Leave without saving?"
          question="Your profile edits haven't been saved yet. Leaving now (link navigation, Back or closing the tab) discards them."
          confirmLabel="Discard changes"
          destructive
          onConfirm={() => blocker.proceed()}
          onCancel={() => blocker.reset()}
        />
      ) : null}
    </div>
  );
}
