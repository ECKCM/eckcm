"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Church {
  id: string;
  name_en: string;
  is_other: boolean;
  sort_order: number;
  is_active: boolean;
}

export function ChurchesManager({
  initialChurches,
}: {
  initialChurches: Church[];
}) {
  const router = useRouter();
  const [churches, setChurches] = useState(initialChurches);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name_en: "",
    sort_order: "0",
    is_active: true,
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name_en: "", sort_order: "0", is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (church: Church) => {
    setEditingId(church.id);
    setForm({
      name_en: church.name_en,
      sort_order: church.sort_order.toString(),
      is_active: church.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name_en) {
      toast.error("Church name is required");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const payload = {
      name_en: form.name_en,
      sort_order: parseInt(form.sort_order) || 0,
      is_active: form.is_active,
    };

    if (editingId) {
      const { error } = await supabase
        .from("eckcm_churches")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Church updated");
    } else {
      const { error } = await supabase
        .from("eckcm_churches")
        .insert(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Church added");
    }

    setSaving(false);
    setDialogOpen(false);
    router.refresh();

    // Reload
    const { data } = await supabase
      .from("eckcm_churches")
      .select("*")
      .order("is_other", { ascending: false })
      .order("sort_order");
    setChurches(data ?? []);
  };

  const handleDelete = async (church: Church) => {
    if (church.is_other) {
      toast.error("Cannot delete the 'Other' entry");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("eckcm_churches")
      .delete()
      .eq("id", church.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setChurches(churches.filter((c) => c.id !== church.id));
    toast.success("Church deleted");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Churches are shared across all events.
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Add Church
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Church" : "Add Church"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Church Name *</Label>
                <Input
                  value={form.name_en}
                  onChange={(e) =>
                    setForm({ ...form, name_en: e.target.value })
                  }
                  placeholder="Grace Korean Church"
                />
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
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked })
                  }
                />
                <Label>Active</Label>
              </div>
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={saving}
              >
                {saving ? "Saving..." : editingId ? "Update" : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {churches.map((church) => (
            <TableRow key={church.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {church.name_en}
                  {church.is_other && (
                    <Badge variant="outline">System</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{church.sort_order}</TableCell>
              <TableCell>
                <Badge
                  variant={church.is_active ? "default" : "secondary"}
                >
                  {church.is_active ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(church)}
                >
                  <Pencil className="size-4" />
                </Button>
                {!church.is_other && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(church)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
