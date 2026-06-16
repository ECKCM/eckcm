// Route → required permission(s) mapping.
// Order matters: more-specific prefixes must come before shorter ones.
// A route can require either a single permission or any-of a list.
type RouteRule = string | string[];

const ROUTE_PERMISSIONS: [string, RouteRule][] = [
  // Registrations
  ["/admin/registrations/adjustments", "participant.update"],
  ["/admin/registrations/create", "participant.update"],
  ["/admin/registrations", "participant.read"],

  // Participants & related views
  ["/admin/guardian-consents", "participant.read"],
  ["/admin/participants", "participant.read"],
  ["/admin/inventory", "participant.read"],
  ["/admin/airport", "participant.read"],

  // Department View — full readers and department-scoped admins both see it.
  // Per-department access is enforced inside the page against x-user-department-ids.
  ["/admin/department-view", ["participant.read", "department.view"]],

  // Events
  ["/admin/events", "event.manage"],

  // Room Groups
  ["/admin/room-groups", "group.read"],

  // Invoices
  ["/admin/invoices", "invoice.read"],

  // Check-in (specific before general)
  ["/admin/checkin/meal", "checkin.dining"],
  ["/admin/checkin/checkout", "checkin.checkout"],
  ["/admin/checkin/session", "checkin.session"],
  ["/admin/checkin/kiosk", "checkin.main"],
  ["/admin/checkin/main", "checkin.main"],
  ["/admin/checkin/stats", "checkin.main"],
  ["/admin/checkin/scan-sessions", "checkin.main"],
  ["/admin/checkin/test", "checkin.main"],
  ["/admin/checkin", "checkin.main"],
  ["/admin/meals", "checkin.dining"],

  // Lodging (specific before general)
  ["/admin/lodging/buildings", "lodging.manage"],
  ["/admin/lodging/floorplan", "lodging.assign"],
  ["/admin/lodging/pending", "lodging.assign"],
  ["/admin/lodging/assigned", "lodging.read"],
  ["/admin/lodging", "lodging.read"],

  // Print
  ["/admin/print/registrations", "print.registration"],
  ["/admin/print/labels", "print.registration"],
  ["/admin/print/lanyard", "print.lanyard"],
  ["/admin/print/qr-cards", "print.qrcard"],

  // Manual Payments (Zelle / Check) — SUPER_ADMIN or EVENT_ADMIN (any write-capable admin)
  ["/admin/manual-payments", ["settings.manage", "participant.update"]],

  // Funding
  ["/admin/funding", "settings.manage"],

  // Donations
  ["/admin/donations", "settings.manage"],

  // Audit & Users
  ["/admin/audit", "audit.read"],
  ["/admin/users", "user.manage"],

  // Settings (links before general)
  ["/admin/settings/links", "links.manage"],
  ["/admin/settings", "settings.manage"],
];

/**
 * Returns the permission rule required for a path: a single code, an array
 * (any-of), or null if the route is unrestricted.
 */
export function getRequiredPermission(pathname: string): RouteRule | null {
  for (const [prefix, rule] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return rule;
    }
  }
  return null;
}

/** True if `permissions` satisfies `rule` (single string or any-of list). */
export function hasRequiredPermission(
  rule: RouteRule,
  permissions: string[]
): boolean {
  if (Array.isArray(rule)) {
    return rule.some((code) => permissions.includes(code));
  }
  return permissions.includes(rule);
}
