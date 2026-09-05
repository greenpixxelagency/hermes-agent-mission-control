---
name: gp-design
description: Applies the Green Pixxel UI/UX design language to AI intelligence, executive SaaS, dashboards, financial workflows, and product interfaces. Use when designing, building, reviewing, or improving Green Pixxel visual systems, interaction design, Tailwind UI, metric layouts, tables, menus, sheets, or motion.
---

# Green Pixxel Design

## Purpose

Create a world-class AI intelligence and executive SaaS platform blending Apple Human Interface Guidelines, Emil Kowalski Fluid Motion, and rigorous CFO accounting discipline. Prefer quiet confidence, exceptional legibility, clear provenance, and tactile feedback over decorative effects.

## Brand Persona & Aesthetic Foundations

- Use a Dual-Theme Architecture: True OLED Black (`#000000`) dark mode and Executive Slate (`#F8FAFC`) light mode with high-contrast surfaces and hairline borders.
- Use Luxury Emerald / Deep Forest Teal (`#0F766E` / `#10B981` / `#033E32`) for focused actions, positive states, and brand moments. Do not use emerald as general decoration.
- Make surfaces layered but restrained: page → raised surface → floating glass panel. Separate layers with 1px low-contrast borders, not heavy shadows.
- Favor compact executive density with generous alignment, deliberate whitespace, and a clear information hierarchy. One screen should answer: what changed, why it matters, and what happens next.
- Use semantic state colors. Green means confirmed/healthy, amber means attention or review, red means an actionable failure, and neutral means unavailable or informational.
- Preserve accessibility: visible keyboard focus, minimum 44px pointer targets for primary controls, readable contrast, and `prefers-reduced-motion` alternatives.

## Typography

- Display & Headings: Plus Jakarta Sans (`font-display font-extrabold tracking-tight`). Use for page titles, section headings, and major financial emphasis.
- Body & Controls: Inter (`font-sans font-medium` with `-0.011em` tracking). Use concise, direct labels and sentence-case actions.
- Numbers & Metrics: High-contrast Monospace (`font-mono font-extrabold` or `tabular-nums`). Right-align financial columns and keep unit, currency, period, and magnitude clear.
- Prefer a small hierarchy: page title, section title, label, supporting text. Do not rely on size alone; pair hierarchy with weight, color, and spacing.

## Apple Fluid Motion & Tactile Physics (Emil Kowalski HIG)

- Give Instant Pointer-Down Response (`active:scale-[0.975]` / `active:scale-[0.98]`, never wait for click release) to every pressable control.
- Use critically damped springs (`damping: 1.0` / `cubic-bezier(0.16, 1, 0.3, 1)`) for sheets, menus, popovers.
- Use origin-anchored transitions (`transform-origin: [trigger]`) with symmetric enter/exit geometry.
- Keep motion interruptible: a new input takes over immediately; do not queue or force an animation to finish.
- Use frosted glass materials (`backdrop-blur-md` / `glass-panel`) only for floating context such as menus, sheets, command bars, and sticky table headers.
- Default transitions: opacity and transform only, 160–240ms. Avoid layout animation where a simple fade/scale communicates state faster.

```css
/* Put this in global CSS. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 1ms !important;
  }
}

.gp-enter {
  animation: gp-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: var(--gp-origin, top center);
}

@keyframes gp-enter {
  from { opacity: 0; transform: translateY(-4px) scale(.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
```

## Strict Data & Financial Layout Standards

- Zero-Truncation Policy: Metric cards, values, and status tags must NEVER truncate with ellipses (`...`). Use multi-row matrices, balanced wrapping, and `whitespace-nowrap` on individual atomic chips.
- Accounting Strictness: Missing data must never silently default to `0` or `0.00`. It must render explicit status badges (`Config Required`, `Not Yet Available`, `—`).
- Never invent a metric, trend, balance, amount, date, or confidence level. Label estimates, pending values, and unavailable integrations explicitly.
- Keep financial values atomic: currency symbol + amount + unit + period should remain together. Use `tabular-nums`, fixed or `minmax()` column layouts, and a horizontally scrollable table rather than clipping data.
- Show source/provenance and refresh state near executive or financial claims. A human must be able to distinguish observed data, computed data, and missing data.
- Do not use color as the only status signal; pair it with text and, where useful, an icon.

```tsx
// Correct: explicit absence, no invented zero.
const metricValue = value == null
  ? <StatusBadge tone="neutral">Not Yet Available</StatusBadge>
  : <span className="font-mono font-extrabold tabular-nums">{formatCurrency(value)}</span>

// Incorrect: value ?? 0, truncate, or text-ellipsis on financial values.
```

