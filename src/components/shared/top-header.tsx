"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import {
  Bell,
  LayoutDashboard,
  Shield,
  Settings,
  LogOut,
  Receipt,
  QrCode,
  ClipboardList,
  Menu,
} from "lucide-react";

interface TopHeaderProps {
  user: {
    id: string;
    email: string;
  };
  displayName: string;
  initials: string;
  isAdmin?: boolean;
}

export function TopHeader({
  user,
  displayName,
  initials,
  isAdmin,
}: TopHeaderProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!mounted) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6">
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>ECKCM</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 pt-4">
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => router.push("/dashboard")}
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => router.push("/dashboard/epass")}
              >
                <QrCode className="mr-2 h-4 w-4" />
                E-Pass
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => router.push("/dashboard/receipts")}
              >
                <Receipt className="mr-2 h-4 w-4" />
                Receipts
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => router.push("/dashboard/registrations")}
              >
                <ClipboardList className="mr-2 h-4 w-4" />
                Registrations
              </Button>
              <Separator className="my-2" />
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => router.push("/dashboard/settings")}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
              {isAdmin && (
                <Button
                  variant="ghost"
                  className="justify-start"
                  onClick={() => router.push("/admin")}
                >
                  <Shield className="mr-2 h-4 w-4" />
                  Admin Panel
                </Button>
              )}
              <Separator className="my-2" />
              <Button
                variant="ghost"
                className="justify-start text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo / Brand */}
        <button
          onClick={() => router.push("/dashboard")}
          className="hidden font-bold tracking-tight md:block"
        >
          ECKCM
        </button>

        <Separator orientation="vertical" className="hidden h-6 md:block" />

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
          >
            Dashboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/epass")}
          >
            E-Pass
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard/registrations")}
          >
            Registrations
          </Button>
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Notifications */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="sr-only">Notifications</span>
          </Button>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full"
              >
                <Avatar size="default">
                  <AvatarImage alt={displayName} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {displayName}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard")}
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/epass")}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  E-Pass
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/receipts")}
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Receipts
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/settings")}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </DropdownMenuGroup>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => router.push("/admin")}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Admin Panel
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
