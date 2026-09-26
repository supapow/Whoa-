import { autocompletion, type CompletionContext, type CompletionResult, type Completion } from '@codemirror/autocomplete'

/**
 * Custom Whoa! Animation and Effect classes.
 * All custom animation and effect classes strictly start with `whoa-` or `whoa_`.
 */
export const WHOA_CLASSES: Completion[] = [
  // Entrance & General Animations
  {
    label: 'whoa-anim-rise',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Rise entrance: smoothly translates upward from below into resting position.',
    boost: 99,
  },
  {
    label: 'whoa_anim_rise',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Rise entrance: smoothly translates upward from below into resting position.',
    boost: 98,
  },
  {
    label: 'whoa-anim-fade',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Fade entrance: opacity transitions smoothly from 0 to 1 with cubic ease-out.',
    boost: 99,
  },
  {
    label: 'whoa_anim_fade',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Fade entrance: opacity transitions smoothly from 0 to 1 with cubic ease-out.',
    boost: 98,
  },
  {
    label: 'whoa-anim-pop',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Pop entrance: scales up from 0% with energetic spring easing.',
    boost: 99,
  },
  {
    label: 'whoa_anim_pop',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Pop entrance: scales up from 0% with energetic spring easing.',
    boost: 98,
  },
  {
    label: 'whoa-anim-slide',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Slide entrance: directional horizontal slide into view.',
    boost: 99,
  },
  {
    label: 'whoa_anim_slide',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Slide entrance: directional horizontal slide into view.',
    boost: 98,
  },
  {
    label: 'whoa-anim-blur',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Blur dissolve: transitions from out-of-focus blur into crisp focus.',
    boost: 99,
  },
  {
    label: 'whoa_anim_blur',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Blur dissolve: transitions from out-of-focus blur into crisp focus.',
    boost: 98,
  },
  {
    label: 'whoa-anim-rotate',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Rotate entrance: rotates along angular axis into 0 degrees rest position.',
    boost: 99,
  },
  {
    label: 'whoa_anim_rotate',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Rotate entrance: rotates along angular axis into 0 degrees rest position.',
    boost: 98,
  },
  {
    label: 'whoa-anim-pulse',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Pulse animation: rhythmic scaling heart-beat effect.',
    boost: 99,
  },
  {
    label: 'whoa_anim_pulse',
    type: 'keyword',
    detail: 'Whoa! Animation (underscore)',
    info: 'Pulse animation: rhythmic scaling heart-beat effect.',
    boost: 98,
  },
  {
    label: 'whoa-anim-none',
    type: 'keyword',
    detail: 'Whoa! Animation',
    info: 'Static element: disables entrance animation.',
    boost: 90,
  },

  // Directional In Animations
  { label: 'whoa-in-rise', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance rise animation.' },
  { label: 'whoa-in-fade', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance fade animation.' },
  { label: 'whoa-in-pop', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance pop scale animation.' },
  { label: 'whoa-in-slide', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance slide animation.' },
  { label: 'whoa-in-blur', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance blur animation.' },
  { label: 'whoa-in-rotate', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance rotate animation.' },
  { label: 'whoa-in-pulse', type: 'keyword', detail: 'Whoa! In-Anim', info: 'Explicit entrance pulse animation.' },

  // Directional Out Animations
  { label: 'whoa-out-rise', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit rise animation before end trim.' },
  { label: 'whoa-out-fade', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit fade animation before end trim.' },
  { label: 'whoa-out-pop', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit pop scale-down animation.' },
  { label: 'whoa-out-slide', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit slide animation.' },
  { label: 'whoa-out-blur', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit blur dissolve animation.' },
  { label: 'whoa-out-rotate', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit rotation animation.' },
  { label: 'whoa-out-pulse', type: 'keyword', detail: 'Whoa! Out-Anim', info: 'Exit pulse animation.' },

  // Text FX Staggered Effects
  {
    label: 'whoa-fx-stagger-up',
    type: 'keyword',
    detail: 'Whoa! Text FX',
    info: 'Stagger Up: Each letter rises from bottom left-to-right with staggered delay.',
    boost: 95,
  },
  {
    label: 'whoa_fx_stagger_up',
    type: 'keyword',
    detail: 'Whoa! Text FX (underscore)',
    info: 'Stagger Up: Each letter rises from bottom left-to-right with staggered delay.',
    boost: 94,
  },
  {
    label: 'whoa-fx-pop-in',
    type: 'keyword',
    detail: 'Whoa! Text FX',
    info: 'Pop In: Letters spring outward from center with staggered pop scaling.',
    boost: 95,
  },
  {
    label: 'whoa_fx_pop_in',
    type: 'keyword',
    detail: 'Whoa! Text FX (underscore)',
    info: 'Pop In: Letters spring outward from center with staggered pop scaling.',
    boost: 94,
  },
  {
    label: 'whoa-fx-blur-in',
    type: 'keyword',
    detail: 'Whoa! Text FX',
    info: 'Blur In: Letters dissolve from frosted glass blur into crisp readability.',
    boost: 95,
  },
  {
    label: 'whoa_fx_blur_in',
    type: 'keyword',
    detail: 'Whoa! Text FX (underscore)',
    info: 'Blur In: Letters dissolve from frosted glass blur into crisp readability.',
    boost: 94,
  },
  {
    label: 'whoa-fx-drop-in',
    type: 'keyword',
    detail: 'Whoa! Text FX',
    info: 'Drop In: Words cascade down one by one.',
    boost: 95,
  },
  {
    label: 'whoa_fx_drop_in',
    type: 'keyword',
    detail: 'Whoa! Text FX (underscore)',
    info: 'Drop In: Words cascade down one by one.',
    boost: 94,
  },
  {
    label: 'whoa-fx-wave',
    type: 'keyword',
    detail: 'Whoa! Text FX',
    info: 'Wave: Continuous looping undulating wave across all letters.',
    boost: 96,
  },
  {
    label: 'whoa_fx_wave',
    type: 'keyword',
    detail: 'Whoa! Text FX (underscore)',
    info: 'Wave: Continuous looping undulating wave across all letters.',
    boost: 95,
  },

  // Layer Types & Markers
  { label: 'whoa-artboard', type: 'class', detail: 'Whoa! Canvas', info: 'Artboard root container element.' },
  { label: 'whoa-layer', type: 'class', detail: 'Whoa! Canvas', info: 'Interactive canvas layer element.' },
  { label: 'whoa-layer-text', type: 'class', detail: 'Whoa! Layer', info: 'Typography / headline / copy layer.' },
  { label: 'whoa-layer-button', type: 'class', detail: 'Whoa! Layer', info: 'Interactive call-to-action button layer.' },
  { label: 'whoa-layer-image', type: 'class', detail: 'Whoa! Layer', info: 'Image asset layer.' },
  { label: 'whoa-layer-shape', type: 'class', detail: 'Whoa! Layer', info: 'Vector shape (rect, circle, star, etc.) layer.' },
  { label: 'whoa-layer-path', type: 'class', detail: 'Whoa! Layer', info: 'Custom vector Bézier path layer.' },
  { label: 'whoa-component', type: 'class', detail: 'Whoa! Component', info: 'Instantiated design component instance.' },
]

/**
 * Curated Tailwind CSS Utility Classes.
 */
export const TAILWIND_CLASSES: Completion[] = [
  // Layout & Positioning
  { label: 'relative', type: 'class', detail: 'Tailwind Layout', info: 'position: relative;' },
  { label: 'absolute', type: 'class', detail: 'Tailwind Layout', info: 'position: absolute;' },
  { label: 'fixed', type: 'class', detail: 'Tailwind Layout', info: 'position: fixed;' },
  { label: 'inset-0', type: 'class', detail: 'Tailwind Spacing', info: 'inset: 0px;' },
  { label: 'top-0', type: 'class', detail: 'Tailwind Spacing', info: 'top: 0px;' },
  { label: 'bottom-0', type: 'class', detail: 'Tailwind Spacing', info: 'bottom: 0px;' },
  { label: 'left-0', type: 'class', detail: 'Tailwind Spacing', info: 'left: 0px;' },
  { label: 'right-0', type: 'class', detail: 'Tailwind Spacing', info: 'right: 0px;' },
  { label: 'z-0', type: 'class', detail: 'Tailwind Z-Index', info: 'z-index: 0;' },
  { label: 'z-10', type: 'class', detail: 'Tailwind Z-Index', info: 'z-index: 10;' },
  { label: 'z-20', type: 'class', detail: 'Tailwind Z-Index', info: 'z-index: 20;' },
  { label: 'z-30', type: 'class', detail: 'Tailwind Z-Index', info: 'z-index: 30;' },
  { label: 'z-40', type: 'class', detail: 'Tailwind Z-Index', info: 'z-index: 40;' },
  { label: 'z-50', type: 'class', detail: 'Tailwind Z-Index', info: 'z-index: 50;' },

  // Flexbox & Grid
  { label: 'flex', type: 'class', detail: 'Tailwind Flexbox', info: 'display: flex;' },
  { label: 'inline-flex', type: 'class', detail: 'Tailwind Flexbox', info: 'display: inline-flex;' },
  { label: 'grid', type: 'class', detail: 'Tailwind Grid', info: 'display: grid;' },
  { label: 'hidden', type: 'class', detail: 'Tailwind Display', info: 'display: none;' },
  { label: 'block', type: 'class', detail: 'Tailwind Display', info: 'display: block;' },
  { label: 'inline-block', type: 'class', detail: 'Tailwind Display', info: 'display: inline-block;' },
  { label: 'flex-col', type: 'class', detail: 'Tailwind Flexbox', info: 'flex-direction: column;' },
  { label: 'flex-row', type: 'class', detail: 'Tailwind Flexbox', info: 'flex-direction: row;' },
  { label: 'flex-wrap', type: 'class', detail: 'Tailwind Flexbox', info: 'flex-wrap: wrap;' },
  { label: 'items-center', type: 'class', detail: 'Tailwind Flexbox', info: 'align-items: center;' },
  { label: 'items-start', type: 'class', detail: 'Tailwind Flexbox', info: 'align-items: flex-start;' },
  { label: 'items-end', type: 'class', detail: 'Tailwind Flexbox', info: 'align-items: flex-end;' },
  { label: 'justify-center', type: 'class', detail: 'Tailwind Flexbox', info: 'justify-content: center;' },
  { label: 'justify-between', type: 'class', detail: 'Tailwind Flexbox', info: 'justify-content: space-between;' },
  { label: 'justify-start', type: 'class', detail: 'Tailwind Flexbox', info: 'justify-content: flex-start;' },
  { label: 'justify-end', type: 'class', detail: 'Tailwind Flexbox', info: 'justify-content: flex-end;' },
  { label: 'gap-1', type: 'class', detail: 'Tailwind Gap', info: 'gap: 0.25rem;' },
  { label: 'gap-2', type: 'class', detail: 'Tailwind Gap', info: 'gap: 0.5rem;' },
  { label: 'gap-3', type: 'class', detail: 'Tailwind Gap', info: 'gap: 0.75rem;' },
  { label: 'gap-4', type: 'class', detail: 'Tailwind Gap', info: 'gap: 1rem;' },
  { label: 'gap-6', type: 'class', detail: 'Tailwind Gap', info: 'gap: 1.5rem;' },
  { label: 'gap-8', type: 'class', detail: 'Tailwind Gap', info: 'gap: 2rem;' },

  // Sizing & Overflow
  { label: 'w-full', type: 'class', detail: 'Tailwind Sizing', info: 'width: 100%;' },
  { label: 'w-auto', type: 'class', detail: 'Tailwind Sizing', info: 'width: auto;' },
  { label: 'w-screen', type: 'class', detail: 'Tailwind Sizing', info: 'width: 100vw;' },
  { label: 'h-full', type: 'class', detail: 'Tailwind Sizing', info: 'height: 100%;' },
  { label: 'h-auto', type: 'class', detail: 'Tailwind Sizing', info: 'height: auto;' },
  { label: 'h-screen', type: 'class', detail: 'Tailwind Sizing', info: 'height: 100vh;' },
  { label: 'max-w-xs', type: 'class', detail: 'Tailwind Sizing', info: 'max-width: 20rem;' },
  { label: 'max-w-sm', type: 'class', detail: 'Tailwind Sizing', info: 'max-width: 24rem;' },
  { label: 'max-w-md', type: 'class', detail: 'Tailwind Sizing', info: 'max-width: 28rem;' },
  { label: 'max-w-lg', type: 'class', detail: 'Tailwind Sizing', info: 'max-width: 32rem;' },
  { label: 'max-w-xl', type: 'class', detail: 'Tailwind Sizing', info: 'max-width: 36rem;' },
  { label: 'overflow-hidden', type: 'class', detail: 'Tailwind Overflow', info: 'overflow: hidden;' },
  { label: 'overflow-visible', type: 'class', detail: 'Tailwind Overflow', info: 'overflow: visible;' },
  { label: 'select-none', type: 'class', detail: 'Tailwind Interactivity', info: 'user-select: none;' },

  // Spacing (Padding & Margin)
  { label: 'p-1', type: 'class', detail: 'Tailwind Spacing', info: 'padding: 0.25rem;' },
  { label: 'p-2', type: 'class', detail: 'Tailwind Spacing', info: 'padding: 0.5rem;' },
  { label: 'p-3', type: 'class', detail: 'Tailwind Spacing', info: 'padding: 0.75rem;' },
  { label: 'p-4', type: 'class', detail: 'Tailwind Spacing', info: 'padding: 1rem;' },
  { label: 'p-6', type: 'class', detail: 'Tailwind Spacing', info: 'padding: 1.5rem;' },
  { label: 'p-8', type: 'class', detail: 'Tailwind Spacing', info: 'padding: 2rem;' },
  { label: 'px-2', type: 'class', detail: 'Tailwind Spacing', info: 'padding-left: 0.5rem; padding-right: 0.5rem;' },
  { label: 'px-3', type: 'class', detail: 'Tailwind Spacing', info: 'padding-left: 0.75rem; padding-right: 0.75rem;' },
  { label: 'px-4', type: 'class', detail: 'Tailwind Spacing', info: 'padding-left: 1rem; padding-right: 1rem;' },
  { label: 'px-6', type: 'class', detail: 'Tailwind Spacing', info: 'padding-left: 1.5rem; padding-right: 1.5rem;' },
  { label: 'px-8', type: 'class', detail: 'Tailwind Spacing', info: 'padding-left: 2rem; padding-right: 2rem;' },
  { label: 'py-1', type: 'class', detail: 'Tailwind Spacing', info: 'padding-top: 0.25rem; padding-bottom: 0.25rem;' },
  { label: 'py-2', type: 'class', detail: 'Tailwind Spacing', info: 'padding-top: 0.5rem; padding-bottom: 0.5rem;' },
  { label: 'py-3', type: 'class', detail: 'Tailwind Spacing', info: 'padding-top: 0.75rem; padding-bottom: 0.75rem;' },
  { label: 'py-4', type: 'class', detail: 'Tailwind Spacing', info: 'padding-top: 1rem; padding-bottom: 1rem;' },
  { label: 'm-auto', type: 'class', detail: 'Tailwind Spacing', info: 'margin: auto;' },
  { label: 'mx-auto', type: 'class', detail: 'Tailwind Spacing', info: 'margin-left: auto; margin-right: auto;' },

  // Typography
  { label: 'text-xs', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 0.75rem; line-height: 1rem;' },
  { label: 'text-sm', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 0.875rem; line-height: 1.25rem;' },
  { label: 'text-base', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 1rem; line-height: 1.5rem;' },
  { label: 'text-lg', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 1.125rem; line-height: 1.75rem;' },
  { label: 'text-xl', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 1.25rem; line-height: 1.75rem;' },
  { label: 'text-2xl', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 1.5rem; line-height: 2rem;' },
  { label: 'text-3xl', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 1.875rem; line-height: 2.25rem;' },
  { label: 'text-4xl', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 2.25rem; line-height: 2.5rem;' },
  { label: 'text-5xl', type: 'class', detail: 'Tailwind Typography', info: 'font-size: 3rem; line-height: 1;' },
  { label: 'font-thin', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 100;' },
  { label: 'font-light', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 300;' },
  { label: 'font-normal', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 400;' },
  { label: 'font-medium', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 500;' },
  { label: 'font-semibold', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 600;' },
  { label: 'font-bold', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 700;' },
  { label: 'font-extrabold', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 800;' },
  { label: 'font-black', type: 'class', detail: 'Tailwind Typography', info: 'font-weight: 900;' },
  { label: 'font-mono', type: 'class', detail: 'Tailwind Typography', info: 'font-family: monospace;' },
  { label: 'text-center', type: 'class', detail: 'Tailwind Typography', info: 'text-align: center;' },
  { label: 'text-left', type: 'class', detail: 'Tailwind Typography', info: 'text-align: left;' },
  { label: 'text-right', type: 'class', detail: 'Tailwind Typography', info: 'text-align: right;' },
  { label: 'tracking-tight', type: 'class', detail: 'Tailwind Typography', info: 'letter-spacing: -0.025em;' },
  { label: 'tracking-wide', type: 'class', detail: 'Tailwind Typography', info: 'letter-spacing: 0.025em;' },
  { label: 'tracking-wider', type: 'class', detail: 'Tailwind Typography', info: 'letter-spacing: 0.05em;' },
  { label: 'leading-none', type: 'class', detail: 'Tailwind Typography', info: 'line-height: 1;' },
  { label: 'leading-tight', type: 'class', detail: 'Tailwind Typography', info: 'line-height: 1.25;' },
  { label: 'leading-normal', type: 'class', detail: 'Tailwind Typography', info: 'line-height: 1.5;' },
  { label: 'truncate', type: 'class', detail: 'Tailwind Typography', info: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' },
  { label: 'uppercase', type: 'class', detail: 'Tailwind Typography', info: 'text-transform: uppercase;' },

  // Background Colors & Gradients
  { label: 'bg-white', type: 'class', detail: 'Tailwind Color', info: 'background-color: #ffffff;' },
  { label: 'bg-black', type: 'class', detail: 'Tailwind Color', info: 'background-color: #000000;' },
  { label: 'bg-transparent', type: 'class', detail: 'Tailwind Color', info: 'background-color: transparent;' },
  { label: 'bg-neutral-900', type: 'class', detail: 'Tailwind Color', info: 'background-color: rgb(23 23 23);' },
  { label: 'bg-neutral-800', type: 'class', detail: 'Tailwind Color', info: 'background-color: rgb(38 38 38);' },
  { label: 'bg-neutral-100', type: 'class', detail: 'Tailwind Color', info: 'background-color: rgb(245 245 245);' },
  { label: 'bg-blue-500', type: 'class', detail: 'Tailwind Color', info: 'background-color: #3b82f6;' },
  { label: 'bg-blue-600', type: 'class', detail: 'Tailwind Color', info: 'background-color: #2563eb;' },
  { label: 'bg-emerald-500', type: 'class', detail: 'Tailwind Color', info: 'background-color: #10b981;' },
  { label: 'bg-amber-500', type: 'class', detail: 'Tailwind Color', info: 'background-color: #f59e0b;' },
  { label: 'bg-rose-500', type: 'class', detail: 'Tailwind Color', info: 'background-color: #f43f5e;' },
  { label: 'bg-purple-600', type: 'class', detail: 'Tailwind Color', info: 'background-color: #9333ea;' },
  { label: 'bg-accent', type: 'class', detail: 'Tailwind Color', info: 'var(--color-accent);' },

  // Text Colors
  { label: 'text-white', type: 'class', detail: 'Tailwind Color', info: 'color: #ffffff;' },
  { label: 'text-black', type: 'class', detail: 'Tailwind Color', info: 'color: #000000;' },
  { label: 'text-neutral-400', type: 'class', detail: 'Tailwind Color', info: 'color: rgb(163 163 163);' },
  { label: 'text-neutral-300', type: 'class', detail: 'Tailwind Color', info: 'color: rgb(212 212 212);' },
  { label: 'text-neutral-200', type: 'class', detail: 'Tailwind Color', info: 'color: rgb(229 229 229);' },
  { label: 'text-blue-400', type: 'class', detail: 'Tailwind Color', info: 'color: #60a5fa;' },
  { label: 'text-emerald-400', type: 'class', detail: 'Tailwind Color', info: 'color: #34d399;' },
  { label: 'text-amber-400', type: 'class', detail: 'Tailwind Color', info: 'color: #fbbf24;' },
  { label: 'text-accent', type: 'class', detail: 'Tailwind Color', info: 'var(--color-accent);' },

  // Borders & Radii
  { label: 'border', type: 'class', detail: 'Tailwind Border', info: 'border-width: 1px;' },
  { label: 'border-2', type: 'class', detail: 'Tailwind Border', info: 'border-width: 2px;' },
  { label: 'border-white/10', type: 'class', detail: 'Tailwind Border', info: 'border-color: rgba(255, 255, 255, 0.1);' },
  { label: 'border-white/20', type: 'class', detail: 'Tailwind Border', info: 'border-color: rgba(255, 255, 255, 0.2);' },
  { label: 'border-transparent', type: 'class', detail: 'Tailwind Border', info: 'border-color: transparent;' },
  { label: 'rounded-none', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 0px;' },
  { label: 'rounded-sm', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 0.125rem;' },
  { label: 'rounded-md', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 0.375rem;' },
  { label: 'rounded-lg', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 0.5rem;' },
  { label: 'rounded-xl', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 0.75rem;' },
  { label: 'rounded-2xl', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 1rem;' },
  { label: 'rounded-3xl', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 1.5rem;' },
  { label: 'rounded-full', type: 'class', detail: 'Tailwind Radius', info: 'border-radius: 9999px;' },

  // Shadows, Opacity & Blur
  { label: 'shadow-sm', type: 'class', detail: 'Tailwind Shadow', info: 'box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);' },
  { label: 'shadow-md', type: 'class', detail: 'Tailwind Shadow', info: 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);' },
  { label: 'shadow-lg', type: 'class', detail: 'Tailwind Shadow', info: 'box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);' },
  { label: 'shadow-xl', type: 'class', detail: 'Tailwind Shadow', info: 'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);' },
  { label: 'shadow-2xl', type: 'class', detail: 'Tailwind Shadow', info: 'box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);' },
  { label: 'opacity-0', type: 'class', detail: 'Tailwind Opacity', info: 'opacity: 0;' },
  { label: 'opacity-25', type: 'class', detail: 'Tailwind Opacity', info: 'opacity: 0.25;' },
  { label: 'opacity-50', type: 'class', detail: 'Tailwind Opacity', info: 'opacity: 0.5;' },
  { label: 'opacity-75', type: 'class', detail: 'Tailwind Opacity', info: 'opacity: 0.75;' },
  { label: 'opacity-90', type: 'class', detail: 'Tailwind Opacity', info: 'opacity: 0.9;' },
  { label: 'opacity-100', type: 'class', detail: 'Tailwind Opacity', info: 'opacity: 1;' },
  { label: 'blur-xs', type: 'class', detail: 'Tailwind Blur', info: 'filter: blur(2px);' },
  { label: 'blur-sm', type: 'class', detail: 'Tailwind Blur', info: 'filter: blur(4px);' },
  { label: 'blur-md', type: 'class', detail: 'Tailwind Blur', info: 'filter: blur(8px);' },
  { label: 'backdrop-blur-md', type: 'class', detail: 'Tailwind Blur', info: 'backdrop-filter: blur(12px);' },
  { label: 'backdrop-blur-xl', type: 'class', detail: 'Tailwind Blur', info: 'backdrop-filter: blur(24px);' },

  // Transitions, Transforms & Media
  { label: 'transition-all', type: 'class', detail: 'Tailwind Transition', info: 'transition-property: all;' },
  { label: 'transition-transform', type: 'class', detail: 'Tailwind Transition', info: 'transition-property: transform;' },
  { label: 'transition-opacity', type: 'class', detail: 'Tailwind Transition', info: 'transition-property: opacity;' },
  { label: 'duration-150', type: 'class', detail: 'Tailwind Transition', info: 'transition-duration: 150ms;' },
  { label: 'duration-200', type: 'class', detail: 'Tailwind Transition', info: 'transition-duration: 200ms;' },
  { label: 'duration-300', type: 'class', detail: 'Tailwind Transition', info: 'transition-duration: 300ms;' },
  { label: 'duration-500', type: 'class', detail: 'Tailwind Transition', info: 'transition-duration: 500ms;' },
  { label: 'ease-in-out', type: 'class', detail: 'Tailwind Transition', info: 'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);' },
  { label: 'ease-out', type: 'class', detail: 'Tailwind Transition', info: 'transition-timing-function: cubic-bezier(0, 0, 0.2, 1);' },
  { label: 'scale-95', type: 'class', detail: 'Tailwind Transform', info: 'transform: scale(0.95);' },
  { label: 'scale-105', type: 'class', detail: 'Tailwind Transform', info: 'transform: scale(1.05);' },
  { label: 'cursor-pointer', type: 'class', detail: 'Tailwind Interactivity', info: 'cursor: pointer;' },
  { label: 'object-cover', type: 'class', detail: 'Tailwind Media', info: 'object-fit: cover;' },
  { label: 'object-contain', type: 'class', detail: 'Tailwind Media', info: 'object-fit: contain;' },
]

/** All completions combined */
export const ALL_COMPLETIONS: Completion[] = [...WHOA_CLASSES, ...TAILWIND_CLASSES]

/**
 * Autocompletion source for CodeMirror 6.
 * Offers Tailwind utilities and Whoa! effect/animation classes.
 */
export function tailwindAndWhoaAutocompleteSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w\-:_]+/)
  if (!word && !context.explicit) return null

  const query = word ? word.text.toLowerCase() : ''
  const isWhoaPrefix = query.startsWith('whoa-') || query.startsWith('whoa_') || query.startsWith('whoa')

  // If query starts with whoa, sort Whoa classes first with priority
  let options = ALL_COMPLETIONS
  if (isWhoaPrefix) {
    options = [
      ...WHOA_CLASSES.map((c) => ({ ...c, boost: (c.boost ?? 90) + 50 })),
      ...TAILWIND_CLASSES,
    ]
  }

  return {
    from: word ? word.from : context.pos,
    options,
    validFor: /^[\w\-:_]*$/,
  }
}

/**
 * CodeMirror Autocompletion extension configured with Tailwind & Whoa! classes.
 */
export const tailwindAutocompleteExtension = autocompletion({
  override: [tailwindAndWhoaAutocompleteSource],
  defaultKeymap: true,
  icons: true,
})
