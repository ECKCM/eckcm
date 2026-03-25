// Route → required permission code mapping.
// Order matters: more-specific prefixes must come before shorter ones.
const ROUTE_PERMISSIONS: [string, string][] = [
  ["/admin/registrations/create", "participant.update"],
  ["/admin/guardian-consents", "participant.read"],
  ["/admin/registrations", "participant.read"],
  ["/admin/events", "event.manage"],
  ["/admin/participants", "participant.read"],
  ["/admin/room-groups", "group.read"],
  ["/admin/invoices", "invoice.read"],
  ["/admin/inventory", "participant.read"],
  ["/admin/airport", "participant.read"],
  ["/admin/audit", "audit.read"],
  ["/admin/users", "user.manage"],
  ["/admin/meals", "checkin.dining"],
  ["/admin/checkin/session", "checkin.session"],
  ["/admin/checkin", "checkin.main"],
  ["/admin/lodging/buildings", "lodging.manage"],
  ["/admin/lodging/pending", "lodging.assign"],
  ["/admin/lodging", "lodging.read"],
  ["/admin/print/lanyard", "print.lanyard"],
  ["/admin/print/qr-cards", "print.qrcard"],
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
