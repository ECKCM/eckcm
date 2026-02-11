import { Toolbar } from "@/components/shared/toolbar";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <Toolbar />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
