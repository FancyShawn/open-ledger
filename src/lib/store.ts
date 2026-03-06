import { create } from "zustand";
import type { Transaction, Account, AccountRule, SkipRule, Member } from "@/types";

interface AppStore {
  // Transactions
  transactions: Transaction[];
  setTransactions: (txs: Transaction[]) => void;
  addTransactions: (txs: Transaction[]) => void;

  // Draft transactions (parsed but not yet saved, survives page navigation)
  draftTransactions: Transaction[];
  setDraftTransactions: (
    txs: Transaction[] | ((prev: Transaction[]) => Transaction[]),
  ) => void;
  clearDraftTransactions: () => void;

  // Accounts
  accounts: Account[];
  setAccounts: (accounts: Account[]) => void;

  // Unified Rules (replaces old classification rules + payment method mappings)
  rules: AccountRule[];
  setRules: (rules: AccountRule[]) => void;

  // Skip Rules
  skipRules: SkipRule[];
  setSkipRules: (rules: SkipRule[]) => void;

  // Members
  members: Member[];
  setMembers: (members: Member[]) => void;

  // Upload context
  currentPeriod: string; // YYYY-MM
  setCurrentPeriod: (period: string) => void;

  // UI state
  loading: boolean;
  setLoading: (loading: boolean) => void;
}

export const useStore = create<AppStore>((set) => ({
  transactions: [],
  setTransactions: (txs) => set({ transactions: txs }),
  addTransactions: (txs) =>
    set((state) => ({ transactions: [...state.transactions, ...txs] })),

  draftTransactions: [],
  setDraftTransactions: (txs) => {
    if (typeof txs === "function") {
      set((state) => ({ draftTransactions: txs(state.draftTransactions) }));
    } else {
      set({ draftTransactions: txs });
    }
  },
  clearDraftTransactions: () => set({ draftTransactions: [] }),

  accounts: [],
  setAccounts: (accounts) => set({ accounts }),

  rules: [],
  setRules: (rules) => set({ rules }),

  skipRules: [],
  setSkipRules: (skipRules) => set({ skipRules }),

  members: [],
  setMembers: (members) => set({ members }),

  currentPeriod: "",
  setCurrentPeriod: (currentPeriod) => set({ currentPeriod }),

  loading: false,
  setLoading: (loading) => set({ loading }),
}));
