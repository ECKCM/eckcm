import { Toolbar } from "@/components/shared/toolbar";

export default function UpjStaffSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="home-gradient min-h-screen">
      <div className="absolute top-4 right-4 z-10">
        <Toolbar />
      </div>
      {children}
    </div>
  );
}
