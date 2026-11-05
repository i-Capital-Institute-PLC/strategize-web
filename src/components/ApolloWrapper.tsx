"use client";

import "@/lib/immer-setup";
import { useEffect, useState, type ReactNode } from "react";
import { ApolloProvider } from "@apollo/client";
import { CachePersistor, LocalStorageWrapper } from "apollo3-cache-persist";
import apolloClient from "@/lib/apollo-client";

const CACHE_KEY = "strategize-apollo-cache-v2";
const CACHE_VERSION_KEY = "strategize-cache-version";
const CACHE_TIMESTAMP_KEY = "strategize-cache-timestamp";
const CACHE_USER_ID_KEY = "strategize-cache-user-id";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL
const CURRENT_CACHE_VERSION = "2.2"; // Increment this to invalidate old caches

interface ApolloWrapperProps {
  children: ReactNode;
}

/**
 * Restores the Apollo cache from localStorage/IndexedDB before mounting the tree so
 * dashboard lists (objectives, KPIs, etc.) reappear instantly on navigation
 * and page refresh. Uses localStorage for better production performance.
 * 
 * Cache is automatically cleared on logout via clearCacheOnLogout function.
 */
export function ApolloWrapper({ children }: ApolloWrapperProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let persistor: CachePersistor<any> | null = null;

    const restore = async () => {
      try {
        // Check cache version, TTL (30 mins), and user isolation
        const storedVersion = window.localStorage.getItem(CACHE_VERSION_KEY);
        const storedTimestamp = window.localStorage.getItem(CACHE_TIMESTAMP_KEY);
        const storedUserId = window.localStorage.getItem(CACHE_USER_ID_KEY);

        let currentUserId: string | null = null;
        try {
          const authData = window.sessionStorage.getItem("auth-storage");
          if (authData) {
            const parsed = JSON.parse(authData);
            currentUserId = parsed?.state?.user?.employeeId ?? null;
          }
        } catch {
          // ignore parsing error
        }

        const isExpired =
          storedTimestamp && Date.now() - Number(storedTimestamp) > CACHE_TTL_MS;
        const isUserMismatch = Boolean(
          currentUserId && storedUserId && currentUserId !== storedUserId,
        );
        const isVersionMismatch = storedVersion !== CURRENT_CACHE_VERSION;

        if (isVersionMismatch || isExpired || isUserMismatch) {
          console.log(
            isExpired
              ? "Apollo cache TTL expired (30m), purging old cache"
              : isUserMismatch
                ? "Apollo cache user mismatch, purging previous user cache"
                : "Apollo cache version mismatch, purging old cache",
          );
          window.localStorage.removeItem(CACHE_KEY);
          window.localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
          window.localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          if (currentUserId) {
            window.localStorage.setItem(CACHE_USER_ID_KEY, currentUserId);
          } else {
            window.localStorage.removeItem(CACHE_USER_ID_KEY);
          }
        } else {
          // Keep timestamp fresh for current active session
          window.localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
          if (currentUserId && !storedUserId) {
            window.localStorage.setItem(CACHE_USER_ID_KEY, currentUserId);
          }
        }

        // Use IndexedDB with localStorage fallback
        persistor = new CachePersistor({
          cache: apolloClient.cache,
          storage: new LocalStorageWrapper(window.localStorage),
          key: CACHE_KEY,
          debounce: 200, // Fast persistence for production
          maxSize: 5_242_880, // 5MB - larger than sessionStorage limit
          serialize: true, // Enable compression
        });
        
        await persistor.restore();
        console.log("Apollo cache restored successfully");

        // Expose cache clearing function globally for logout
        if (typeof window !== "undefined") {
          (window as any).__clearApolloCache = async () => {
            try {
              await persistor?.purge();
              await apolloClient.clearStore();
              window.localStorage.removeItem(CACHE_KEY);
              window.localStorage.removeItem(CACHE_VERSION_KEY);
              window.localStorage.removeItem(CACHE_TIMESTAMP_KEY);
              window.localStorage.removeItem(CACHE_USER_ID_KEY);
              console.log("Apollo cache cleared successfully");
            } catch (error) {
              console.warn("Cache clear failed:", error);
            }
          };
        }
      } catch (error) {
        console.warn("Apollo cache restore skipped:", error);
        // If cache restore fails, clear it and continue
        try {
          window.localStorage.removeItem(CACHE_KEY);
          window.localStorage.removeItem(CACHE_VERSION_KEY);
          window.localStorage.removeItem(CACHE_TIMESTAMP_KEY);
          window.localStorage.removeItem(CACHE_USER_ID_KEY);
        } catch {
          // Ignore localStorage errors
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-[#09090b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-indigo-600" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return <ApolloProvider client={apolloClient}>{children}</ApolloProvider>;
}
