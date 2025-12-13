<script>
  import ImagePlus from "@lucide/svelte/icons/image-plus";
  import { domToPng } from "modern-screenshot";
  import Button from "../ui/button/button.svelte";

  let { nodeId = "", playerName = "" } = $props();
  let hide = $state(false);

  function takeScreenshot() {
    // Hide the button before taking the screenshot
    hide = true;

    const node = document.getElementById(nodeId);

    if (!node) {
      console.error(`Element with id '${nodeId}' not found.`);
      return;
    }

    domToPng(node, { quality: 1 })
      .then((dataUrl) => {
        const link = document.createElement("a");
        const date = new Date();
        const timestamp = date.toISOString().replace(/[:.]/g, "-");

        link.download = `${playerName || "screenshot"}-${timestamp}.png`;
        link.href = dataUrl;
        link.click();

        link.remove();
      })
      .finally(() => {
        hide = false;
      });
  }
</script>

<div class="w-full sm:hidden">
  {#if !hide}
    <Button
      disabled={hide}
      onclick={takeScreenshot}
      class="w-full bg-purple-600 text-white rounded-lg hover:bg-purple-700"
    >
      <ImagePlus />
      Take screenshot
    </Button>
  {/if}
</div>
