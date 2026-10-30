import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import AuthFormShell from "../../components/AuthFormShell.tsx";
import FormInput from "../../components/FormInput.tsx";
import Notice from "../../components/Notice.tsx";
import PasswordEye from "../../components/PasswordEye.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import TurnstileWidget from "../../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../../lib/captcha.ts";
import { useAuth } from "../../context/useAuth";
import { guide } from "../../lib/authErrors.ts";
import { isEmailFormat } from "../../lib/validation.ts";
import { supabase } from "../../lib/supabase.ts";

interface Errors {
  email: string | null;
  password: string | null;
  form: string | null;
}

const blankErrors: Errors = { email: null, password: null, form: null };

/**
 * Administrator sign-in. Clinicians use the regular /signin page — the auth
 * pool is the same, this entry point routes into the /admin console.
 */
export default function AdminSignin() {
  const navigate = useNavigate();
  const { loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(blankErrors);

  function validate(): boolean {
    const next: Errors = {
      email: email.trim().length === 0
        ? "Enter your email address."
        : !isEmailFormat(email.trim())
          ? "Enter a valid email address."
          : null,
      password: password.length === 0 ? "Enter your password." : null,
      form: null,
    };
    setErrors(next);
    return next.email === null && next.password === null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });

      if (error != null) {
        setErrors({ ...blankErrors, form: guide(error) });
        return;
      }

      // The admin guards take it from here: pending accounts see the approval
      // screen, active admins without an org go to onboarding, the rest to /admin.
      await navigate("/admin", { replace: true });
    } catch (cause) {
      console.error("[palse admin signin]", cause);
      setErrors({ ...blankErrors, form: "Sign-in failed. Please try again." });
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <AuthFormShell>
        <div className="text-sm text-theme-gray">Loading…</div>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Administrator sign in</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Manage your organization&apos;s accounts, membership and audit trail.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}

        <FormInput
          id="admin-email"
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={pending}
          autoFocus
        />

        <FormInput
          id="admin-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={pending}
          trailing={
            <PasswordEye
              visible={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
          }
        />

        <div className="flex justify-between gap-4">
          <Link
            to="/signin"
            className="text-sm font-medium text-theme-gray underline-offset-4 hover:underline"
          >
            Clinician? Use the regular sign-in
          </Link>
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-theme-maroon underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <TurnstileWidget
          className="w-[286px] max-w-full"
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        <PrimaryButton pending={pending} disabled={isCaptchaEnabled() && captchaToken == null}>
          Sign in
        </PrimaryButton>
      </form>

      <p className="mt-8 text-sm text-theme-gray">
        Need administrator access?{" "}
        <Link
          to="/admin/request"
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Request an account
        </Link>{" "}
        — new requests are confirmed by the superadmins.
      </p>
    </AuthFormShell>
  );
}
