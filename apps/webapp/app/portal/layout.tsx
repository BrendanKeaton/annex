import { PortalSidebar } from "@/components/portal-sidebar";

export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen w-full flex">
      <PortalSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </main>
  );
}
