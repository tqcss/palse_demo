import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import AuthFormShell from "../components/AuthFormShell.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import PasswordEye from "../components/PasswordEye.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import PasswordRequirements from "../components/PasswordRequirements.tsx";
import { guide } from "../lib/authErrors.ts";
import { MIN_PASSWORD_LENGTH, passwordPolicyMet } from "../lib/password.ts";
import { supabase } from "../lib/supabase.ts";
import { useAuth } from "../context/useAuth.ts";

const BLANK = { password: "", confirm: "" };

/**
 * Full-screen gate for clinicians signing in with an admin-issued temporary
 * password: they must replace it before any clinical page unlocks. Also
 * reachable by admins (rare) with the same mechanics.
 */
export default function ChangeTempPassword() {
  const navigate = useNavigate();
  const { user, profile, refetchProfile, signOut, loading, profileLoading } = useAuth();

  const [form, setForm] = useState(BLANK);
  const [fieldErrors, setFieldErrors] = useState<{ password: string | null; confirm: string | null }>({
    password: null,
    confirm: null,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Needs a live session; bounce otherwise.
  if (!loading && !profileLoading && user == null) {
    return <Navigate replace to="/signin" />;
  }

  function validate(): boolean {
    const password = passwordPolicyMet(form.password)
      ? null
      : `Use ${MIN_PASSWORD_LENGTH}+ characters with lowercase, uppercase letters, numbers, and symbols.`;
    const confirm = form.confirm === form.password ? null : "Passwords do not match.";
    setFieldErrors({ password, confirm });
    return password == null && confirm == null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    setFormError(null);
    try {
      const { error: userError } = await supabase.auth.updateUser({
        password: form.password,
      });
      if (userError != null) throw userError;

      if (profile != null) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ must_set_password: false })
          .eq("id", profile.id);
        if (profileError != null) throw profileError;
      }

      await refetchProfile();
      navigate(profile?.role === "admin" ? "/admin" : "/dashboard", { replace: true });
    } catch (cause) {
      console.error("[palse change temp password]", cause);
      setFormError(guide(cause, "Could not set your password. Please try again."));
      setPending(false);
    }
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || user?.email || "there";

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Set your own password</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Welcome, {displayName} — you signed in with a temporary password issued
          by your administrator. Create your own to continue.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <div>
          <FormInput
            id="temp-new-password"
            label="New password"
            hint={`${MIN_PASSWORD_LENGTH}+ characters with lowercase and uppercase letters, numbers, and symbols.`}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            error={fieldErrors.password}
            disabled={pending}
            autoFocus
            trailing={
              <PasswordEye
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />
            }
          />
          <PasswordRequirements password={form.password} />
        </div>

        <FormInput
          id="temp-confirm-password"
          label="Confirm new password"
          type={showPassword ? "text" : "password"}
          name="confirm"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={form.confirm}
          onChange={(event) => setForm((current) => ({ ...current, confirm: event.target.value }))}
          error={fieldErrors.confirm}
          disabled={pending}
        />

        <PrimaryButton pending={pending}>
          Set password and continue
        </PrimaryButton>
      </form>

      <p className="mt-8 text-sm text-theme-gray">
        Not expecting this step?{" "}
        <button
          type="button"
          onClick={() => void signOut()}
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Sign out
        </button>{" "}
        or <Link to="/signin" className="font-semibold text-theme-maroon underline-offset-4 hover:underline">use the regular sign-in</Link>.
      </p>
    </AuthFormShell>
  );
}
