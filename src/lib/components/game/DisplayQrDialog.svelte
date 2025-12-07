<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { useQRCode } from "$lib/composables/useQRCode.svelte";
  import { onMount, type Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  let {
    children,
    class: className,
  }: {
    children: Snippet | null;
    class?: ClassValue | null | undefined;
  } = $props();

  const qrCode = useQRCode();

  onMount(() => {
    qrCode.generate();
  });

  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger onclick={() => (open = true)} class={className}>
    {@render children?.()}
  </Dialog.Trigger>
  <Dialog.Content class="sm:max-w-[425px]">
    <Dialog.Header>
      <Dialog.Title>QR code</Dialog.Title>
    </Dialog.Header>
    <div class="text-center">
      {#if qrCode.qrCodeDataUrl}
        <img src={qrCode.qrCodeDataUrl} alt="QR Code to join game" class="mx-auto mb-2" />
      {/if}
      <p class="text-sm text-muted-foreground break-all">
        {qrCode.joinUrl}
      </p>
    </div>
  </Dialog.Content>
</Dialog.Root>
