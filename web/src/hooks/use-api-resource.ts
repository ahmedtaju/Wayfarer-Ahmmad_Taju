"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, isAbortError } from "../lib/api";

interface ResourceState<T> {
  key: string;
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface ApiResource<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: (options?: { throwOnError?: boolean }) => Promise<void>;
}

/** Identity/path changes invalidate displayed data before the next effect runs. */
export function useApiResource<T>(path: string | null, userId?: number | null): ApiResource<T> {
  const key = JSON.stringify([path, userId ?? null]);
  const [state, setState] = useState<ResourceState<T>>({ key, data: null, loading: path !== null, error: null });
  const generation = useRef(0);
  const activeKey = useRef<string | null>(key);
  const controller = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    activeKey.current = null;
    generation.current++;
    controller.current?.abort();
    controller.current = null;
  }, []);

  const reload = useCallback(async (options: { throwOnError?: boolean } = {}): Promise<void> => {
    // A dialog may still hold an old reload callback after its actor changes.
    if (activeKey.current !== key) return;
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    controller.current = null;
    if (path === null) {
      setState({ key, data: null, loading: false, error: null });
      return;
    }

    const requestController = new AbortController();
    controller.current = requestController;
    setState((current) => ({
      key,
      data: current.key === key ? current.data : null,
      loading: true,
      error: null,
    }));
    try {
      const data = await apiRequest<T>(path, { userId, signal: requestController.signal });
      if (requestGeneration !== generation.current || requestController.signal.aborted) return;
      setState({ key, data, loading: false, error: null });
    } catch (error) {
      if (requestGeneration !== generation.current || requestController.signal.aborted || isAbortError(error)) return;
      const failure = error instanceof Error ? error : new Error("Could not load this information.");
      setState((current) => ({
        key,
        data: current.key === key ? current.data : null,
        loading: false,
        error: failure,
      }));
      // Post-write refreshes need to distinguish a saved action from a failed
      // refresh. Initial loads and ordinary retry buttons keep safe defaults.
      if (options.throwOnError) throw failure;
    } finally {
      if (controller.current === requestController) controller.current = null;
    }
  }, [key, path, userId]);

  useEffect(() => {
    activeKey.current = key;
    void reload();
    return invalidate;
  }, [key, reload, invalidate]);

  if (state.key !== key) return { data: null, loading: path !== null, error: null, reload };
  return { data: state.data, loading: state.loading, error: state.error, reload };
}
