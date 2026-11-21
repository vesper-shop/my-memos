<script lang="ts">
  import Chat from "#lib/components/views/Chat.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<Chat user={data.user} />
