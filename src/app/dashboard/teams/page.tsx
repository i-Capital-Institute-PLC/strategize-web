"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeamsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/units");
  }, [router]);

  return (
    <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
      Redirecting to Units...
    </div>
  );
}
