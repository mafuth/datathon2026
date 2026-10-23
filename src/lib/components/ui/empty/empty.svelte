<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import { cn } from '$lib/utils/utils.js';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
  data-slot="empty"
  class={cn(
    'flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed p-6 text-center',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
