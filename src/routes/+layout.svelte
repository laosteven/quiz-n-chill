<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import "../app.css";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>Quiz n' Chill</title>
  <meta name="description" content="Self-hosted quiz game" />
</svelte:head>

{@render children()}
