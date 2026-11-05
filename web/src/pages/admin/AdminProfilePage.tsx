import ChangePasswordPanel from "../../components/profile/ChangePasswordPanel.tsx";
import ProfileIdentityPanel from "../../components/profile/ProfileIdentityPanel.tsx";
import ProfilePhotoPanel from "../../components/profile/ProfilePhotoPanel.tsx";
import SignOutOthersPanel from "../../components/profile/SignOutOthersPanel.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import { useAuth } from "../../context/useAuth.ts";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";

/**
 * Administrator profile — the SAME composition as the clinical profile page
 * (photo · information · change password · sessions): shared panels,
 * identical flow, only the header eyebrow differs.
 */
export default function AdminProfilePage() {
  useAdminPageTitle("Profile");

  const { profile, refetchProfile } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account · Your administrator profile"
        title="Profile"
        subtitle="Displayed to your organization's members in the console."
      />

      <ProfilePhotoPanel
        profile={profile}
        fallbackFirst={profile?.first_name ?? ""}
        fallbackLast={profile?.last_name ?? ""}
        refetchProfile={refetchProfile}
      />

      <ProfileIdentityPanel />

      <ChangePasswordPanel />
      <SignOutOthersPanel />
    </div>
  );
}
