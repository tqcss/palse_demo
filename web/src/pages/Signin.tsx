import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AuthFormShell from "../components/AuthFormShell.tsx";
import { AuthSplash } from "../components/AuthGuard.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import PasswordEye from "../components/PasswordEye.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import TurnstileWidget from "../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../lib/captcha.ts";
import { useAuth } from "../context/useAuth";
import { guide } from "../lib/authErrors.ts";
import { isPrcFormat } from "../lib/validation.ts";
import { supabase } from "../lib/supabase.ts";

interface Errors {
  prc: string | null;
  password: string | null;
  form: string | null;
}

const blankErrors: Errors = { prc: null, password: null, form: null };

export default function Signin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { loading } = useAuth();

  const [prc, setPrc] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(blankErrors);

  const isIdleSignOut = searchParams.get("idle") === "1";
  const cameFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const destination = cameFrom && cameFrom !== "/signin" ? cameFrom : "/dashboard";

  function validate(): boolean {
    const next: Errors = {
      prc: prc.trim().length === 0
        ? "Enter your PRC number."
        : !isPrcFormat(prc)
          ? "PRC numbers are 6-9 digits — enter them without separators."
          : null,
      password: password.length === 0 ? "Enter your password." : null,
      form: null,
    };
    setErrors(next);
    return next.prc === null && next.password === null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    try {
      // The PRC number is the sign-in identity: an exact-match RPC resolves
      // it to the account email, then the password check proceeds normally.
      // All misses (unknown PRC, inactive/pending account, no PRC on record)
      // resolve to the same message — no existence oracles.
      const { data: resolvedEmail, error: lookupError } =
        await supabase.rpc("sign_in_email_for_prc", { p_prc: prc.trim() });
      if (lookupError != null) throw lookupError;

      const signInEmail =
        typeof resolvedEmail === "string" && resolvedEmail.trim() !== ""
          ? resolvedEmail.trim()
          : null;

      if (signInEmail != null) {
        const { error } = await supabase.auth.signInWithPassword({
          email: signInEmail,
          password,
          options: { captchaToken: captchaToken ?? undefined },
        });
        if (error != null) {
          setErrors({ ...blankErrors, form: guide(error) });
          return;
        }
        await navigate(destination, { replace: true });
        return;
      }

      setErrors({
        ...blankErrors,
        form:
          "No active clinician account matches this PRC number — check it, or ask your administrator.",
      });
    } catch (cause) {
      console.error("[palse signin]", cause);
      setErrors({ ...blankErrors, form: "Sign-in failed. Please try again." });
    } finally {
      setPending(false);
    }
  }

  if (loading) return <AuthSplash />;

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Sign in with your PRC number and password to access the clinical
          dashboard.
        </p>
      </div>

      {isIdleSignOut ? (
        <Notice tone="info" className="mb-5">
          You were signed out after 15 minutes of inactivity. Please sign in again.
        </Notice>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}

        <FormInput
          id="prc"
          label="PRC number"
          hint="Your license number from the PRC — the one your administrator registered."
          type="text"
          name="username"
          autoComplete="username"
          inputMode="numeric"
          placeholder="e.g. 0102034"
          value={prc}
          onChange={(event) =>
            setPrc(event.target.value.replace(/[^0-9]/g, ""))
          }
          error={errors.prc}
          disabled={pending}
          autoFocus
        />

        <FormInput
          id="password"
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

        <div className="flex justify-end">
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

      <div className="mt-8 flex flex-col gap-2 text-sm text-theme-gray">
        <p>
          Lost access to your password?{" "}
          <Link
            to="/reset-request"
            className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
          >
            Request a new temporary password
          </Link>{" "}
          from your administrator.
        </p>
        <p>
          Administrator?{" "}
          <Link
            to="/admin/signin"
            className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
          >
            Use the admin sign-in
          </Link>
        </p>
      </div>
    </AuthFormShell>
  );
}
