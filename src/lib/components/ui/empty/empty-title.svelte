<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import { cn } from '$lib/utils/utils.js';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLHeadingElement> = $props();
</script>

<h3 data-slot="empty-title" class={cn('text-sm font-semibold tracking-tight', className)} {...restProps}>
  {@render children?.()}
</h3>
