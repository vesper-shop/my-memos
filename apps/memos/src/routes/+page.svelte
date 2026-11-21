<script lang="ts">
  import Home from "#lib/components/views/Home.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const selectedDate = $derived(
    data.filters.date ? new Date(`${data.filters.date}T00:00:00`) : undefined,
  );
</script>

<Home
  memos={data.memos}
  nextCursor={data.nextCursor}
  activityMemos={data.activityMemos}
  memoStats={data.memoStats}
  tags={data.tags}
  initialSearch={data.filters.search}
  initialTags={data.filters.tags}
  viewAsPublic={data.filters.viewAsPublic}
  sortByUpdated={data.filters.sortByUpdated}
  {selectedDate}
/>
