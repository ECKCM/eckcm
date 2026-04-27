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
  Mail,
  Link2,
  Printer,
  HandCoins,
  Sheet,
  BookOpen,
  Hotel,
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
  permissions: string[];
}

const navLinks = [
  { href: "/admin/registrations", label: "Registrations", icon: FileText, exact: true, permission: "participant.read" },
  { href: "/admin/participants", label: "Participants", icon: UserCheck, exact: false, permission: "participant.read" },
  { href: "/admin/registrations/create", label: "Manual Registration", icon: ClipboardPlus, exact: true, permission: "participant.update" },
  { href: "/admin/events", label: "Events", icon: Calendar, exact: false, permission: "event.manage" },
  { href: "/admin/room-groups", label: "Room Assignment", icon: BedDouble, exact: false, permission: "group.read" },
  { href: "/admin/lodging/upj-rooms", label: "UPJ Lodging", icon: Hotel, exact: false, permission: "group.read" },
  { href: "/admin/invoices", label: "Invoices", icon: FileText, exact: false, permission: "invoice.read" },
  { href: "/admin/inventory", label: "Inventory", icon: Package, exact: false, permission: "participant.read" },
  { href: "/admin/airport", label: "Airport", icon: Plane, exact: false, permission: "participant.read" },
  { href: "/admin/checkin", label: "Check-in", icon: ScanLine, exact: false, permission: "checkin.main" },
  { href: "/admin/settings/links", label: "Links", icon: Link2, exact: false, permission: "links.manage" },
  { href: "/admin/guardian-consents", label: "Guardian Consents", icon: ShieldCheck, exact: false, permission: "participant.read" },
  { href: "/admin/manual-payments", label: "Zelle / Check", icon: DollarSign, exact: false, permission: "settings.manage" },
  { href: "/admin/funding", label: "Funding Tracker", icon: HandCoins, exact: false, permission: "settings.manage" },
  { href: "/admin/audit", label: "Audit Logs", icon: ScrollText, exact: false, permission: "audit.read" },
  { href: "/admin/users", label: "Users", icon: Users, exact: false, permission: "user.manage" },
];

const printLinks = [
  { href: "/admin/print/registrations", label: "Registration Summaries", icon: Printer, permission: "print.registration" },
  { href: "/admin/print/lanyard", label: "Lanyards", icon: Printer, permission: "print.lanyard" },
  { href: "/admin/print/qr-cards", label: "QR Cards", icon: Printer, permission: "print.qrcard" },
];

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
  { href: "/admin/settings/email", label: "Email", icon: Mail },
  { href: "/admin/settings/google-sheets", label: "Google Sheets", icon: Sheet },
  { href: "/admin/settings/booklet", label: "Booklet", icon: BookOpen },
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

export function AdminSidebar({ events, permissions }: AdminSidebarProps) {
  const pathname = usePathname();
  const hasPermission = (code: string | null) =>
    code === null || permissions.includes(code);
  const showSettings = permissions.includes("settings.manage");

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
              {/* Dashboard */}
              <SidebarMenuItem>
                <NavLink href="/admin" isActive={pathname === "/admin"} icon={LayoutDashboard}>
                  Dashboard
                </NavLink>
              </SidebarMenuItem>

              {navLinks.filter((link) => hasPermission(link.permission)).map((link) => (
                <SidebarMenuItem key={link.href}>
                  <NavLink
                    href={link.href}
                    isActive={link.exact ? pathname === link.href : pathname.startsWith(link.href)}
                    icon={link.icon}
                  >
                    {link.label}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Print */}
        <SidebarGroup>
          <SidebarGroupLabel>Print</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {printLinks.filter((link) => hasPermission(link.permission)).map((link) => (
                <SidebarMenuItem key={link.href}>
                  <NavLink
                    href={link.href}
                    isActive={pathname === link.href}
                    icon={link.icon}
                  >
                    {link.label}
                  </NavLink>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings — only shown to roles with settings.manage */}
        {showSettings && (
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
        )}

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
