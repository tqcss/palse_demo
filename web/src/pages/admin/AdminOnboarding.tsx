import { useState } from "react";
import { useNavigate } from "react-router-dom";

import MsIcon from "../../components/MsIcon.tsx";
import Notice from "../../components/Notice.tsx";
import PrimaryButton from "../../components/PrimaryButton.tsx";
import { useAuth } from "../../context/useAuth";
import { guide } from "../../lib/authErrors.ts";
import { joinOrganization, createOrganization } from "../../lib/admin.ts";

/**
 * First-run step for approved administrators: create a brand-new organization
 * (hospital) or join an existing one with the invite code its admin shares
 * with you. Required before the admin console unlocks.
 */
export default function AdminOnboarding() {
  const navigate = useNavigate();
  const { profile, refetchProfile } = useAuth();

  const [orgName, setOrgName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pending, setPending] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullName =
    [profile?.first_name, profile?.last_name].filter((v) => v?.trim()).join(" ") ||
    "Administrator";

  const codeProblems = (): string | null => {
    const code = inviteCode.trim().toUpperCase();
    if (code.length === 0) return "Enter an invite code.";
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
      return "Invite codes are 8 characters (letters and digits, no I/L/O/1/5).";
    }
    return null;
  };

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending != null) return;

    if (orgName.trim().length < 2 || orgName.trim().length > 120) {
      setError("Organization name must be 2-120 characters.");
      return;
    }

    setPending("create");
    setError(null);
    try {
      await createOrganization(orgName.trim());
      await refetchProfile();
      navigate("/admin", { replace: true });
    } catch (cause) {
      console.error("[palse org create]", cause);
      setError(guide(cause, "Could not create the organization. Try again."));
      setPending(null);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending != null) return;

    const problem = codeProblems();
    if (problem != null) {
      setError(problem);
      return;
    }

    setPending("join");
    setError(null);
    try {
      await joinOrganization(inviteCode.trim().toUpperCase());
      await refetchProfile();
      navigate("/admin", { replace: true });
    } catch (cause) {
      console.error("[palse org join]", cause);
      setError(guide(cause, "Could not join the organization. Try again."));
      setPending(null);
    }
  }

  const formClass = "flex flex-col items-stretch gap-4";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Administrator setup
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">
          Welcome, {fullName}
        </h1>
        <p className="text-sm text-theme-gray">
          Everything on Pal.se lives inside one organization — your hospital or
          unit. Pick an existing one with its invite code, or start a new one.
        </p>
      </header>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <section className="rounded-xl border border-theme-line bg-white p-6 shadow-sm md:p-7">
        <div className="mb-4 flex items-center gap-2.5">
          <MsIcon name="domain" className="text-[22px] text-theme-maroon" optical={22} />
          <h2 className="text-lg font-bold text-theme-ink">Create a new organization</h2>
        </div>
        <p className="mb-4 text-sm text-theme-gray">
          Choose this if your hospital doesn&apos;t use Pal.se yet. You become
          the first administrator and get an invite code for colleagues.
        </p>
        <form className={formClass} onSubmit={handleCreate} noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-gray">Organization name</span>
            <input
              type="text"
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="e.g. St. Mary's Neonatal Unit"
              maxLength={120}
              disabled={pending != null}
              className="rounded-lg border border-theme-line px-3 py-2.5 text-sm text-theme-ink transition-colors placeholder:text-theme-gray/60 focus:border-theme-maroon focus:outline-none disabled:opacity-60"
            />
          </label>
          <div>
            <PrimaryButton pending={pending === "create"} disabled={pending != null}>
              Create organization
            </PrimaryButton>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-theme-line bg-white p-6 shadow-sm md:p-7">
        <div className="mb-4 flex items-center gap-2.5">
          <MsIcon name="key" className="text-[22px] text-theme-maroon" optical={22} />
          <h2 className="text-lg font-bold text-theme-ink">Join an existing organization</h2>
        </div>
        <p className="mb-4 text-sm text-theme-gray">
          Ask the hospital&apos;s administrator for its invite code (they&apos;ll
          find it under Organization).
        </p>
        <form className={formClass} onSubmit={handleJoin} noValidate>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-gray">Invite code</span>
            <input
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="e.g. K7QM2ZPX"
              maxLength={8}
              disabled={pending != null}
              autoCapitalize="characters"
              className="rounded-lg border border-theme-line px-3 py-2.5 font-mono text-sm uppercase tracking-widest text-theme-ink transition-colors placeholder:text-theme-gray/60 focus:border-theme-maroon focus:outline-none disabled:opacity-60"
            />
          </label>
          <div>
            <PrimaryButton pending={pending === "join"} disabled={pending != null}>
              Join organization
            </PrimaryButton>
          </div>
        </form>
      </section>
    </div>
  );
}
