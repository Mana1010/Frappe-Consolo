import { create } from "zustand";

type Tab = "login" | "register";

interface AuthPromptState {
  open: boolean;
  tab: Tab;
  reason: string | null;
  onSuccess: (() => void) | null;
  onCancel: (() => void) | null;
  /** Open the auth dialog; onSuccess runs after sign-in (used to replay the pending request). */
  request: (reason: string | null, onSuccess?: () => void, onCancel?: () => void, tab?: Tab) => void;
  succeed: () => void;
  cancel: () => void;
}

export const useAuthPrompt = create<AuthPromptState>((set, get) => ({
  open: false,
  tab: "login",
  reason: null,
  onSuccess: null,
  onCancel: null,
  request: (reason, onSuccess, onCancel, tab = "login") => {
    // a second request while open cancels the first pending action
    get().onCancel?.();
    set({ open: true, reason, tab, onSuccess: onSuccess ?? null, onCancel: onCancel ?? null });
  },
  succeed: () => {
    const cb = get().onSuccess;
    set({ open: false, reason: null, onSuccess: null, onCancel: null });
    cb?.();
  },
  cancel: () => {
    const cb = get().onCancel;
    set({ open: false, reason: null, onSuccess: null, onCancel: null });
    cb?.();
  },
}));
