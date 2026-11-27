"use client";

import Link from "next/link";
import { CalendarDays, ChevronDown, LayoutDashboard, LogOut, ScanLine, Shield, Ticket, User, Plus, Megaphone, ClipboardList, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface UserMenuOrg {
  slug: string;
  name: string;
  role: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function UserMenu(props: {
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  orgs: UserMenuOrg[];
  canScan: boolean;
  canSell?: boolean;
  isAmbassador?: boolean;
  managesSessions?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 rounded-full py-1 pr-2 pl-1 hover:bg-secondary/80 md:pr-3" aria-label="Account menu">
          <Avatar className="size-9 ring-2 ring-white">
            {props.avatarUrl ? <AvatarImage src={props.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-navy text-xs text-white">{initials(props.name) || "U"}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-36 truncate text-sm font-semibold text-navy md:inline">{props.name}</span>
          <ChevronDown className="hidden size-4 text-slate-500 md:block" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-72 rounded-2xl p-2 shadow-lift">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{props.name}</div>
          <div className="truncate text-xs text-muted-foreground">{props.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/me/tickets" className="min-h-11">
            <Ticket /> My tickets
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="sm:hidden">
          <Link href="/events" className="min-h-11">
            <CalendarDays /> Events
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="sm:hidden">
          <Link href="/societies" className="min-h-11">
            <Users /> Societies
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me/profile" className="min-h-11">
            <User /> Profile
          </Link>
        </DropdownMenuItem>
        {props.canScan ? (
          <DropdownMenuItem asChild>
            <Link href="/scan" className="min-h-11">
              <ScanLine /> Scan tickets
            </Link>
          </DropdownMenuItem>
        ) : null}
        {props.canSell ? (
          <DropdownMenuItem asChild>
            <Link href="/sell" className="min-h-11">
              <Ticket /> Sell tickets
            </Link>
          </DropdownMenuItem>
        ) : null}
        {props.managesSessions ? (
          <DropdownMenuItem asChild>
            <Link href="/manage" className="min-h-11">
              <ClipboardList /> My sessions
            </Link>
          </DropdownMenuItem>
        ) : null}
        {props.isAmbassador ? (
          <DropdownMenuItem asChild>
            <Link href="/me/ambassador" className="min-h-11">
              <Megaphone /> My ambassador page
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {props.orgs.map((o) => (
          <DropdownMenuItem asChild key={o.slug}>
            <Link href={`/org/${o.slug}`} className="min-h-11">
              <LayoutDashboard /> <span className="truncate">{o.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem asChild>
          <Link href="/org/new" className="min-h-11">
            <Plus /> Register a society
          </Link>
        </DropdownMenuItem>
        {props.isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="min-h-11">
              <Shield /> Admin panel
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="min-h-11 w-full">
              <LogOut /> Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
