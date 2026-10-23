<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import { cn } from '$lib/utils/utils.js';

  let {
    class: className,
    children,
    variant = 'default',
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'icon' } = $props();
</script>

<div
  data-slot="empty-media"
  data-variant={variant}
  class={cn(
    'flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-5',
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
