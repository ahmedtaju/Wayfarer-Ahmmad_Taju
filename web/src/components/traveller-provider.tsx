"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApiResource } from "../hooks/use-api-resource";
import type { User } from "../lib/types";

const storageKey = "wayfarer-user-id";

export interface TravellerContextValue {
  users: User[];
  user: User | null;
  userId: number | null;
  selectUser: (id: number) => void;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

const TravellerContext = createContext<TravellerContextValue | null>(null);

function persistSelection(id: number | null): void {
  try {
    if (id === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, String(id));
  } catch {
    // Selection still works when the browser denies local storage access.
  }
}

export function TravellerProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, reload } = useApiResource<User[]>("/api/users");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const users = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    try {
      const persisted = window.localStorage.getItem(storageKey);
      if (persisted && /^[1-9]\d*$/.test(persisted) && Number.isSafeInteger(Number(persisted))) {
        setSelectedId(Number(persisted));
      }
    } catch {
      // Fall back to the first demo traveller when persistence is unavailable.
    }
    setRestored(true);
  }, []);

  const user = restored ? users.find((candidate) => candidate.id === selectedId) ?? users[0] ?? null : null;

  useEffect(() => {
    if (!restored || loading || error) return;
    const validId = user?.id ?? null;
    if (selectedId !== validId) {
      // Do not let a queued default selection overwrite a user's newer choice.
      setSelectedId((current) => users.some((candidate) => candidate.id === current) ? current : validId);
      return;
    }
    persistSelection(selectedId);
  }, [restored, loading, error, selectedId, user, users]);

  const selectUser = useCallback((id: number) => {
    if (!users.some((candidate) => candidate.id === id)) return;
    setSelectedId(id);
    persistSelection(id);
  }, [users]);
  const retry = useCallback(() => { void reload(); }, [reload]);

  const value = useMemo<TravellerContextValue>(() => ({
    users,
    user,
    userId: user?.id ?? null,
    selectUser,
    loading: loading || !restored,
    error,
    retry,
  }), [users, user, selectUser, loading, restored, error, retry]);

  return <TravellerContext.Provider value={value}>{children}</TravellerContext.Provider>;
}

export function useTraveller(): TravellerContextValue {
  const context = useContext(TravellerContext);
  if (!context) throw new Error("useTraveller must be used inside TravellerProvider.");
  return context;
}
