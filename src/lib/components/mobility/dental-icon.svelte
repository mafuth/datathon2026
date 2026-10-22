<script lang="ts">
  import type { IconNode, IconProps } from '@lucide/svelte';

  import { Icon } from '@lucide/svelte';

  let props: IconProps = $props();

  // Match the stroke, sizing and accessibility conventions of the Lucide set.
  const tooth: IconNode = [
    [
      'path',
      {
        d: 'M12 5.5c-1-1.2-2.2-2-3.9-2C5.6 3.5 4 5.2 4 8c0 2.5 1 4 1.7 6.3.5 1.9.7 6.2 2.7 6.2 1.3 0 1.4-5.8 3.6-5.8s2.3 5.8 3.6 5.8c2 0 2.2-4.3 2.7-6.2C19 12 20 10.5 20 8c0-2.8-1.6-4.5-4.1-4.5-1.7 0-2.9.8-3.9 2Z'
      }
    ],
    ['path', { d: 'M12 5.5 14 7' }]
  ];
</script>

<Icon name="tooth" iconNode={tooth} {...props} />
