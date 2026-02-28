"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  CreditCard,
  Settings,
  Settings2,
  Users,
  DollarSign,
  Building2,
  Church,
  Layers,
  LayoutDashboard,
  UserCheck,
  BedDouble,
  FileText,
  ScrollText,
  Scale,
  Package,
  ShieldCheck,
  Plane,
  ScanLine,
  Presentation,
  ClipboardPlus,
  Star,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

interface AdminSidebarProps {
  events: {
    id: string;
    name_en: string;
    name_ko: string | null;
    year: number;
    is_active: boolean;
    is_default: boolean;
  }[];
  isSuperAdmin: boolean;
}

const settingsLinks = [
  { href: "/admin/settings/groups", label: "Registration Groups", icon: Layers },
  { href: "/admin/settings/fees", label: "Fee Categories", icon: DollarSign },
  { href: "/admin/settings/roles", label: "Roles", icon: ShieldCheck },
  { href: "/admin/settings/departments", label: "Departments", icon: Building2 },
  { href: "/admin/settings/churches", label: "Churches", icon: Church },
  { href: "/admin/settings/legal", label: "Legal Pages", icon: Scale },
  { href: "/admin/settings/stripe", label: "Stripe", icon: CreditCard },
  { href: "/admin/settings/lodging", label: "Lodging", icon: BedDouble },
  { href: "/admin/settings/sessions", label: "Sessions", icon: Presentation },
  { href: "/admin/settings/airport-rides", label: "Airport Rides", icon: Plane },
  { href: "/admin/settings/configuration", label: "Configuration", icon: Settings2 },
];

function NavLink({
  href,
  isActive,
  icon: Icon,
  children,
}: {
  href: string;
  isActive: boolean;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuButton
      asChild
      isActive={isActive}
      onClick={() => { if (isMobile) setOpenMobile(false); }}
    >
      <Link href={href}>
        <Icon />
        <span>{children}</span>
      </Link>
    </SidebarMenuButton>
  );
}

export function AdminSidebar({ events, isSuperAdmin }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="text-lg font-bold">ECKCM Admin</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <NavLink href="/admin" isActive={pathname === "/admin"} icon={LayoutDashboard}>Dashboard</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/registrations" isActive={pathname === "/admin/registrations"} icon={FileText}>Registrations</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/registrations/create" isActive={pathname === "/admin/registrations/create"} icon={ClipboardPlus}>Manual Registration</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/events" isActive={pathname.startsWith("/admin/events")} icon={Calendar}>Events</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/participants" isActive={pathname.startsWith("/admin/participants")} icon={UserCheck}>Participants</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/room-groups" isActive={pathname.startsWith("/admin/room-groups")} icon={BedDouble}>Room Groups</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/invoices" isActive={pathname.startsWith("/admin/invoices")} icon={FileText}>Invoices</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/inventory" isActive={pathname.startsWith("/admin/inventory")} icon={Package}>Inventory</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/airport" isActive={pathname.startsWith("/admin/airport")} icon={Plane}>Airport</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/checkin" isActive={pathname.startsWith("/admin/checkin")} icon={ScanLine}>Check-in</NavLink>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <NavLink href="/admin/audit" isActive={pathname.startsWith("/admin/audit")} icon={ScrollText}>Audit Logs</NavLink>
              </SidebarMenuItem>
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <NavLink href="/admin/users" isActive={pathname.startsWith("/admin/users")} icon={Users}>Users</NavLink>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsLinks.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <NavLink href={link.href} isActive={pathname === link.href} icon={link.icon}>
                    {link.label}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Events Quick Access */}
        {events.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Events</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {events.map((event) => (
                  <SidebarMenuItem key={event.id}>
                    <NavLink
                      href={`/admin/events/${event.id}`}
                      isActive={pathname === `/admin/events/${event.id}`}
                      icon={event.is_default ? () => <Star className="fill-yellow-400 text-yellow-400" /> : Calendar}
                    >
                      {event.name_en} ({event.year})
                    </NavLink>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <NavLink href="/dashboard" isActive={false} icon={Settings}>
              Back to Dashboard
            </NavLink>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
