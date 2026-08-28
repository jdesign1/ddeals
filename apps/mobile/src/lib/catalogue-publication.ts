import { getSupabaseClient } from "./supabase-client";

/**
 * Subscribes to the single public catalogue publication row. The row is
 * updated only after the published materialized cache refresh succeeds, so
 * this event is an invalidation signal rather than a second data source.
 *
 * Calling the callback when the channel becomes SUBSCRIBED is intentional:
 * it covers both the initial subscription and a later realtime reconnect.
 * The callback must revalidate the durable publication marker because an app
 * can miss events while its tab or device is asleep.
 */
export function subscribeToCataloguePublication(onPublished: () => void): () => void {
  const client = getSupabaseClient();
  const channel = client
    .channel("catalogue-publication")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "catalogue_publications",
        filter: "id=eq.live",
      },
      onPublished
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onPublished();
    });

  return () => {
    void client.removeChannel(channel);
  };
}
