import { create } from 'zustand';

interface UserState {
  userId: string | null;
  fullName: string | null;
  email: string | null;
  phoneNumber: string | null;
  publicKey: string | null;
  isAuthenticated: boolean;
  jwt: string | null;
}

interface BalanceState {
  online: number;
  offline: number;
  pendingOnline: number;
  lastSyncedAt: number | null;
}

interface PreferencesState {
  darkTheme: boolean;
  notifications: boolean;
  biometrics: boolean;
}

interface AppStore {
  user: UserState;
  balance: BalanceState;
  preferences: PreferencesState;
  setUser: (user: Partial<UserState>) => void;
  setBalance: (balance: Partial<BalanceState>) => void;
  setPreferences: (prefs: Partial<PreferencesState>) => void;
  logout: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: {
    userId: null,
    fullName: null,
    email: null,
    phoneNumber: null,
    publicKey: null,
    isAuthenticated: false,
    jwt: null
  },
  balance: {
    online: 0,
    offline: 0,
    pendingOnline: 0,
    lastSyncedAt: null
  },
  preferences: {
    darkTheme: false,
    notifications: true,
    biometrics: false,
  },
  setUser: (userData) => set((state) => ({ user: { ...state.user, ...userData } })),
  setBalance: (balanceData) => set((state) => ({ balance: { ...state.balance, ...balanceData } })),
  setPreferences: (prefs) => set((state) => {
    const newPrefs = { ...state.preferences, ...prefs };
    return { preferences: newPrefs };
  }),
  logout: () => set({ 
    user: { userId: null, fullName: null, email: null, phoneNumber: null, publicKey: null, isAuthenticated: false, jwt: null },
    balance: { online: 0, offline: 0, pendingOnline: 0, lastSyncedAt: null }
  }),
}));
