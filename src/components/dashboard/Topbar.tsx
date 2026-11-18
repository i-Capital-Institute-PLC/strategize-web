"use client";
import {
  ChevronRight,
  Globe,
  Sun,
  Moon,
  SidebarClose,
  SidebarOpen,
  LogOut,
  Settings,
  User,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import OrgUnitSelector from "./OrgUnitSelector";
import StrategicPeriodSelector from "./StrategicPeriodSelector";
import DepartmentSelector from "../departments/DepartmentSelector";
import { useTheme } from "next-themes";
import { useUIStore, useAuthStore } from "@/stores";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/providers/AuthProvider";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import NotificationDropdown from "./NotificationDropdown";

export default function Topbar() {
  const { theme, setTheme } = useTheme();
  const open = useUIStore((state) => state.sidebarOpen);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const userPicture = user?.picture;
  const userFullName = user?.fullName;
  const userEmail = user?.email;
  const userStatus = user?.status;
  const userDepartmentName = user?.departments?.[0]?.name;
  const isOffboarded = userStatus === "DISABLED";
  const { logout } = useAuthContext();
  const router = useRouter();

  const handleLogout = () => {
    void logout();
  };

  // Function to get page name from pathname
  const getPageName = (path: string) => {
    if (path === "/dashboard") return "Dashboard";
    if (path.startsWith("/dashboard/objectives")) return "Objectives";
    if (path.startsWith("/dashboard/divisions")) return "Divisions";
    if (path.startsWith("/dashboard/departments")) return "Departments";
    if (path.startsWith("/dashboard/employees")) return "Employees";
    if (path.startsWith("/dashboard/reports")) return "Reports";
    if (path.startsWith("/dashboard/semi-annual-report")) return "Semi-Annual Report";
    if (path.startsWith("/dashboard/semi-annual-config")) return "Semi-Annual Configuration";
    if (path.startsWith("/dashboard/approvals/my-submissions"))
      return "My Submissions";
    if (path.startsWith("/dashboard/approvals")) return "Approvals";
    if (path.startsWith("/dashboard/admin")) return "Admin Panel";
    if (path.startsWith("/dashboard/settings")) return "Settings";
    if (path.startsWith("/strategy-period")) return "Strategy Period";
    return "Dashboard"; // Default fallback
  };

  return (
    <div className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-900/80">
      <header className="flex w-full items-center justify-between px-3 py-2.5 sm:px-6 sm:py-3.5">
        {/* Left: Breadcrumbs and filter */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
          <nav className="flex min-w-0 items-center text-sm">
            {/* Sidebar toggle - hamburger on mobile, collapse control on desktop */}
            <button
              className="mr-1 flex-shrink-0 rounded-xl p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-indigo-400 sm:mr-2"
              aria-label="Toggle sidebar"
              onClick={toggleSidebar}
            >
              {open ? (
                <SidebarClose
                  className="h-5 w-5"
                  strokeWidth={1.75}
                />
              ) : (
                <SidebarOpen
                  className="h-5 w-5"
                  strokeWidth={1.75}
                />
              )}
            </button>
            <span className="truncate font-bold text-slate-900 dark:text-zinc-100">
              {getPageName(pathname)}
            </span>
            {/* Strategic Period Selector — tablet+ */}
            <div className="ml-3 hidden md:block">
              <StrategicPeriodSelector />
            </div>
            <div className="hidden lg:block ml-2">
              <OrgUnitSelector />
            </div>
            <div className="hidden lg:block">
              <DepartmentSelector className="ml-2" />
            </div>
          </nav>
        </div>
        {/* Right: Icons, language, user */}
        <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2.5">
          <NotificationDropdown />

          <button
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-2xs transition-all hover:bg-slate-100 hover:text-slate-900 dark:border-white/[0.12] dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-amber-400" />
            ) : (
              <Moon className="h-5 w-5 text-slate-700" />
            )}
          </button>

          {/* Language selector - Hidden on mobile */}
          <div className="hidden sm:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-10 items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 text-xs font-semibold text-slate-800 shadow-2xs transition-all hover:bg-slate-100 hover:text-slate-900 dark:border-white/[0.12] dark:bg-zinc-800/90 dark:text-zinc-200 dark:hover:bg-zinc-700">
                  <Globe className="h-4 w-4 text-slate-600 dark:text-zinc-300" />
                  <span>Eng</span>
                  <ChevronRight className="h-3.5 w-3.5 rotate-90 text-slate-400 dark:text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-900/95">
                <DropdownMenuItem className="rounded-xl text-xs font-medium">English</DropdownMenuItem>
                <DropdownMenuItem className="rounded-xl text-xs font-medium">French</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {isOffboarded && (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/60">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Offboarded
            </span>
          )}

          {!isOffboarded && userDepartmentName && (
            <span className="hidden lg:inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs dark:bg-zinc-800/90 dark:text-zinc-200 dark:border-zinc-700">
              {userDepartmentName}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="flex h-10 items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-2.5 sm:px-3 text-slate-800 shadow-2xs hover:bg-slate-100 dark:border-white/[0.12] dark:bg-zinc-800/90 dark:text-gray-200 dark:hover:bg-zinc-700 sm:gap-3"
              >
                <UserAvatar
                  src={userPicture}
                  alt={userFullName || "User"}
                  size="sm"
                />
                <span className="hidden sm:inline">
                  {userFullName || "User"}
                </span>
                <ChevronRight className="hidden h-4 w-4 rotate-90 text-gray-500 dark:text-gray-400 sm:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled>
                <div className="flex items-center gap-3">
                  <UserAvatar
                    src={userPicture}
                    alt={userFullName || "User"}
                    size="md"
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {userFullName || "User"}
                    </span>
                    <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {userEmail || ""}
                    </span>
                    {userDepartmentName && (
                      <span className="truncate text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {userDepartmentName}
                      </span>
                    )}
                    {isOffboarded && (
                      <span className="inline-block mt-1 w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Offboarded
                      </span>
                    )}
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/settings?tab=security")}
                className="cursor-pointer"
              >
                <Shield className="mr-2 h-4 w-4" />
                Account Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/settings?tab=profile")}
                className="cursor-pointer"
              >
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => router.push("/dashboard/settings")}
                className="cursor-pointer"
              >
                <Settings className="mr-2 h-4 w-4" />
                All Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="cursor-pointer text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile context selectors — period is critical for most pages */}
      <div className="flex gap-2 overflow-x-auto px-3 pb-3 md:hidden">
        <StrategicPeriodSelector />
      </div>
    </div>
  );
}
