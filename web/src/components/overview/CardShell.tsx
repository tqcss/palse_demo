/**
 * Shared card shell for the risk-overview section: token radii/border/shadow
 * with the subtle white→cream gradient required for the two dashboard cards.
 * (ui/Panel stays available elsewhere; this one matches the reference design.)
 */
export function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-card border border-theme-line bg-gradient-to-b from-theme-white to-theme-cream p-5 shadow-card md:p-6">
      {children}
    </div>
  );
}

export default CardShell;
