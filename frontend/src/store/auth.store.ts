import { create } from "zustand";

import type { User } from "../types/api";

const TOKEN_STORAGE_KEY = "batfin_jwt";

interface AuthState {
  token: string | null;
  user: User | null;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

function readStoredToken() {
  try {
    const localToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (localToken) return localToken;
  } catch {
    // Fall through to session storage when local storage is unavailable.
  }

  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistToken(token: string) {
  let persisted = false;

  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    persisted = true;
  } catch {
    // Session storage below is the fallback for restricted browser contexts.
  }

  try {
    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    persisted = true;
  } catch {
    // The current in-memory session remains usable if browser storage is blocked.
  }

  return persisted;
}

function removeStoredToken() {
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Continue clearing the remaining session state.
  }

  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // The in-memory session is still cleared below.
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: readStoredToken(),
  user: null,
  setSession: (token, user) => {
    persistToken(token);
    set({ token, user });
  },
  setUser: (user) => set({ user }),
  logout: () => {
    removeStoredToken();
    set({ token: null, user: null });
  },
}));
