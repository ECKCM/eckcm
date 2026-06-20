"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, ExternalLink, MessageSquare, Download } from "lucide-react";

export interface EPassLinkRow {
  personId: string;
  name: string;
  displayNameKo: string | null;
  gender: string | null;
  phone: string | null;
  participantCode: string | null;
  confirmationCode: string | null;
  status: string | null;
  isActive: boolean;
  slug: string;
}

interface EventOption {
  id: string;
  name_en: string;
  year: number;
  is_default: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  PAID: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  APPROVED:
    "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300",
  SUBMITTED:
    "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
  PENDING:
    "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300",
};

function toE164(phone: string): string {
  return phone.replace(/[^+\d]/g, "");
}

export function EPassLinksClient({
  events,
  selectedEventId,
  rows,
}: {
  events: EventOption[];
  selectedEventId: string | null;
  rows: EPassLinkRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const urlFor = (slug: string) => `${origin}/epass/${slug}`;

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.status) set.add(r.status);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.displayNameKo ?? "").toLowerCase().includes(q) ||
        (r.participantCode ?? "").toLowerCase().includes(q) ||
        (r.confirmationCode ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  function onEventChange(id: string) {
    startTransition(() => {
      router.push(`/admin/epass?event=${id}`);
    });
  }

  async function copyOne(r: EPassLinkRow) {
    try {
      await navigator.clipboard.writeText(urlFor(r.slug));
      toast.success(`Link copied — ${r.name}`);
    } catch {
      toast.error("Failed to copy link");
    }
  }

  async function copyAll() {
    if (filtered.length === 0) return;
    const text = filtered.map((r) => `${r.name}\t${urlFor(r.slug)}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        `Copied ${filtered.length} link${filtered.length === 1 ? "" : "s"}`,
      );
    } catch {
      toast.error("Failed to copy links");
    }
  }

  function exportCsv() {
    if (filtered.length === 0) return;
    const header = [
      "Name",
      "Korean Name",
      "Participant Code",
      "Confirmation",
      "Status",
      "Phone",
      "E-Pass URL",
    ];
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...filtered.map((r) =>
        [
          r.name,
          r.displayNameKo,
          r.participantCode,
          r.confirmationCode,
          r.status,
          r.phone,
          urlFor(r.slug),
        ]
          .map(esc)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const ev = events.find((e) => e.id === selectedEventId);
    const a = document.createElement("a");
    a.href = url;
    a.download = `epass-links-${ev ? ev.year : "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedEventId ?? ""} onValueChange={onEventChange}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Select event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name_en} ({e.year})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyAll}
            disabled={filtered.length === 0}
          >
            <Copy className="mr-1.5 h-4 w-4" /> Copy all
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search by name, code, confirmation, or phone…"
        containerClassName="max-w-md"
      />

      <div className="text-sm text-muted-foreground">
        {isPending
          ? "Loading…"
          : `${filtered.length} of ${rows.length} E-Pass link${rows.length === 1 ? "" : "s"}`}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Confirmation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>E-Pass Link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {isPending ? "Loading…" : "No E-Pass links found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={`${r.personId}:${r.slug}`}>
                    <TableCell>
                      <div className="font-medium">
                        {r.displayNameKo ?? r.name}
                      </div>
                      {r.displayNameKo && (
                        <div className="text-xs text-muted-foreground">
                          {r.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.participantCode ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.confirmationCode ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.status && (
                        <Badge
                          variant="outline"
                          className={STATUS_STYLES[r.status] ?? ""}
                        >
                          {r.status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <a
                        href={origin ? urlFor(r.slug) : undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                        title={origin ? urlFor(r.slug) : r.slug}
                      >
                        /epass/{r.slug}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => copyOne(r)}
                          title="Copy link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          asChild
                          title="Open in new tab"
                        >
                          <a
                            href={origin ? urlFor(r.slug) : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        {r.phone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            asChild
                            title="Send via SMS"
                          >
                            <a
                              href={`sms:${toE164(r.phone)}?&body=${encodeURIComponent(
                                `${r.name} E-Pass: ${urlFor(r.slug)}`,
                              )}`}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
