import { useAuth } from "./AuthContext";

// Every component that needs "is X available on this shop's plan" asks here — never
// compares a tier string directly. That comparison lives in exactly one place, the
// backend's config/features.js; /api/auth/me already resolves it into the plain feature
// list this just reads off the logged-in user, so a locked feature is simply absent from
// the list rather than requiring this hook (or any caller) to know the tier rules at all.
export const useFeature = (key) => {
  const { user } = useAuth();
  return !!user?.shop?.features?.includes(key);
};
