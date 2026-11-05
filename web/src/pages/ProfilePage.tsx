import ChangePasswordPanel from "../components/profile/ChangePasswordPanel.tsx";
import ProfileIdentityPanel from "../components/profile/ProfileIdentityPanel.tsx";
import ProfilePhotoPanel from "../components/profile/ProfilePhotoPanel.tsx";
import SignOutOthersPanel from "../components/profile/SignOutOthersPanel.tsx";
import PageHeader from "../components/ui/PageHeader.tsx";
import { useAuth } from "../context/useAuth.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

/**
 * Account profile — one page (like the admin console): photo, information,
 * security (change password + sign out other sessions). The old separate
 * /profile/security tab is folded in here.
 */
export default function ProfilePage() {
  usePageTitle("Profile");

  const { profile, refetchProfile } = useAuth();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Settings · Manage your account"
        title="Profile"
        subtitle="Photo, information and security — shown to your team in the clinical console."
      />

      <ProfilePhotoPanel
        profile={profile}
        fallbackFirst={
          profile?.first_name ??
          "" // hydrates from the identity panel's profile fetch
        }
        fallbackLast={profile?.last_name ?? ""}
        refetchProfile={refetchProfile}
      />

      <ProfileIdentityPanel />

      <ChangePasswordPanel />
      <SignOutOthersPanel />
    </div>
  );
}
