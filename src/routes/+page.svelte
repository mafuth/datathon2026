<script lang="ts">
  import NationalAccessibilityMap from '$components/mobility/national-accessibility-map.svelte';
  import { PresentationController } from '$components/mobility/presentation-controller.svelte';

  const controller = new PresentationController();
</script>

<svelte:head>
  <link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin="anonymous" />
</svelte:head>

<svelte:window onkeydown={(event) => controller.handleKeydown(event)} />

<NationalAccessibilityMap
  presentationActive={controller.active}
  presentationStep={controller.active ? controller.currentStep : null}
  readerMode={controller.mode === 'reader'}
/>

{#if controller.mode === 'reader'}
  {#await import('$components/mobility/presentation-reader.svelte') then { default: PresentationReader }}
    <PresentationReader step={controller.currentStep} />
  {/await}
{/if}
