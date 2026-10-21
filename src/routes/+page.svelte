<script lang="ts">
  import NationalAccessibilityMap from '$components/mobility/national-accessibility-map.svelte';
  import { PresentationController } from '$components/mobility/presentation-controller.svelte';
  import PresentationReader from '$components/mobility/presentation-reader.svelte';

  const controller = new PresentationController();
</script>

<svelte:window onkeydown={(event) => controller.handleKeydown(event)} />

<NationalAccessibilityMap
  presentationActive={controller.active}
  presentationStep={controller.active ? controller.currentStep : null}
  readerMode={controller.mode === 'reader'}
/>

{#if controller.mode === 'reader'}
  <PresentationReader step={controller.currentStep} />
{/if}
