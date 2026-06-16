import {
  Calendar,
  CreditCard,
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
  Mail,
  Link2,
  Printer,
  HandCoins,
  Heart,
  Sheet,
  UtensilsCrossed,
  BookOpen,
  Hotel,
  Map,
  Trees,
  Tag,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

/**
 * Flat, searchable index of every admin destination, used by the global search
 * palette (⌘K). This is intentionally a superset of the sidebar so search can
 * reach pages that aren't pinned in the nav, with extra `keywords` for fuzzy
 * intent matching (e.g. "money" → Zelle/Check, "rooms" → Room Assignment).
 *
 * `permission` mirrors the sidebar's gating:
 *   - string | string[]  → visible if the user has ANY of the listed permissions
 *   - "settings.manage"  → the Settings group gate
 *   - null               → always visible to any admin
 */
export interface NavTarget {
  href: string;
  label: string;
  /** Short group label shown in results (e.g. "Page", "Print", "Settings"). */
  group: "Pages" | "Print" | "Settings";
  icon: LucideIcon;
  permission: string | string[] | null;
  /** Extra terms that should match this destination. */
  keywords?: string[];
}

export const NAV_TARGETS: NavTarget[] = [
  // ─── Main pages ─────────────────────────────────────────────────
  { href: "/admin", label: "Dashboard", group: "Pages", icon: LayoutDashboard, permission: null, keywords: ["home", "overview", "stats", "charts"] },
  { href: "/admin/analytics", label: "Analytics", group: "Pages", icon: BarChart3, permission: "participant.read", keywords: ["report", "revenue", "collections", "payment methods", "money", "zelle", "check", "cash", "total", "stats"] },
  { href: "/admin/registrations", label: "Registrations", group: "Pages", icon: FileText, permission: "participant.read", keywords: ["registrant", "attendee", "signup", "reg"] },
  { href: "/admin/participants", label: "Participants", group: "Pages", icon: UserCheck, permission: "participant.read", keywords: ["people", "person", "members"] },
  { href: "/admin/department-view", label: "Department View", group: "Pages", icon: Building2, permission: ["participant.read", "department.view"], keywords: ["dept", "roster"] },
  { href: "/admin/registrations/create", label: "Register for Others", group: "Pages", icon: ClipboardPlus, permission: "participant.update", keywords: ["new registration", "add", "manual"] },
  { href: "/admin/events", label: "Events", group: "Pages", icon: Calendar, permission: "event.manage", keywords: ["camp", "year", "gathering"] },
  { href: "/admin/room-groups", label: "Room Assignment", group: "Pages", icon: BedDouble, permission: "group.read", keywords: ["rooms", "lodging", "assign", "beds"] },
  { href: "/admin/church-groups", label: "Church Groups", group: "Pages", icon: Church, permission: "group.read", keywords: ["churches", "congregation"] },
  { href: "/admin/lodging/upj-rooms", label: "UPJ Lodging", group: "Pages", icon: Hotel, permission: "group.read", keywords: ["rooms", "dorm", "upj"] },
  { href: "/admin/lodging/willow", label: "Willow Hall", group: "Pages", icon: Trees, permission: "group.read", keywords: ["lodging", "rooms", "willow"] },
  { href: "/admin/lodging/floorplan", label: "Floor Plan", group: "Pages", icon: Map, permission: "group.read", keywords: ["map", "layout", "lodging"] },
  { href: "/admin/invoices", label: "Invoices", group: "Pages", icon: FileText, permission: "invoice.read", keywords: ["billing", "money", "payment", "receipt"] },
  { href: "/admin/inventory", label: "Inventory", group: "Pages", icon: Package, permission: "participant.read", keywords: ["stock", "supplies", "items"] },
  { href: "/admin/airport", label: "Airport", group: "Pages", icon: Plane, permission: "participant.read", keywords: ["shuttle", "pickup", "ride", "flight"] },
  { href: "/admin/checkin", label: "Check-in", group: "Pages", icon: ScanLine, permission: "checkin.main", keywords: ["scan", "qr", "arrival", "checkout"] },
  { href: "/admin/settings/links", label: "Links", group: "Pages", icon: Link2, permission: "links.manage", keywords: ["url", "shortlink"] },
  { href: "/admin/guardian-consents", label: "Guardian Consents", group: "Pages", icon: ShieldCheck, permission: "participant.read", keywords: ["minor", "parent", "consent", "waiver"] },
  { href: "/admin/manual-payments", label: "Zelle / Check", group: "Pages", icon: DollarSign, permission: ["settings.manage", "participant.update"], keywords: ["money", "manual payment", "cash", "zelle", "check"] },
  { href: "/admin/funding", label: "Funding Tracker", group: "Pages", icon: HandCoins, permission: "settings.manage", keywords: ["money", "sponsor", "scholarship", "fund"] },
  { href: "/admin/donations", label: "Donations", group: "Pages", icon: Heart, permission: "settings.manage", keywords: ["money", "gift", "offering", "donate"] },
  { href: "/admin/audit", label: "Audit Logs", group: "Pages", icon: ScrollText, permission: "audit.read", keywords: ["history", "log", "activity", "orphan"] },
  { href: "/admin/users", label: "Users", group: "Pages", icon: Users, permission: "user.manage", keywords: ["admin", "staff", "accounts", "roles"] },

  // ─── Print ──────────────────────────────────────────────────────
  { href: "/admin/print/registrations", label: "Registration Summaries", group: "Print", icon: Printer, permission: "print.registration", keywords: ["print", "pdf", "summary"] },
  { href: "/admin/print/labels", label: "Registration Labels", group: "Print", icon: Printer, permission: "print.registration", keywords: ["print", "label", "registration", "envelope", "avery", "8160", "room", "key", "sticker"] },
  { href: "/admin/print/lanyard", label: "Lanyards", group: "Print", icon: Printer, permission: "print.lanyard", keywords: ["print", "badge", "name tag", "lanyard"] },
  { href: "/admin/print/qr-cards", label: "QR Cards", group: "Print", icon: Printer, permission: "print.qrcard", keywords: ["print", "qr", "card", "scan"] },

  // ─── Settings (gated by settings.manage) ────────────────────────
  { href: "/admin/settings/groups", label: "Registration Groups", group: "Settings", icon: Layers, permission: "settings.manage", keywords: ["reg group", "category", "pricing"] },
  { href: "/admin/settings/fees", label: "Fee Categories", group: "Settings", icon: DollarSign, permission: "settings.manage", keywords: ["money", "price", "cost", "fee"] },
  { href: "/admin/settings/roles", label: "Roles", group: "Settings", icon: ShieldCheck, permission: "settings.manage", keywords: ["permission", "access"] },
  { href: "/admin/settings/departments", label: "Departments", group: "Settings", icon: Building2, permission: "settings.manage", keywords: ["dept", "team"] },
  { href: "/admin/settings/churches", label: "Churches", group: "Settings", icon: Church, permission: "settings.manage", keywords: ["congregation"] },
  { href: "/admin/settings/participant-titles", label: "Participant Titles", group: "Settings", icon: Tag, permission: "settings.manage", keywords: ["title", "role label"] },
  { href: "/admin/settings/legal", label: "Legal Pages", group: "Settings", icon: Scale, permission: "settings.manage", keywords: ["terms", "privacy", "policy", "waiver"] },
  { href: "/admin/settings/stripe", label: "Stripe", group: "Settings", icon: CreditCard, permission: "settings.manage", keywords: ["payment", "card", "money", "gateway"] },
  { href: "/admin/settings/lodging", label: "Lodging", group: "Settings", icon: BedDouble, permission: "settings.manage", keywords: ["rooms", "housing"] },
  { href: "/admin/settings/sessions", label: "Sessions", group: "Settings", icon: Presentation, permission: "settings.manage", keywords: ["schedule", "program", "talks"] },
  { href: "/admin/settings/airport-rides", label: "Airport Rides", group: "Settings", icon: Plane, permission: "settings.manage", keywords: ["shuttle", "transport"] },
  { href: "/admin/settings/meal-times", label: "Meal Times", group: "Settings", icon: UtensilsCrossed, permission: "settings.manage", keywords: ["food", "dining", "meals"] },
  { href: "/admin/settings/email", label: "Email", group: "Settings", icon: Mail, permission: "settings.manage", keywords: ["mail", "notification", "template"] },
  { href: "/admin/settings/google-sheets", label: "Google Sheets", group: "Settings", icon: Sheet, permission: "settings.manage", keywords: ["export", "backup", "spreadsheet"] },
  { href: "/admin/settings/booklet", label: "Booklet", group: "Settings", icon: BookOpen, permission: "settings.manage", keywords: ["program", "pdf", "guide"] },
  { href: "/admin/settings/configuration", label: "Configuration", group: "Settings", icon: Settings2, permission: "settings.manage", keywords: ["config", "settings", "options"] },
];

/**
 * Whether a user holding `permissions` can see a target.
 * `null` → always; array → any-of; string → must include.
 */
export function canSeeTarget(permission: NavTarget["permission"], permissions: string[]): boolean {
  if (permission === null) return true;
  if (Array.isArray(permission)) return permission.some((p) => permissions.includes(p));
  return permissions.includes(permission);
}

/**
 * Lightweight relevance score for a query against a target. Higher = better;
 * 0 means no match. Prioritizes: label prefix > label substring > keyword hit.
 */
export function scoreTarget(target: NavTarget, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const label = target.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  const path = target.href.toLowerCase();
  if (path.includes(q)) return 40;
  if (target.keywords?.some((k) => k.toLowerCase().includes(q))) return 30;
  return 0;
}
