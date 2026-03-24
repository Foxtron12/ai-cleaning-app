'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  FileText,
  Receipt,
  Calculator,
  MessageSquare,
  Settings,
  Building2,
  LogOut,
  User,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { supabase } from '@/lib/supabase'

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Buchungen',
    href: '/dashboard/buchungen',
    icon: CalendarDays,
  },
  {
    title: 'Objekte',
    href: '/dashboard/properties',
    icon: Building2,
  },
  {
    title: 'Reporting',
    href: '/dashboard/reporting',
    icon: BarChart3,
  },
  {
    title: 'Meldescheine',
    href: '/dashboard/meldescheine',
    icon: FileText,
  },
  {
    title: 'Rechnungen',
    href: '/dashboard/rechnungen',
    icon: Receipt,
  },
  {
    title: 'Beherbergungssteuer',
    href: '/dashboard/steuer',
    icon: Calculator,
  },
  {
    title: 'Nachrichten',
    href: '/dashboard/nachrichten',
    icon: MessageSquare,
  },
]

const bottomItems = [
  {
    title: 'Einstellungen',
    href: '/dashboard/einstellungen',
    icon: Settings,
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserEmail(user.email ?? null)

      // Try to get display_name from profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()
      setUserDisplayName(profile?.display_name ?? null)
    }
    loadUser()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Building2 className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Vermietung</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Dashboard
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === '/dashboard'
                        ? pathname === '/dashboard'
                        : pathname.startsWith(item.href)
                    }
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {bottomItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith(item.href)}
                tooltip={item.title}
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {(userDisplayName || userEmail) && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={userEmail ?? ''} className="text-muted-foreground">
                <User className="size-4 shrink-0" />
                <span className="truncate text-xs">{userDisplayName || userEmail}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Abmelden"
              onClick={handleLogout}
              className="text-destructive hover:text-destructive"
            >
              <LogOut />
              <span>Abmelden</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
