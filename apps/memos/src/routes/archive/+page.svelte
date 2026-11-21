<script lang="ts">
  import Archive from "#lib/components/views/Archive.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const selectedDate = $derived(
    data.filters.date ? new Date(`${data.filters.date}T00:00:00`) : undefined,
  );
</script>

<Archive
  memos={data.memos}
  nextCursor={data.nextCursor}
  initialTags={data.filters.tags}
  {selectedDate}
/>
