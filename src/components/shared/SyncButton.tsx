"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface SyncButtonProps {
  /** The refetch callback(s) for the current page */
  onSync: () => Promise<unknown> | unknown;
  /** Label for desktop UI (defaults to "Sync") */
  label?: string;
  /** Custom CSS classes for positioning */
  className?: string;
  /** Button size */
  size?: "sm" | "default" | "icon";
  /** Button style variant */
  variant?: "outline" | "ghost" | "default" | "secondary";
  /** Accessible title tooltip */
  title?: string;
}

export function SyncButton({
  onSync,
  label = "Sync",
  className,
  size = "sm",
  variant = "outline",
  title = "Fetch latest updates from server",
}: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      await onSync();
      toast.success("Data synchronized");
    } catch (error: any) {
      toast.error(error?.message || "Failed to synchronize data");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleSync}
      disabled={isSyncing}
      title={title}
      className={cn(
        "gap-1.5 h-9 font-medium transition-all shadow-sm",
        "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
        className,
      )}
    >
      <RotateCw
        className={cn(
          "h-3.5 w-3.5 text-gray-500 dark:text-gray-400",
          isSyncing && "animate-spin text-[#3838EC]",
        )}
      />
      <span>{isSyncing ? "Syncing…" : label}</span>
    </Button>
  );
}

export default SyncButton;
