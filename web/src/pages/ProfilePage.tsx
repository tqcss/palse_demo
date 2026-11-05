import ChangePasswordPanel from "../components/profile/ChangePasswordPanel.tsx";
import ProfileIdentityPanel from "../components/profile/ProfileIdentityPanel.tsx";
import SignOutOthersPanel from "../components/profile/SignOutOthersPanel.tsx";
import PageHeader from "../components/ui/PageHeader.tsx";
import { usePageTitle } from "../hooks/usePageTitle.ts";

/**
 * Account profile — one page (like the admin console): information,
 * security (change password + sign out other sessions). The old separate
 * /profile/security tab is folded in here.
 */
export default function ProfilePage() {
  usePageTitle("Profile");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Settings · Manage your account"
        title="Profile"
        subtitle="Information and security — shown to your team in the clinical console."
      />

      <ProfileIdentityPanel />

      <ChangePasswordPanel />
      <SignOutOthersPanel />
    </div>
  );
}
