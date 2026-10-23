import type { User } from "@dodgey-deals/shared";
import { requireAccountsAdmin } from "@/lib/accounts-server";

export async function isCommunityModerator(user: User | null | undefined): Promise<boolean> {
  if (!user || user.is_anonymous) return false;
  try {
    const accounts = requireAccountsAdmin();
    const { data, error } = await accounts
      .from("community_moderators")
      .select("account_id")
      .eq("account_id", user.id)
      .eq("active", true)
      .maybeSingle();
    return !error && Boolean(data?.account_id);
  } catch {
    return false;
  }
}
