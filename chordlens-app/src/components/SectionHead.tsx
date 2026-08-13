import type { ReactNode } from 'react'

interface Props {
  /** Section name, shown in the header. */
  title: ReactNode
  /** Whether the section's body is showing. */
  open?: boolean
  /** Omit to render a plain, non-collapsible header. */
  onToggle?: () => void
  /** Id of the region being collapsed, for assistive tech. */
  controls?: string
  /** This section's own controls, laid out to the right of the title. */
  children?: ReactNode
}

/**
 * The header row every view shares: a title that folds the section away, plus
 * whatever controls belong to that view.
 *
 * Collapsing is per-section rather than one global switch — with six views
 * stacked up, which ones you want on screen depends on what you're playing.
 */
export function SectionHead({ title, open = true, onToggle, controls, children }: Props) {
  return (
    <div
      className={`view-title view-title--row${
        onToggle && !open ? ' view-title--collapsed' : ''
      }`}
    >
      {onToggle ? (
        <button
          type="button"
          className="section-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={controls}
          title={open ? 'Hide this view' : 'Show this view'}
        >
          <span
            className={`section-chevron${open ? '' : ' section-chevron--closed'}`}
            aria-hidden="true"
          >
            ▾
          </span>
          {title}
        </button>
      ) : (
        <span>{title}</span>
      )}
      {children}
    </div>
  )
}
