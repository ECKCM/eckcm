"use client";

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
} from "@/components/ui/sidebar";

interface AdminSidebarProps {
  events: {
    id: string;
    name_en: string;
    name_ko: string | null;
    year: number;
    is_active: boolean;
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
  { href: "/admin/settings/airport-rides", label: "Airport Rides", icon: Plane },
  { href: "/admin/settings/configuration", label: "Configuration", icon: Settings2 },
];

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
                <SidebarMenuButton asChild isActive={pathname === "/admin"}>
                  <Link href="/admin">
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/events")}
                >
                  <Link href="/admin/events">
                    <Calendar />
                    <span>Events</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/participants")}
                >
                  <Link href="/admin/participants">
                    <UserCheck />
                    <span>Participants</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/room-groups")}
                >
                  <Link href="/admin/room-groups">
                    <BedDouble />
                    <span>Room Groups</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/invoices")}
                >
                  <Link href="/admin/invoices">
                    <FileText />
                    <span>Invoices</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/inventory")}
                >
                  <Link href="/admin/inventory">
                    <Package />
                    <span>Inventory</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/airport")}
                >
                  <Link href="/admin/airport">
                    <Plane />
                    <span>Airport</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/admin/audit")}
                >
                  <Link href="/admin/audit">
                    <ScrollText />
                    <span>Audit Logs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/admin/users")}
                  >
                    <Link href="/admin/users">
                      <Users />
                      <span>Users</span>
                    </Link>
                  </SidebarMenuButton>
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
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === link.href}
                  >
                    <Link href={link.href}>
                      <link.icon />
                      <span>{link.label}</span>
                    </Link>
                  </SidebarMenuButton>
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
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === `/admin/events/${event.id}`}
                    >
                      <Link href={`/admin/events/${event.id}`}>
                        <Calendar />
                        <span>
                          {event.name_en} ({event.year})
                        </span>
                      </Link>
                    </SidebarMenuButton>
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
            <SidebarMenuButton asChild>
              <Link href="/dashboard">
                <Settings />
                <span>Back to Dashboard</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
