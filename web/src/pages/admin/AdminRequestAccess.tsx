import { useState } from "react";
import { Link } from "react-router-dom";

import AuthFormShell from "../../components/AuthFormShell.tsx";
import AuthBackLink from "../../components/AuthBackLink.tsx";
import CheckInbox from "../../components/CheckInbox.tsx";
import FormInput from "../../components/FormInput.tsx";
import Notice from "../../components/Notice.tsx";
import PasswordEye from "../../components/PasswordEye.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import PasswordRequirements from "../../components/PasswordRequirements.tsx";
import TurnstileWidget from "../../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../../lib/captcha.ts";
import { guide } from "../../lib/authErrors.ts";
import { MIN_PASSWORD_LENGTH, passwordPolicyMet } from "../../lib/password.ts";
import { isEmailFormat } from "../../lib/validation.ts";
import { supabase } from "../../lib/supabase.ts";

interface RequestForm {
  firstName: string;
  lastName: string;
  email: string;
  hospital: string;
  password: string;
  confirmPassword: string;
}

type FieldErrors = Partial<Record<keyof RequestForm, string>>;

const blankForm: RequestForm = {
  firstName: "",
  lastName: "",
  email: "",
  hospital: "",
  password: "",
  confirmPassword: "",
};

/**
 * Administrator access request. Creates the auth account with
 * `requested_role: "admin"` — the DB signup trigger marks it `pending`, and a
 * superadmin confirms it (supabase/functions/superadmin-approvals). There is
 * no clinician self-registration: clinicians are created by admins.
 */
export default function AdminRequestAccess() {
  const [form, setForm] = useState<RequestForm>(blankForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  function update<K extends keyof RequestForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(): boolean {
    const next: FieldErrors = {};

    if (form.firstName.trim().length === 0) next.firstName = "Enter your first name.";
    if (form.lastName.trim().length === 0) next.lastName = "Enter your last name.";

    if (form.email.trim().length === 0) {
      next.email = "Enter your email address.";
    } else if (!isEmailFormat(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }

    if (!passwordPolicyMet(form.password)) {
      next.password = `Use ${MIN_PASSWORD_LENGTH}+ characters with lowercase, uppercase letters, numbers, and symbols.`;
    }

    if (form.confirmPassword !== form.password) {
      next.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            requested_role: "admin",
            requested_hospital: form.hospital.trim() === "" ? null : form.hospital.trim(),
          },
          captchaToken: captchaToken ?? undefined,
        },
      });

      if (error != null) {
        setFormError(guide(error));
        return;
      }

      // Email confirmation applies to admin accounts: the inbox link verifies
      // the address before the superadmins can approve the request.
      setSent(form.email.trim());
    } catch (cause) {
      console.error("[palse admin request]", cause);
      setFormError("Request failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent != null) {
    return (
      <AuthFormShell>
        <CheckInbox
          email={sent}
          title="Confirm your email"
          description={
            <>
              We sent a confirmation link to <strong>{sent}</strong>. After you
              confirm it, your administrator request goes to the superadmins for
              approval — you&apos;ll be able to sign in once they confirm you.
            </>
          }
        >
          <Link
            to="/admin/signin"
            className="rounded-lg border border-theme-line px-5 py-2.5 text-center text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
          >
            Go to sign in
          </Link>
        </CheckInbox>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell>
      {/* Chrome-less flow: explicit exit back to the administrator sign-in. */}
      <AuthBackLink to="/admin/signin" label="Administrator sign-in" />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Request administrator access</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Administrator accounts are created by request and confirmed by the
          superadmins before you can organize a hospital.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            id="request-first-name"
            label="First name"
            name="firstName"
            autoComplete="given-name"
            placeholder="Maria"
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            error={fieldErrors.firstName}
            disabled={pending}
            autoFocus
          />
          <FormInput
            id="request-last-name"
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            placeholder="Zardoya"
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            error={fieldErrors.lastName}
            disabled={pending}
          />
        </div>

        <FormInput
          id="request-email"
          label="Email address"
          hint="This email is used for confirmation, approval updates and password recovery."
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          error={fieldErrors.email}
          disabled={pending}
        />

        <FormInput
          id="request-hospital"
          label="Hospital or organization (optional)"
          hint="Shown to the superadmins when reviewing the request."
          name="hospital"
          placeholder="e.g. St. Mary's Neonatal Unit"
          value={form.hospital}
          onChange={(event) => update("hospital", event.target.value)}
          disabled={pending}
        />

        <div>
          <FormInput
            id="request-password"
            label="Password"
            hint={`${MIN_PASSWORD_LENGTH}+ characters with lowercase and uppercase letters, numbers, and symbols.`}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            error={fieldErrors.password}
            disabled={pending}
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
          id="request-confirm-password"
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={form.confirmPassword}
          onChange={(event) => update("confirmPassword", event.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={pending}
        />

        <TurnstileWidget
          className="w-[286px] max-w-full"
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        <PrimaryButton pending={pending} disabled={isCaptchaEnabled() && captchaToken == null}>
          Submit request
        </PrimaryButton>
      </form>

      <p className="mt-8 text-sm text-theme-gray">
        Already a confirmed administrator?{" "}
        <Link
          to="/admin/signin"
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthFormShell>
  );
}
