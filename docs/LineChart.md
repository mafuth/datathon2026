# LineChart

Streamlined visualization of data points connected by lines to visualize trends or changes over time.

**Category:** charts

**Supported Layers:** svg, canvas

## Usage

```svelte
<script lang="ts">
  import { defaultChartPadding, LineChart } from 'layerchart';

  import { createDateSeries } from '$lib/utils/data.js';

  const data = createDateSeries({ count: 30, min: 50, max: 100, value: 'integer' });
</script>

<LineChart {data} x="date" y="value" padding={defaultChartPadding({ right: 10 })} height={300} />
```

### Long data

`c` names the categories the rows already carry, so one line is drawn per category and colored from the `c` scale — no `series`, and nothing pivoted into a column per fruit first. See the [Data guide](/docs/guides/data#long-format) for how the split is resolved.

```svelte
<LineChart {data} x="year" y="value" c="fruit" legend />
```

```svelte
<script lang="ts">
  import { sort } from '@layerstack/utils';
  import { scalePoint } from 'd3-scale';
  import { LineChart } from 'layerchart';

  import { longData } from '$lib/utils/data.js';

  // A point scale takes the domain in data order, so the years have to arrive in it
  const data = sort(longData, 'year');
</script>

<LineChart
  {data}
  x="year"
  xScale={scalePoint()}
  y="value"
  c="fruit"
  legend
  cRange={['var(--color-apples)', 'var(--color-bananas)', 'var(--color-cherries)', 'var(--color-grapes)']}
  props={{
    xAxis: { format: 'none' },
    yAxis: { format: 'metric' }
  }}
  height={300}
/>
```

## API

| Property     | Type                                                                                                                                | Default                                                         | Description                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| data         | `TData[] \| readonly TData[]`                                                                                                       | -                                                               | The data for the chart                                           |
| orientation  | `'horizontal' \| 'vertical'`                                                                                                        | `'horizontal'`                                                  | The orientation of the chart. Sets which axis is the value axis. |
| series       | `SeriesData&lt;TData, Component&lt;SplineProps&gt;&gt;[]`                                                                           | `[{ key: 'default', value: y, color: 'var(--color-primary)' }]` | The series data to be used for the chart.                        |
| onPointClick | `(e: MouseEvent, details: { data: HighlightPointData; series: SeriesData&lt;TData, Component&lt;SplineProps&gt;&gt;; }) =&gt; void` | -                                                               | The event to be dispatched when the point is clicked.            |
| profile      | `boolean`                                                                                                                           | `false`                                                         | Enable profiling to measure render time.                         |

**Extends:** `Omit<ChartProps<any>, 'data'>`

## Examples

- [axis-labels-inside](https://www.layerchart.com/docs/components/LineChart/axis-labels-inside)
- [basic](https://www.layerchart.com/docs/components/LineChart/basic)
- [brush](https://www.layerchart.com/docs/components/LineChart/brush)
- [brush-pan-zoom](https://www.layerchart.com/docs/components/LineChart/brush-pan-zoom)
- [bump-sports-rankings](https://www.layerchart.com/docs/components/LineChart/bump-sports-rankings)
- [bump-state-population-ranks](https://www.layerchart.com/docs/components/LineChart/bump-state-population-ranks)
- [curve](https://www.layerchart.com/docs/components/LineChart/curve)
- [custom](https://www.layerchart.com/docs/components/LineChart/custom)
- [custom-tooltip](https://www.layerchart.com/docs/components/LineChart/custom-tooltip)
- [default-series-label](https://www.layerchart.com/docs/components/LineChart/default-series-label)
- [draw](https://www.layerchart.com/docs/components/LineChart/draw)
- [dynamic-data](https://www.layerchart.com/docs/components/LineChart/dynamic-data)
- [gradient-encoding](https://www.layerchart.com/docs/components/LineChart/gradient-encoding)
- [gradient-threshold](https://www.layerchart.com/docs/components/LineChart/gradient-threshold)
- [labels](https://www.layerchart.com/docs/components/LineChart/labels)
- [labels-with-points](https://www.layerchart.com/docs/components/LineChart/labels-with-points)
- [labels-within-points](https://www.layerchart.com/docs/components/LineChart/labels-within-points)
- [large-radial-series](https://www.layerchart.com/docs/components/LineChart/large-radial-series)
- [large-series](https://www.layerchart.com/docs/components/LineChart/large-series)
- [legend](https://www.layerchart.com/docs/components/LineChart/legend)
- [line-annotation](https://www.layerchart.com/docs/components/LineChart/line-annotation)
- [long-data](https://www.layerchart.com/docs/components/LineChart/long-data)
- [motion-tween](https://www.layerchart.com/docs/components/LineChart/motion-tween)
- [null-dashed-gaps](https://www.layerchart.com/docs/components/LineChart/null-dashed-gaps)
- [null-gaps](https://www.layerchart.com/docs/components/LineChart/null-gaps)
- [oscilloscope-time](https://www.layerchart.com/docs/components/LineChart/oscilloscope-time)
- [override-color](https://www.layerchart.com/docs/components/LineChart/override-color)
- [pan-zoom](https://www.layerchart.com/docs/components/LineChart/pan-zoom)
- [pan-zoom-custom-constrain](https://www.layerchart.com/docs/components/LineChart/pan-zoom-custom-constrain)
- [pan-zoom-domain-extent](https://www.layerchart.com/docs/components/LineChart/pan-zoom-domain-extent)
- [pan-zoom-dynamic-data](https://www.layerchart.com/docs/components/LineChart/pan-zoom-dynamic-data)
- [pan-zoom-with-overview](https://www.layerchart.com/docs/components/LineChart/pan-zoom-with-overview)
- [perf-dimension-arrays](https://www.layerchart.com/docs/components/LineChart/perf-dimension-arrays)
- [perf-dimension-arrays-processed](https://www.layerchart.com/docs/components/LineChart/perf-dimension-arrays-processed)
- [perf-series-arrays](https://www.layerchart.com/docs/components/LineChart/perf-series-arrays)
- [perf-streaming](https://www.layerchart.com/docs/components/LineChart/perf-streaming)
- [perf-wide-data](https://www.layerchart.com/docs/components/LineChart/perf-wide-data)
- [perf-wide-data-processed](https://www.layerchart.com/docs/components/LineChart/perf-wide-data-processed)
- [persist-brush-zoom](https://www.layerchart.com/docs/components/LineChart/persist-brush-zoom)
- [persist-series](https://www.layerchart.com/docs/components/LineChart/persist-series)
- [point-annotations](https://www.layerchart.com/docs/components/LineChart/point-annotations)
- [points](https://www.layerchart.com/docs/components/LineChart/points)
- [radar](https://www.layerchart.com/docs/components/LineChart/radar)
- [radar-rounded](https://www.layerchart.com/docs/components/LineChart/radar-rounded)
- [radar-series](https://www.layerchart.com/docs/components/LineChart/radar-series)
- [range-annotation](https://www.layerchart.com/docs/components/LineChart/range-annotation)
- [series](https://www.layerchart.com/docs/components/LineChart/series)
- [series-brush](https://www.layerchart.com/docs/components/LineChart/series-brush)
- [series-custom-highlight-point](https://www.layerchart.com/docs/components/LineChart/series-custom-highlight-point)
- [series-individual-tooltip](https://www.layerchart.com/docs/components/LineChart/series-individual-tooltip)
- [series-labels-hover](https://www.layerchart.com/docs/components/LineChart/series-labels-hover)
- [series-point-annotations](https://www.layerchart.com/docs/components/LineChart/series-point-annotations)
- [series-point-click](https://www.layerchart.com/docs/components/LineChart/series-point-click)
- [series-programmatic-control](https://www.layerchart.com/docs/components/LineChart/series-programmatic-control)
- [series-separate-data](https://www.layerchart.com/docs/components/LineChart/series-separate-data)
- [series-separate-data-diff-length](https://www.layerchart.com/docs/components/LineChart/series-separate-data-diff-length)
- [series-vertical](https://www.layerchart.com/docs/components/LineChart/series-vertical)
- [series-with-nulls](https://www.layerchart.com/docs/components/LineChart/series-with-nulls)
- [single-axis-x](https://www.layerchart.com/docs/components/LineChart/single-axis-x)
- [single-axis-y](https://www.layerchart.com/docs/components/LineChart/single-axis-y)
- [smart-labels-with-points](https://www.layerchart.com/docs/components/LineChart/smart-labels-with-points)
- [sparkline](https://www.layerchart.com/docs/components/LineChart/sparkline)
- [sparkline-fixed-position-tooltip](https://www.layerchart.com/docs/components/LineChart/sparkline-fixed-position-tooltip)
- [sparkline-within-a-paragraph](https://www.layerchart.com/docs/components/LineChart/sparkline-within-a-paragraph)
- [sparkline-within-a-paragraph-with-tooltip-and-highlight](https://www.layerchart.com/docs/components/LineChart/sparkline-within-a-paragraph-with-tooltip-and-highlight)
- [sparkline-zero-axis](https://www.layerchart.com/docs/components/LineChart/sparkline-zero-axis)
- [svelte-milestones](https://www.layerchart.com/docs/components/LineChart/svelte-milestones)
- [threshold](https://www.layerchart.com/docs/components/LineChart/threshold)
- [tooltip-click](https://www.layerchart.com/docs/components/LineChart/tooltip-click)
- [vertical](https://www.layerchart.com/docs/components/LineChart/vertical)

## Related

- [Chart](https://www.layerchart.com/docs/components/Chart)
- [Spline](https://www.layerchart.com/docs/components/Spline)
