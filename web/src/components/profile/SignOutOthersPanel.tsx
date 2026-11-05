import { useState } from "react";

import ConfirmDialog from "../ConfirmDialog.tsx";
import Notice from "../Notice.tsx";
import Panel from "../Panel.tsx";
import { FALLBACK_ERROR_MESSAGE, guide } from "../../lib/authErrors.ts";
import { supabase } from "../../lib/supabase.ts";

/**
 * "Sign out other sessions" panel, shared by the clinician and admin profile
 * pages: ends every session except the current one (token revocation
 * included) after a destructive confirm.
 */
export default function SignOutOthersPanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneVisible, setDoneVisible] = useState(false);

  async function handleSignOutOthers() {
    if (pending) return;
    setPending(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "others",
      });
      if (signOutError != null) throw signOutError;
      setConfirmOpen(false);
      setDoneVisible(true);
      window.setTimeout(() => setDoneVisible(false), 4000);
    } catch (caught) {
      console.error("[palse] sign-out-others failed", caught);
      setError(guide(caught, FALLBACK_ERROR_MESSAGE));
      setConfirmOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Sign out other sessions">
        <p className="text-sm text-theme-gray">
          Signed in on another device or browser? Ending those sessions keeps
          them from holding an open account — your current session stays
          active.
        </p>
        <div className="flex justify-end border-t border-theme-line pt-5">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={pending}
            className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
          >
            Sign out other sessions
          </button>
        </div>
      </Panel>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {doneVisible ? (
        <Notice tone="success">All other sessions have been signed out.</Notice>
      ) : null}

      {confirmOpen ? (
        <ConfirmDialog
          title="Sign out other sessions"
          question="Every session except this one will be signed out and its tokens revoked. Any unsaved work in those windows is lost."
          confirmLabel="Sign out others"
          destructive
          pending={pending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void handleSignOutOthers()}
        />
      ) : null}
    </div>
  );
}
