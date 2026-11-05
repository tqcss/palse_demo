import { useRef, useState } from "react";

import Avatar from "../ui/Avatar.tsx";
import Notice from "../Notice.tsx";
import Panel from "../Panel.tsx";
import PrimaryButton from "../PrimaryButton.tsx";
import { guide } from "../../lib/authErrors.ts";
import { supabase } from "../../lib/supabase.ts";
import type { Profile } from "../../context/auth-context.ts";

/** Hard limits for the profile-photo upload. */
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

/**
 * Profile-photo panel, shared by the clinician and admin profile pages:
 * type/size validation, timestamped upload into the owner-scoped
 * `avatars/<uid>/` folder, `profiles.avatar_url` update, best-effort removal
 * of the replaced file, and a profile refetch so chips update everywhere.
 */
export default function ProfilePhotoPanel({
  profile,
  fallbackFirst,
  fallbackLast,
  refetchProfile,
}: {
  profile: Profile | null;
  /** Shown on the initials fallback when no name is saved yet. */
  fallbackFirst: string;
  fallbackLast: string;
  refetchProfile: () => Promise<unknown>;
}) {
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

  return (
    <Panel title="Profile photo">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar
          first={fallbackFirst}
          last={fallbackLast}
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
  );
}
