<script lang="ts">
  export let total: number = 0;
  export let remaining: number = 0;
  export let show: boolean = false;
  export let colorClass: string = "bg-purple-600";

  $: percent =
    total > 0 ? Math.max(0, Math.min(100, Math.round(((total - remaining) / total) * 100))) : 0;
</script>

{#if show}
  <div class="fixed top-0 left-0 right-0 z-50 pointer-events-none">
    <div class="h-2 w-full bg-white/40">
      <div class={`h-2 transition-all ease-linear ${colorClass}`} style="width: {percent}%;"></div>
    </div>

    <div class="w-full flex justify-left mt-3 ml-2 pointer-events-none">
      <div class="p-2 rounded-lg text-xs text-white bg-black/40 backdrop-blur-sm">
        {remaining}
      </div>
    </div>
  </div>
{/if}

<style>
  .transition-all {
    transition-property: width;
    transition-duration: 300ms;
  }
</style>
