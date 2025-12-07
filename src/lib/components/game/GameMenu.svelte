<script>
  import QrCode from "@lucide/svelte/icons/qr-code";
  import { buttonVariants } from "../ui/button";
  import DisplayQrDialog from "./DisplayQrDialog.svelte";
</script>

<div class="absolute top-5 right-5 z-50">
  <DisplayQrDialog class={buttonVariants({ variant: "outline", size: "icon" })}>
    <QrCode />
  </DisplayQrDialog>
</div>