## Copy-paste Tailwind Configuration

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gp: {
          emerald: '#0F766E',
          mint: '#10B981',
          forest: '#033E32',
          ink: '#000000',
          slate: '#F8FAFC',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      transitionTimingFunction: {
        gp: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        gp: '0 18px 50px rgb(2 6 23 / .12)',
        'gp-dark': '0 18px 50px rgb(0 0 0 / .42)',
      },
    },
  },
} satisfies Config
```

```css
/* globals.css */
:root {
  --gp-canvas: #F8FAFC;
  --gp-surface: #FFFFFF;
  --gp-raised: #FFFFFF;
  --gp-text: #0F172A;
  --gp-muted: #475569;
  --gp-faint: #64748B;
  --gp-line: rgb(15 23 42 / .12);
  --gp-accent: #0F766E;
  --gp-accent-strong: #033E32;
  --gp-accent-soft: rgb(16 185 129 / .11);
  --gp-good: #0F766E;
  --gp-warn: #B45309;
  --gp-danger: #B91C1C;
  --gp-glass: rgb(255 255 255 / .72);
}

.dark {
  --gp-canvas: #000000;
  --gp-surface: #090909;
  --gp-raised: #111111;
  --gp-text: #F8FAFC;
  --gp-muted: #CBD5E1;
  --gp-faint: #94A3B8;
  --gp-line: rgb(248 250 252 / .14);
  --gp-accent: #10B981;
  --gp-accent-strong: #0F766E;
  --gp-accent-soft: rgb(16 185 129 / .16);
  --gp-good: #34D399;
  --gp-warn: #FBBF24;
  --gp-danger: #F87171;
  --gp-glass: rgb(9 9 9 / .72);
}

.glass-panel {
  background: var(--gp-glass);
  border: 1px solid var(--gp-line);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}
```

## Component Primitives

### Tactile Button

```tsx
const tactileButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-sans text-sm font-medium tracking-[-0.011em] transition-[transform,background-color,border-color,box-shadow] duration-180 ease-gp active:scale-[0.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gp-mint focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45'

// Primary: `${tactileButton} bg-gp-emerald text-white shadow-gp hover:bg-gp-forest dark:shadow-gp-dark`
// Secondary: `${tactileButton} border border-[var(--gp-line)] bg-[var(--gp-raised)] text-[var(--gp-text)] hover:bg-[var(--gp-accent-soft)]`
```

### Executive Metric Card

```tsx
<section className="rounded-2xl border border-[var(--gp-line)] bg-[var(--gp-raised)] p-5 shadow-sm">
  <p className="font-sans text-xs font-medium tracking-[-0.011em] text-[var(--gp-muted)]">Operating cash</p>
  <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
    <p className="font-mono text-2xl font-extrabold tabular-nums tracking-tight text-[var(--gp-text)]">$248,400.00</p>
    <StatusBadge tone="good">Reconciled</StatusBadge>
  </div>
  <p className="mt-3 text-xs text-[var(--gp-faint)]">As of 31 Mar 2026 · Ledger source</p>
</section>
```

### Status Badge

```tsx
type Tone = 'good' | 'warn' | 'danger' | 'neutral' | 'accent'
const statusTone: Record<Tone, string> = {
  good: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  danger: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  neutral: 'border-[var(--gp-line)] bg-[var(--gp-surface)] text-[var(--gp-muted)]',
  accent: 'border-gp-emerald/30 bg-[var(--gp-accent-soft)] text-gp-emerald dark:text-gp-mint',
}

function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex max-w-full items-center rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium tracking-[-0.011em] whitespace-nowrap ${statusTone[tone]}`}>{children}</span>
}
```

### Translucent Glass Panel

```tsx
<aside className="glass-panel gp-enter rounded-2xl p-5 shadow-gp dark:shadow-gp-dark">
  {/* Menus, sheets, popovers, command surfaces only. */}
</aside>
```

### Sticky Financial Table

```tsx
<div className="overflow-x-auto rounded-2xl border border-[var(--gp-line)]">
  <table className="min-w-full border-separate border-spacing-0 text-sm">
    <thead className="sticky top-0 z-10 bg-[var(--gp-glass)] backdrop-blur-md">
      <tr className="text-left text-xs text-[var(--gp-muted)]">
        <th className="whitespace-nowrap border-b border-[var(--gp-line)] px-4 py-3 font-medium">Account</th>
        <th className="whitespace-nowrap border-b border-[var(--gp-line)] px-4 py-3 text-right font-medium">Amount</th>
        <th className="whitespace-nowrap border-b border-[var(--gp-line)] px-4 py-3 font-medium">Status</th>
      </tr>
    </thead>
    <tbody>{/* Keep values complete; allow the container to scroll, never ellipsis. */}</tbody>
  </table>
</div>
```

## Implementation Checklist

- [ ] Use the semantic CSS variables; do not hard-code one-off theme colors.
- [ ] Use Plus Jakarta Sans for display, Inter for controls, and tabular monospace for metrics.
- [ ] Add pointer-down scale and interruptible transform/opacity motion to interactive UI.
- [ ] Preserve every metric and status label in full; no financial ellipses or silent zeroes.
- [ ] Give missing data an explicit state and source-aware supporting copy.
- [ ] Verify dark OLED and light Executive Slate at desktop and mobile widths.
