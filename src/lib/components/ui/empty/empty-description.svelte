<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  import { cn } from '$lib/utils/utils.js';

  let { class: className, children, ...restProps }: HTMLAttributes<HTMLParagraphElement> = $props();
</script>

<p data-slot="empty-description" class={cn('text-sm leading-normal text-muted-foreground', className)} {...restProps}>
  {@render children?.()}
</p>
