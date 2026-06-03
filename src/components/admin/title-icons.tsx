import {
  // general / role
  Star,
  Shield,
  ShieldCheck,
  ShieldHalf,
  Crown,
  Mic,
  Podcast,
  Ticket,
  Award,
  Medal,
  BadgeCheck,
  Flag,
  Music,
  BookOpen,
  Sparkles,
  Heart,
  Cross,
  Church,
  Camera,
  Wrench,
  GraduationCap,
  HeartHandshake,
  Settings,
  IdCard,
  // admin / management
  Cog,
  ShieldAlert,
  Key,
  KeyRound,
  Lock,
  LockKeyhole,
  Sliders,
  SlidersHorizontal,
  Terminal,
  Server,
  ServerCog,
  Database,
  Gauge,
  LayoutDashboard,
  Command,
  MonitorCog,
  Fingerprint,
  ClipboardList,
  Briefcase,
  // user family
  User,
  UserRound,
  UserCheck,
  UserRoundCheck,
  UserCog,
  UserRoundCog,
  UserPlus,
  UserPen,
  UserSearch,
  UserX,
  UserMinus,
  Users,
  UsersRound,
  CircleUser,
  CircleUserRound,
  SquareUser,
  BookUser,
  Contact,
  ContactRound,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated Lucide icons selectable for a participant title. The key is what gets
 * stored in eckcm_participant_titles.icon; the component renders it everywhere
 * the title is shown (admin list, badges, lanyards).
 *
 * NOTE: lucide-react 0.474 lacks UserStar / CircleStar / ShieldUser — closest
 * substitutes (shield-check, star, award, medal, sparkles) are included instead.
 */
export const TITLE_ICONS: Record<string, LucideIcon> = {
  // role / honor
  star: Star,
  sparkles: Sparkles,
  award: Award,
  medal: Medal,
  crown: Crown,
  "badge-check": BadgeCheck,
  shield: Shield,
  "shield-check": ShieldCheck,
  "shield-half": ShieldHalf,
  mic: Mic,
  podcast: Podcast,
  ticket: Ticket,
  flag: Flag,
  music: Music,
  book: BookOpen,
  heart: Heart,
  cross: Cross,
  church: Church,
  camera: Camera,
  wrench: Wrench,
  "graduation-cap": GraduationCap,
  handshake: HeartHandshake,
  "id-card": IdCard,

  // admin / management
  settings: Settings,
  cog: Cog,
  "shield-alert": ShieldAlert,
  key: Key,
  "key-round": KeyRound,
  lock: Lock,
  "lock-keyhole": LockKeyhole,
  sliders: Sliders,
  "sliders-horizontal": SlidersHorizontal,
  terminal: Terminal,
  server: Server,
  "server-cog": ServerCog,
  database: Database,
  gauge: Gauge,
  "layout-dashboard": LayoutDashboard,
  command: Command,
  "monitor-cog": MonitorCog,
  fingerprint: Fingerprint,
  "clipboard-list": ClipboardList,
  briefcase: Briefcase,

  // user family
  user: User,
  "user-round": UserRound,
  "user-check": UserCheck,
  "user-round-check": UserRoundCheck,
  "user-cog": UserCog,
  "user-round-cog": UserRoundCog,
  "user-plus": UserPlus,
  "user-pen": UserPen,
  "user-search": UserSearch,
  "user-x": UserX,
  "user-minus": UserMinus,
  users: Users,
  "users-round": UsersRound,
  "circle-user": CircleUser,
  "circle-user-round": CircleUserRound,
  "square-user": SquareUser,
  "book-user": BookUser,
  contact: Contact,
  "contact-round": ContactRound,
};

export const TITLE_ICON_NAMES = Object.keys(TITLE_ICONS);

/** Renders a title icon by its stored name. Returns null for empty/unknown names. */
export function TitleIcon({
  name,
  className,
  size,
}: {
  name?: string | null;
  className?: string;
  size?: number;
}) {
  if (!name) return null;
  const Icon = TITLE_ICONS[name];
  if (!Icon) return null;
  return <Icon className={className} size={size} aria-hidden="true" />;
}
