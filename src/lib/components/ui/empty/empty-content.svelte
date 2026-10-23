<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import { cn } from '$lib/utils/utils.js';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="empty-content"
  class={cn('flex w-full max-w-sm items-center justify-center gap-2', className)}
  {...restProps}
>
  {@render children?.()}
</div>
