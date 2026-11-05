import { useState } from "react";

import FormInput from "../FormInput.tsx";
import Notice from "../Notice.tsx";
import Panel from "../Panel.tsx";
import PasswordEye from "../PasswordEye.tsx";
import PasswordRequirements from "../PasswordRequirements.tsx";
import PrimaryButton from "../PrimaryButton.tsx";
import { useToast } from "../ui/toast.tsx";
import { guide } from "../../lib/authErrors.ts";
import { passwordViolations } from "../../lib/password.ts";
import { supabase } from "../../lib/supabase.ts";

function isWrongPassword(error: { code?: string | null; message?: string }): boolean {
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "invalid_credentials" ||
    message.includes("Invalid login credentials")
  );
}

/**
 * Change-password panel, shared by the clinician and admin profile pages.
 * Supabase's password update has no current-password check, so the session is
 * re-verified with an explicit re-auth before the swap (protects an unlocked
 * session), with the shared requirements meter and match confirmation.
 */
export default function ChangePasswordPanel() {
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const violations = passwordViolations(newPassword);
  const passwordsMatch =
    confirmPassword === "" || confirmPassword === newPassword;

  async function handleChangePassword() {
    if (pending) return;
    setError(null);

    if (currentPassword === "") {
      setError("Enter your current password first.");
      return;
    }
    if (violations.length > 0) {
      setError(`New password requirements not met: ${violations.join("; ")}.`);
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from the current one.");
      return;
    }
    if (confirmPassword !== newPassword) {
      setError("The confirmation doesn't match the new password.");
      return;
    }

    setPending(true);
    try {
      const email = (await supabase.auth.getUser()).data.user?.email;
      if (email == null) {
        setError("Your session is missing an email; sign in again and retry.");
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError != null) {
        setError(
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
      console.error("[palse] password change failed", cause);
      setError(guide(cause, "Could not update the password. Please try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Change password"
        subtitle="Your session is re-verified against the current password before the change is applied."
      >
        <div className="flex flex-col gap-5">
          <FormInput
            id="profile-security-current"
            label="Current password"
            autoComplete="current-password"
            type="password"
            placeholder="••••••••••••"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={pending}
            trailing={
              <PasswordEye visible={showCurrent} onToggle={() => setShowCurrent((value) => !value)} />
            }
          />

          <div className="flex flex-col gap-2">
            <FormInput
              id="profile-security-new"
              label="New password"
              autoComplete="new-password"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={pending}
              trailing={
                <PasswordEye visible={showNew} onToggle={() => setShowNew((value) => !value)} />
              }
            />
            <PasswordRequirements password={newPassword} />
          </div>

          <FormInput
            id="profile-security-confirm"
            label="Confirm new password"
            autoComplete="new-password"
            type="password"
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={
              passwordsMatch
                ? null
                : "The confirmation doesn't match the new password."
            }
            disabled={pending}
            trailing={
              <PasswordEye visible={showConfirm} onToggle={() => setShowConfirm((value) => !value)} />
            }
          />

          <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
            <PrimaryButton
              pending={pending}
              onClick={() => void handleChangePassword()}
              className="w-auto px-5"
            >
              Update password
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      {error ? <Notice tone="danger">{error}</Notice> : null}
    </div>
  );
}
