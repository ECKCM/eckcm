// Route → required permission code mapping.
// Order matters: more-specific prefixes must come before shorter ones.
const ROUTE_PERMISSIONS: [string, string][] = [
  // Registrations
  ["/admin/registrations/adjustments", "participant.update"],
  ["/admin/registrations/create", "participant.update"],
  ["/admin/registrations", "participant.read"],

  // Participants & related views
  ["/admin/guardian-consents", "participant.read"],
  ["/admin/participants", "participant.read"],
  ["/admin/inventory", "participant.read"],
  ["/admin/airport", "participant.read"],

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
  ["/admin/checkin/self", "checkin.main"],
  ["/admin/checkin", "checkin.main"],
  ["/admin/meals", "checkin.dining"],

  // Lodging (specific before general)
  ["/admin/lodging/buildings", "lodging.manage"],
  ["/admin/lodging/pending", "lodging.assign"],
  ["/admin/lodging/assigned", "lodging.read"],
  ["/admin/lodging", "lodging.read"],

  // Print
  ["/admin/print/registrations", "print.registration"],
  ["/admin/print/lanyard", "print.lanyard"],
  ["/admin/print/qr-cards", "print.qrcard"],

  // Audit & Users
  ["/admin/audit", "audit.read"],
  ["/admin/users", "user.manage"],

  // Settings (links before general)
  ["/admin/settings/links", "links.manage"],
  ["/admin/settings", "settings.manage"],
];

/**
 * Returns the permission code required to access the given pathname,
 * or null if the route is unrestricted (e.g. /admin, /admin/unauthorized).
 */
export function getRequiredPermission(pathname: string): string | null {
  for (const [prefix, permission] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return permission;
    }
  }
  return null;
}
