<script lang="ts">
  import type { PresentationSection, PresentationStory } from '$lib/mobility/presentation-contracts';

  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  import { Button } from '$components/ui/button';
  import * as Card from '$components/ui/card';

  type Props = { story: PresentationStory; sectionIndex: number; sectionProgress: number };
  let { story, sectionIndex, sectionProgress }: Props = $props();
  let patientExpanded = $state(true);
  let pickupExpanded = $state(false);
  let automatedSectionId = $state<string | null>(null);
  let patientSections = $derived(story.sections.filter((section) => section.branch !== 'pickup'));
  let pickupSections = $derived(story.sections.filter((section) => section.branch === 'pickup'));
  let pickupStarted = $derived(sectionIndex >= story.sections.findIndex((section) => section.branch === 'pickup'));
  let currentSection = $derived(story.sections[sectionIndex]);
  $effect(() => {
    const section = currentSection;
    if (!section || automatedSectionId === section.id) return;
    automatedSectionId = section.id;
    if (section.branch === 'pickup') {
      patientExpanded = false;
      pickupExpanded = true;
    } else if (section.mode === 'handoff' || section.branch === 'merged') {
      patientExpanded = true;
      pickupExpanded = false;
    } else if (sectionIndex === 0) {
      patientExpanded = true;
      pickupExpanded = false;
    }
  });
  let elapsedSeconds = $derived.by(() =>
    story.sections.reduce((sum, section, index) => {
      if (section.branch === 'pickup' || section.timing.seconds === null) return sum;
      if (index < sectionIndex) return sum + section.timing.seconds;
      if (index === sectionIndex) return sum + section.timing.seconds * sectionProgress;
      return sum;
    }, 0)
  );
  let timerColor = $derived(color(sectionIndex));

  function clock(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function duration(seconds: number | null): string {
    if (seconds === null) return '?';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours ? `${hours}h${minutes ? ` ${minutes}m` : ''}` : `${minutes}m`;
  }

  function color(index: number): string {
    const section = story.sections[index];
    const colors: Record<string, string> = {
      'ferry-baarah-vashafaru': '#16a34a',
      'ferry-vashafaru-dhihdhoo': '#65a30d',
      'wait-dhihdhoo': '#ca8a04',
      'ferry-dhihdhoo-hanimaadhoo': '#d97706',
      'hanimaadhoo-transfer': '#d97706',
      'weather-delay-hanimaadhoo': '#b45309',
      'flight-takeoff': '#f97316',
      'pickup-walk': '#f59e0b',
      'pickup-wait': '#f97316',
      'pickup-r9': '#ea580c',
      'pickup-airport-wait': '#dc4c16',
      'flight-landing-handoff': '#dc2626',
      'ambulance-tree-top': '#b91c1c'
    };
    return section ? (colors[section.id] ?? '#71717a') : '#71717a';
  }

  function sectionState(section: PresentationSection): 'complete' | 'current' | 'future' {
    const index = story.sections.indexOf(section);
    if (index < sectionIndex) return 'complete';
    return index === sectionIndex ? 'current' : 'future';
  }

  function fill(section: PresentationSection): number {
    const currentState = sectionState(section);
    if (currentState === 'complete') return 100;
    return currentState === 'current' ? sectionProgress * 100 : 0;
  }

  function modeIcon(mode: PresentationSection['mode']): { src: string; alt: string } {
    return {
      ferry: { src: '/images/presentation/motor-boat.png', alt: 'Motor boat' },
      aircraft: { src: '/images/presentation/airplane.png', alt: 'Airplane' },
      walk: { src: '/images/presentation/walking.png', alt: 'Walking' },
      transfer: { src: '/images/presentation/walking.png', alt: 'Transfer' },
      bus: { src: '/images/presentation/bus.png', alt: 'Bus' },
      wait: { src: '/images/presentation/standing.png', alt: 'Waiting' },
      handoff: { src: '/images/presentation/ambulance.png', alt: 'Ambulance handoff' },
      ambulance: { src: '/images/presentation/ambulance.png', alt: 'Ambulance' }
    }[mode];
  }

  function location(section: PresentationSection): string {
    const locations: Record<string, string> = {
      'ferry-baarah-vashafaru': 'Haa Alifu · Baarah → Vashafaru',
      'ferry-vashafaru-dhihdhoo': 'Haa Alifu · Vashafaru → Dhidhdhoo',
      'wait-dhihdhoo': 'Haa Alifu · Dhidhdhoo',
      'ferry-dhihdhoo-hanimaadhoo': 'Haa Alifu → Haa Dhaalu · Hanimaadhoo',
      'hanimaadhoo-transfer': 'Haa Dhaalu · Hanimaadhoo Airport',
      'weather-delay-hanimaadhoo': 'Haa Dhaalu · Hanimaadhoo Airport',
      'flight-takeoff': 'Hanimaadhoo → Kaafu · Hulhulé / Velana',
      'pickup-walk': 'MLE · Hulhumalé → Vinares',
      'pickup-wait': 'MLE · Vinares Bus Stop',
      'pickup-r9': 'MLE · Hulhumalé → Kaafu · Velana',
      'pickup-airport-wait': 'Kaafu · Hulhulé / Velana',
      'flight-landing-handoff': 'Kaafu · Velana Airport',
      'ambulance-tree-top': 'Kaafu · Velana → MLE · Tree Top Hospital'
    };
    return locations[section.id] ?? section.title;
  }
</script>

<Card.Root class="presentation-timeline" aria-live="polite">
  <Card.Content class="presentation-content">
    <header>
      <div><strong>Baarah → Tree Top Hospital</strong></div>
      <b style={`color:${timerColor}`}
        >{clock(elapsedSeconds)} <small>/ {clock(story.timeline.criticalPathSeconds)}</small></b
      >
    </header>

    <div class="journey-scroll">
      <section class="journey-rail" aria-label="Patient journey">
        <Button
          class="journey-heading"
          variant="ghost"
          type="button"
          aria-expanded={patientExpanded}
          aria-controls="presentation-patient-journey"
          onclick={() => (patientExpanded = !patientExpanded)}
        >
          <span>Patient journey</span>
          <ChevronDown class={{ expanded: patientExpanded }} size={14} aria-hidden="true" />
        </Button>
        {#if patientExpanded}
          <div id="presentation-patient-journey">
            {#each patientSections as section (section.id)}
              {@const index = story.sections.indexOf(section)}
              {@const icon = modeIcon(section.mode)}
              <article
                class={[`step-${sectionState(section)}`, { unknown: section.timing.seconds === null }]}
                style={`--step-color:${color(index)};--step-fill:${fill(section)}%`}
              >
                <div class="rail"><i></i><span></span></div>
                <img src={icon.src} alt={icon.alt} width="32" height="32" />
                <div class="step-copy"><strong>{location(section)}</strong><small>{section.title}</small></div>
                <time>{duration(section.timing.seconds)}</time>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      {#if pickupStarted}
        <section class="pickup-rail" aria-label="Parallel pickup journey">
          <Button
            class="pickup-heading"
            variant="ghost"
            type="button"
            aria-expanded={pickupExpanded}
            aria-controls="presentation-pickup-journey"
            onclick={() => (pickupExpanded = !pickupExpanded)}
          >
            <span>Parallel pickup</span>
            <ChevronDown class={{ expanded: pickupExpanded }} size={14} aria-hidden="true" />
          </Button>
          {#if pickupExpanded}
            <div id="presentation-pickup-journey">
              {#each pickupSections as section (section.id)}
                {@const index = story.sections.indexOf(section)}
                {@const icon = modeIcon(section.mode)}
                <article
                  class={[`step-${sectionState(section)}`, { unknown: section.timing.seconds === null }]}
                  style={`--step-color:${color(index)};--step-fill:${fill(section)}%`}
                >
                  <div class="rail"><i></i><span></span></div>
                  <img src={icon.src} alt={icon.alt} width="28" height="28" />
                  <div class="step-copy"><strong>{location(section)}</strong><small>{section.title}</small></div>
                  <time>{duration(section.timing.seconds)}</time>
                </article>
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  </Card.Content>
</Card.Root>

<style>
  :global(.presentation-timeline) {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
    width: min(24rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: hidden;
    border: 1px solid rgb(212 212 216 / 90%) !important;
    border-radius: 1rem;
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    background: rgb(255 255 255 / 98%) !important;
    color: #18181b !important;
    color-scheme: light !important;
    box-shadow:
      0 1rem 3rem rgb(24 24 27 / 16%),
      0 0.15rem 0.5rem rgb(24 24 27 / 8%);
    backdrop-filter: blur(16px);
    pointer-events: auto;
  }
  :global(.presentation-content) {
    display: grid;
    gap: 0.7rem;
    padding: 0.85rem !important;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 0.65rem;
    border-bottom: 1px solid #e4e4e7;
  }
  header > div {
    display: grid;
    min-width: 0;
  }
  header strong {
    overflow: hidden;
    font-size: 0.8rem;
    font-weight: 900;
    letter-spacing: -0.03em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  header b {
    flex: 0 0 auto;
    font-size: 0.9rem;
    letter-spacing: -0.04em;
  }
  header b small {
    color: #71717a;
    font-size: 0.52rem;
  }
  .journey-scroll {
    max-height: calc(100dvh - 7rem);
    overflow: hidden auto;
    color-scheme: light;
    scrollbar-width: thin;
    scrollbar-color: #a1a1aa #f4f4f5;
  }
  .journey-scroll::-webkit-scrollbar {
    width: 0.45rem;
  }
  .journey-scroll::-webkit-scrollbar-track {
    background: #f4f4f5;
  }
  .journey-scroll::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #a1a1aa;
  }
  :global(.journey-heading),
  :global(.pickup-heading) {
    border-color: transparent !important;
    background: #ffffff !important;
    color: #52525b !important;
  }
  :global(.journey-heading:hover),
  :global(.pickup-heading:hover) {
    background: #f4f4f5 !important;
    color: #18181b !important;
  }
  .journey-rail,
  .pickup-rail {
    display: grid;
  }
  :global(.journey-heading),
  :global(.pickup-heading) {
    display: flex;
    width: 100%;
    height: 1.75rem;
    justify-content: space-between;
    padding: 0 0.45rem 0 0.35rem;
    color: #71717a;
    font-size: 0.46rem;
    font-weight: 800;
    text-transform: uppercase;
  }
  :global(.journey-heading svg),
  :global(.pickup-heading svg) {
    transition: transform 160ms ease;
  }
  :global(.journey-heading svg.expanded),
  :global(.pickup-heading svg.expanded) {
    transform: rotate(180deg);
  }
  article {
    position: relative;
    display: grid;
    min-height: 3.45rem;
    grid-template-columns: 1rem 2.4rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.48rem;
    opacity: 0.48;
  }
  article.step-complete,
  article.step-current {
    opacity: 1;
  }
  .rail {
    position: relative;
    align-self: stretch;
  }
  .rail::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    content: '';
    transform: translateX(-50%);
    background: #e4e4e7;
  }
  .rail i {
    position: absolute;
    top: 0;
    bottom: calc(100% - var(--step-fill));
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: var(--step-color);
  }
  .rail span {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    width: 0.7rem;
    height: 0.7rem;
    transform: translate(-50%, -50%);
    border: 2px solid #fff;
    border-radius: 50%;
    background: color-mix(in srgb, var(--step-color) 25%, #d4d4d8);
    box-shadow: 0 0 0 1px rgb(63 63 70 / 22%);
  }
  .step-complete .rail span,
  .step-current .rail span {
    background: var(--step-color);
  }
  .step-current .rail span {
    box-shadow:
      0 0 0 1px #18181b,
      0 0 0 5px color-mix(in srgb, var(--step-color) 18%, transparent);
  }
  article img {
    display: block;
    width: 2rem;
    height: 2rem;
    object-fit: contain;
    filter: saturate(0.45);
    opacity: 0.55;
  }
  .step-complete img,
  .step-current img {
    filter: none;
    opacity: 1;
  }
  .step-current img {
    width: 2.25rem;
    height: 2.25rem;
    transform: translateX(-0.12rem);
    filter: drop-shadow(0 0.22rem 0.22rem rgb(24 24 27 / 18%));
  }
  .step-copy {
    display: grid;
    min-width: 0;
  }
  .step-copy strong,
  .step-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .step-copy strong {
    font-size: 0.61rem;
    font-weight: 850;
  }
  .step-copy small {
    color: #71717a;
    font-size: 0.49rem;
  }
  time {
    color: #52525b;
    font-size: 0.55rem;
    font-weight: 850;
  }
  .unknown time {
    font-size: 0.7rem;
  }
  .pickup-rail {
    margin: 0.6rem 0 0 1rem;
    padding: 0.55rem 0 0.15rem 0.55rem;
    border-top: 1px dashed #d4d4d8;
    border-left: 1px solid #d4d4d8;
    border-radius: 0.6rem 0 0;
    background: #fafafa;
  }
  .pickup-rail article {
    min-height: 3rem;
    grid-template-columns: 0.8rem 2.1rem minmax(0, 1fr) auto;
  }
  .pickup-rail article img {
    width: 1.75rem;
    height: 1.75rem;
  }
  @media (max-width: 44rem) {
    :global(.presentation-timeline) {
      top: auto;
      right: 0.5rem;
      bottom: 0.5rem;
      width: calc(100vw - 1rem);
      max-height: 45dvh;
    }
    .journey-scroll {
      max-height: calc(45dvh - 4.5rem);
    }
    article {
      min-height: 3rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
