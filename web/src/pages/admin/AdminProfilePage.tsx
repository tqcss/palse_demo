import ChangePasswordPanel from "../../components/profile/ChangePasswordPanel.tsx";
import ProfileIdentityPanel from "../../components/profile/ProfileIdentityPanel.tsx";
import SignOutOthersPanel from "../../components/profile/SignOutOthersPanel.tsx";
import PageHeader from "../../components/ui/PageHeader.tsx";
import { useAdminPageTitle } from "../../hooks/useAdminPageTitle.ts";

/**
 * Administrator profile — the SAME composition as the clinical profile page
 * (information · change password · sessions): shared panels, identical flow,
 * only the header eyebrow differs.
 */
export default function AdminProfilePage() {
  useAdminPageTitle("Profile");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Account · Your administrator profile"
        title="Profile"
        subtitle="Displayed to your organization's members in the console."
      />

      <ProfileIdentityPanel />

      <ChangePasswordPanel />
      <SignOutOthersPanel />
    </div>
  );
}
