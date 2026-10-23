<script lang="ts">
  let { active = false }: { active?: boolean } = $props();
</script>

{#if active}
  <div class="presentation-cursor" data-presentation-cursor aria-hidden="true">
    <img src="/cursor.png" alt="" width="42" height="42" />
  </div>
{/if}

<style>
  .presentation-cursor {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 2100;
    width: 42px;
    height: 42px;
    pointer-events: none;
    transform: translate(-5px, -5px);
    filter: drop-shadow(0 0.2rem 0.25rem rgb(24 24 27 / 28%));
    transition: opacity 160ms ease;
  }

  .presentation-cursor img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
