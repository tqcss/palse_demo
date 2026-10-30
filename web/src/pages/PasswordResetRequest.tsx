import { useState } from "react";
import { Link } from "react-router-dom";

import AuthFormShell from "../components/AuthFormShell.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import TurnstileWidget from "../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../lib/captcha.ts";
import { isEmailFormat } from "../lib/validation.ts";
import { requestPasswordReset } from "../lib/admin.ts";

/**
 * Clinician password help (no email flow for clinicians): asks the hospital's
 * administrator for a new temporary password. The endpoint answers silently
 * ("accepted no matter what"), so it cannot leak which emails exist.
 */
export default function PasswordResetRequest() {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email: string | null }>({ email: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  function validate(): boolean {
    const email_ = email.trim().length === 0
      ? "Enter your email address."
      : !isEmailFormat(email.trim())
        ? "Enter a valid email address."
        : null;
    setFieldErrors({ email: email_ });
    return email_ == null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    setFormError(null);
    try {
      await requestPasswordReset(email.trim(), note.trim() === "" ? null : note.trim());
      setSent(email.trim());
    } catch (cause) {
      console.error("[palse password request]", cause);
      setFormError("Could not send the request. Please try again.");
      setPending(false);
    }
  }

  if (sent != null) {
    return (
      <AuthFormShell>
        <div className="mx-auto max-w-90 py-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-theme-cream">
            <span
              aria-hidden
              className="font-mono text-2xl font-bold text-theme-maroon"
            >
              !
            </span>
          </div>
          <h1 className="text-2xl font-bold">Request sent to your administrator</h1>
          <p className="mt-2 text-sm text-theme-gray">
            If an administrator account exists for your hospital, they&apos;ve
            received this request and will issue a new temporary password. You
            can ask them in person too — they&apos;ll find your request in the
            admin console under <strong>Members</strong>.
          </p>
          <Link
            to="/signin"
            className="mt-6 inline-block rounded-lg border border-theme-line px-5 py-2.5 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
          >
            Back to sign in
          </Link>
        </div>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Lost your password?</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Clinician accounts don&apos;t use email passwords — send a reset
          request to your organization&apos;s administrator and pick up a new
          temporary password from them.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <FormInput
          id="reset-request-email"
          label="Your sign-in email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
          disabled={pending}
          autoFocus
        />

        <FormInput
          id="reset-request-note"
          label="Note for the administrator (optional)"
          name="note"
          placeholder="e.g. Ward B — password forgot after leave"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={pending}
          required
        />

        <TurnstileWidget
          className="w-[286px] max-w-full"
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        <PrimaryButton
          pending={pending}
          disabled={isCaptchaEnabled() && captchaToken == null}
        >
          Send request
        </PrimaryButton>
      </form>

      <p className="mt-8 text-sm text-theme-gray">
        Admin with a confirmed email?{" "}
        <Link
          to="/forgot-password"
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Use the email reset instead
        </Link>
      </p>
    </AuthFormShell>
  );
}
