import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

import Badge from "../ui/Badge.tsx";
import ConfirmDialog from "../ConfirmDialog.tsx";
import FormInput from "../FormInput.tsx";
import Notice from "../Notice.tsx";
import Panel from "../Panel.tsx";
import PrimaryButton from "../PrimaryButton.tsx";
import RelativeTime from "../ui/RelativeTime.tsx";
import { useToast } from "../ui/toast.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { guide } from "../../lib/authErrors.ts";
import { supabase } from "../../lib/supabase.ts";

interface ProfileForm {
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
}

/**
 * Profile-information panel, shared by the clinician and admin profile pages:
 * name, job title and department editable; email/role/PRC are fixed
 * attributes shown as read-only context. Router-level unsaved-changes guard
 * (link navigation, Back, tab close) is built in.
 */
export default function ProfileIdentityPanel() {
  const { user, profile, refetchProfile } = useAuth();
  const toast = useToast();

  /* ------------------------------ identity form ----------------------------- */
  const email = user?.email ?? "—";
  const memberSince = user?.created_at ?? null;

  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    jobTitle: "",
    department: "",
  });
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
      department: profile?.department ?? "",
    });
    setHydrated(true);
  }, [hydrated, profile, user]);

  const saved = useRef<ProfileForm | null>(null);
  if (profile != null && saved.current == null) {
    saved.current = {
      firstName: profile.first_name,
      lastName: profile.last_name,
      jobTitle: profile.job_title ?? "",
      department: profile.department ?? "",
    };
  }

  const dirty =
    hydrated &&
    saved.current != null &&
    (form.firstName !== saved.current.firstName ||
      form.lastName !== saved.current.lastName ||
      form.jobTitle !== saved.current.jobTitle ||
      form.department !== saved.current.department);

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
            department: form.department.trim() === "" ? null : form.department.trim(),
          })
          .eq("id", profile.id);
        if (profileError != null) throw profileError;
      }
      await refetchProfile();
      saved.current = {
        firstName: form.firstName.trim() || "Unknown",
        lastName: form.lastName.trim() || "Unknown",
        jobTitle: form.jobTitle.trim(),
        department: form.department.trim(),
      };
      toast.push("success", "Profile changes saved.");
    } catch (cause) {
      console.error("[palse profile save]", cause);
      setFormError(guide(cause, "Could not save your profile. Please try again."));
    } finally {
      setPending(false);
    }
  }

  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Profile information">
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="profile-first-name"
            label="First name"
            value={form.firstName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, firstName: event.target.value }))
            }
            disabled={pending}
          />
          <FormInput
            id="profile-last-name"
            label="Last name"
            value={form.lastName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, lastName: event.target.value }))
            }
            disabled={pending}
          />
          <FormInput
            id="profile-job-title"
            label="Job title"
            placeholder="e.g. Neonatologist"
            hint="Free text — displayed next to your name."
            value={form.jobTitle}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, jobTitle: event.target.value }))
            }
            disabled={pending}
          />
          <FormInput
            id="profile-department"
            label="Department"
            placeholder="e.g. Neonatology"
            value={form.department}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, department: event.target.value }))
            }
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
              {isAdmin ? (
                <Badge tone="maroon" icon="shield">
                  Administrator
                </Badge>
              ) : (
                <Badge icon="stethoscope">Clinician</Badge>
              )}
            </span>
          </div>

          {/* Sign-in identity context (clinicians sign in with PRC + password). */}
          {!isAdmin && profile?.prc_number != null ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-theme-gray">
                PRC number
              </span>
              <span className="text-sm text-theme-ink-soft">
                {profile.prc_number}
              </span>
              <span className="text-xs text-theme-gray">
                Your sign-in identity — set at registration. Ask your
                administrator if it needs a correction.
              </span>
            </div>
          ) : null}

          {memberSince != null ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-theme-gray">
                Member since
              </span>
              <span className="text-sm text-theme-ink-soft">
                <RelativeTime iso={memberSince} />
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
          {dirty ? (
            <span className="text-xs text-risk-moderate-fg">Unsaved changes</span>
          ) : null}
          <PrimaryButton
            pending={pending}
            onClick={() => void handleSave()}
            className="w-auto px-5"
          >
            Save changes
          </PrimaryButton>
        </div>
      </Panel>

      {formError ? <Notice tone="danger">{formError}</Notice> : null}

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
