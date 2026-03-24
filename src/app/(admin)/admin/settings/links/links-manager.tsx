"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtime, useChangeDetector } from "@/lib/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, ExternalLink, X, ShieldCheck } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { logActivity } from "@/lib/audit-client";

interface LinkItem {
  id: string;
  name: string;
  url: string;
  categories: string[];
  sort_order: number;
  is_active: boolean;
  super_admin_only: boolean;
}

const emptyForm = {
  name: "",
  url: "",
  categories: [] as string[],
  sort_order: "0",
  is_active: true,
  super_admin_only: false,
};

export function LinksManager() {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [categoryInput, setCategoryInput] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("eckcm_links")
      .select("*")
      .order("sort_order")
      .order("name");
    setLinks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Live updates
  const _reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime({ table: "eckcm_links", event: "*" }, () => {
    if (_reloadTimer.current) clearTimeout(_reloadTimer.current);
    _reloadTimer.current = setTimeout(loadLinks, 500);
  });
  useChangeDetector("eckcm_links", loadLinks, 5000);

  // Collect all unique categories across links
  const allCategories = Array.from(
    new Set(links.flatMap((l) => l.categories))
  ).sort();

  const filteredLinks = filterCategory
    ? links.filter((l) => l.categories.includes(filterCategory))
    : links;

  // Group links by category for display
  const groupedLinks = (() => {
    const groups: Record<string, LinkItem[]> = {};
    for (const link of filteredLinks) {
      if (link.categories.length === 0) {
        const key = "Uncategorized";
        (groups[key] ??= []).push(link);
      } else {
        for (const cat of link.categories) {
          if (filterCategory && cat !== filterCategory) continue;
          (groups[cat] ??= []).push(link);
        }
      }
    }
    // Sort group keys: alphabetical, Uncategorized last
    const sorted = Object.keys(groups).sort((a, b) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });
    return sorted.map((key) => ({ category: key, links: groups[key] }));
  })();

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCategoryInput("");
    setDialogOpen(true);
  };

  const openEdit = (link: LinkItem) => {
    setEditingId(link.id);
    setForm({
      name: link.name,
      url: link.url,
      categories: [...link.categories],
      sort_order: link.sort_order.toString(),
      is_active: link.is_active,
      super_admin_only: link.super_admin_only,
    });
    setCategoryInput("");
    setDialogOpen(true);
  };

  const addCategory = () => {
    const value = categoryInput.trim();
    if (value && !form.categories.includes(value)) {
      setForm({ ...form, categories: [...form.categories, value] });
    }
    setCategoryInput("");
  };

  const removeCategory = (cat: string) => {
    setForm({
      ...form,
      categories: form.categories.filter((c) => c !== cat),
    });
  };

  const handleSave = async () => {
    if (!form.name || !form.url) {
      toast.error("Name and URL are required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name: form.name,
      url: form.url,
      categories: form.categories,
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
      super_admin_only: form.super_admin_only,
    };

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_links")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Link updated");
      logActivity({
        action: "UPDATE",
        entity_type: "link",
        entity_id: editingId,
        new_data: payload,
      });
    } else {
      const { data: created, error } = await supabase
        .from("eckcm_links")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Link created");
      logActivity({
        action: "CREATE",
        entity_type: "link",
        entity_id: created?.id,
        new_data: payload,
      });
    }

    setSaving(false);
    setDialogOpen(false);
    loadLinks();
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_links")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Link deleted");
    logActivity({ action: "DELETE", entity_type: "link", entity_id: id });
    loadLinks();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Add Link
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Link" : "Add Link"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="Google Drive"
                />
              </div>
              <div className="space-y-1">
                <Label>URL *</Label>
                <Input
                  value={form.url}
                  onChange={(e) =>
                    setForm({ ...form, url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1">
                <Label>Categories</Label>
                {/* Existing categories as toggle chips */}
                {allCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allCategories.map((cat) => {
                      const selected = form.categories.includes(cat);
                      return (
                        <Badge
                          key={cat}
                          variant={selected ? "default" : "outline"}
                          className="cursor-pointer hover:opacity-80 active:scale-95 transition-all"
                          onClick={() =>
                            selected ? removeCategory(cat) : setForm({ ...form, categories: [...form.categories, cat] })
                          }
                        >
                          {cat}
                        </Badge>
                      );
                    })}
                  </div>
                )}
                {/* New category input */}
                <div className="flex gap-2">
                  <Input
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="New category"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategory();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addCategory}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>
                {/* Selected categories with remove */}
                {form.categories.filter((c) => !allCategories.includes(c)).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {form.categories
                      .filter((c) => !allCategories.includes(c))
                      .map((cat) => (
                        <Badge
                          key={cat}
                          variant="secondary"
                          className="gap-1 pr-1"
                        >
                          {cat}
                          <button
                            type="button"
                            onClick={() => removeCategory(cat)}
                            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 active:bg-muted-foreground/40 active:scale-90 p-0.5 transition-all"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="link-active"
                    checked={form.is_active}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, is_active: checked })
                    }
                  />
                  <Label htmlFor="link-active">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="link-super-admin"
                    checked={form.super_admin_only}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, super_admin_only: checked })
                    }
                  />
                  <Label htmlFor="link-super-admin">Super Admin Only</Label>
                </div>
              </div>
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Saving..." : editingId ? "Update" : "Create"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Category filter */}
        {allCategories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={filterCategory === null ? "default" : "outline"}
              className="cursor-pointer hover:opacity-80 active:scale-95 active:opacity-70 transition-all"
              onClick={() => setFilterCategory(null)}
            >
              All
            </Badge>
            {allCategories.map((cat) => (
              <Badge
                key={cat}
                variant={filterCategory === cat ? "default" : "outline"}
                className="cursor-pointer hover:opacity-80 active:scale-95 active:opacity-70 transition-all"
                onClick={() =>
                  setFilterCategory(filterCategory === cat ? null : cat)
                }
              >
                {cat}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : filteredLinks.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {links.length === 0 ? "No links yet." : "No links in this category."}
        </p>
      ) : (
        <div className="space-y-6">
          {groupedLinks.map(({ category, links: categoryLinks }) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {categoryLinks.map((link) => (
                  <div
                    key={`${category}-${link.id}`}
                    className="group relative flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 aspect-square text-center hover:shadow-md transition-shadow"
                  >
                    {/* Action buttons */}
                    <div className="absolute top-1 right-1 flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(link)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setDeleteTarget(link.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    {/* Top-left indicators */}
                    <div className="absolute top-1 left-1 flex gap-1">
                      {!link.is_active && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 opacity-70"
                        >
                          Inactive
                        </Badge>
                      )}
                      {link.super_admin_only && (
                        <ShieldCheck className="size-4 text-amber-500" />
                      )}
                    </div>

                    {/* Link content — clickable */}
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 w-full"
                    >
                      <ExternalLink className="size-6 text-muted-foreground" />
                      <span className="text-sm font-medium leading-tight line-clamp-2">
                        {link.name}
                      </span>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        title="Delete link?"
        description="This will permanently delete this link. This action cannot be undone."
      />
    </div>
  );
}
