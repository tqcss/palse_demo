import { useEffect, useRef, useState } from "react";

import Avatar from "../components/ui/Avatar.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import SettingsTabs from "../components/SettingsTabs.tsx";
import { guide } from "../lib/authErrors.ts";
import { supabase } from "../lib/supabase.ts";
import { useAuth } from "../context/useAuth.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

interface ProfileForm {
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
}

/** Hard limits for the profile-photo upload (see handleUpload). */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoTypeError(file: File): string | null {
  if (!ACCEPTED_PHOTO_TYPES.has(file.type)) {
    return "Choose a JPG, PNG or WebP image.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "The photo must be 2 MB or smaller.";
  }
  return null;
}

function fileExtensionFor(file: File): string {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export default function ProfilePage() {
  usePageTitle("Profile");

  const { user, profile, refetchProfile } = useAuth();

  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    department: "",
    jobTitle: "",
  });
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  /* ------------------------------ photo upload ----------------------------- */
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function pickPhoto(): void {
    if (!uploading) fileInputRef.current?.click();
  }

  async function handlePhotoChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0] ?? null;
    // Reset so re-selecting the same file re-fires the change event.
    event.target.value = "";
    if (file == null) return;

    const problem = photoTypeError(file);
    if (problem != null) {
      setUploadError(problem);
      return;
    }

    const target = profile;
    if (target == null) {
      setUploadError("Account data unavailable — reload and try again.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    const oldUrl = target.avatar_url;
    try {
      // One flat folder per user: avatars/<uid>/avatar-<ts>.<ext>. The
      // timestamped name avoids CDN-cached colliding versions, and the
      // first-level folder keeps storage policies owner-scoped.
      const path = `${target.id}/avatar-${Date.now()}.${fileExtensionFor(file)}`;
      const { error: uploadError_ } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: false,
          cacheControl: "3600",
          contentType: file.type,
        });
      if (uploadError_ != null) throw uploadError_;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);
      const publicUrl = urlData?.publicUrl ?? null;
      if (publicUrl == null) throw new Error("no public URL");

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", target.id);
      if (updateError != null) throw updateError;

      // Best-effort cleanup of the replaced file (never blocks the save).
      if (oldUrl != null && oldUrl !== publicUrl && oldUrl.includes(`/avatars/${target.id}/`)) {
        const fileName = oldUrl.split("/avatars/")[1]?.split("?")[0];
        if (fileName != null) {
          void supabase.storage.from("avatars").remove([fileName]);
        }
      }

      await refetchProfile();
    } catch (cause) {
      console.error("[palse] avatar upload failed", cause);
      setUploadError(guide(cause, "Could not upload the photo. Please try again."));
    } finally {
      setUploading(false);
    }
  }


  // Synch the form once the profile (or the metadata fallback) arrives.
  useEffect(() => {
    if (hydrated) return;
    const first =
      profile?.first_name ?? (user?.user_metadata?.first_name as string | undefined) ?? "";
    const last =
      profile?.last_name ?? (user?.user_metadata?.last_name as string | undefined) ?? "";
    const department = profile?.department ?? "";
    const jobTitle = profile?.job_title ?? "";
    setForm({ firstName: first, lastName: last, department, jobTitle });
    setHydrated(true);
  }, [hydrated, profile, user]);

  const email = user?.email ?? "—";
  const memberSince =
    user?.created_at != null
      ? new Date(user.created_at).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : null;

  async function handleSave() {
    if (pending) return;
    setError(null);

    if (form.firstName.trim() === "" && form.lastName.trim() === "") {
      setError("Keep at least a name on record — both fields can't be empty.");
      return;
    }

    setPending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
        },
      });
      if (updateError != null) throw updateError;

      if (profile != null) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            first_name: form.firstName.trim() || "Unknown",
            last_name: form.lastName.trim() || "Unknown",
            department: form.department.trim() === "" ? null : form.department.trim(),
            job_title: form.jobTitle.trim() === "" ? null : form.jobTitle.trim(),
          })
          .eq("id", profile.id);
        if (profileError != null) throw profileError;
      }

      setSavedVisible(true);
      window.setTimeout(() => setSavedVisible(false), 4000);
    } catch (saveError) {
      console.error("[palse] profile save failed", saveError);
      setError(guide(saveError, "Could not save your profile. Please try again."));
    } finally {
      setPending(false);
    }
  }

  function patch(update: Partial<ProfileForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Settings · Manage your account
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Profile</h1>
      </header>

      <SettingsTabs />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {savedVisible ? (
        <Notice tone="success">Profile changes saved.</Notice>
      ) : null}

      <Panel title="Profile photo">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar
            first={form.firstName}
            last={form.lastName}
            src={profile?.avatar_url ?? null}
            size="lg"
          />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-sm text-theme-ink-soft">
              Shown beside your name in the top bar and account menu.
            </p>
            <p className="text-xs text-theme-gray">
              JPG, PNG or WebP · up to 2 MB
            </p>
            <div className="mt-1">
              <PrimaryButton
                type="button"
                pending={uploading}
                onClick={pickPhoto}
                className="w-auto px-4"
              >
                {profile?.avatar_url ? "Change photo" : "Upload photo"}
              </PrimaryButton>
            </div>
          </div>
        </div>
        {uploadError ? (
          <div className="mt-3">
            <Notice tone="danger">{uploadError}</Notice>
          </div>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => void handlePhotoChange(event)}
        />
      </Panel>

      <Panel title="Profile information">
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="profile-first-name"
            label="First name"
            value={form.firstName}
            onChange={(event) => patch({ firstName: event.target.value })}
          />
          <FormInput
            id="profile-last-name"
            label="Last name"
            value={form.lastName}
            onChange={(event) => patch({ lastName: event.target.value })}
          />
          <FormInput
            id="profile-department"
            label="Department"
            placeholder="e.g. Neonatology"
            value={form.department}
            onChange={(event) => patch({ department: event.target.value })}
          />
          <FormInput
            id="profile-job-title"
            label="Job title"
            placeholder="e.g. Neonatologist"
            value={form.jobTitle}
            onChange={(event) => patch({ jobTitle: event.target.value })}
          />

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-theme-gray">Email</span>
            <span className="text-sm text-theme-ink-soft">{email}</span>
            <span className="text-xs text-theme-gray">
              Set by your administrator — ask them for new temporary passwords.
            </span>
          </div>
          {memberSince != null ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-theme-gray">Member since</span>
              <span className="text-sm text-theme-ink-soft">{memberSince}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
          <span className="text-xs text-theme-gray">
            Displayed to your team in the top bar.
          </span>
          <PrimaryButton
            pending={pending}
            onClick={() => void handleSave()}
            className="w-auto px-5"
          >
            Save changes
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}
