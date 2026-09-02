import { Link } from 'react-router-dom'

/**
 * Placeholder — "Coming soon" page for unbuilt routes.
 * Styled consistently with the main dashboard theme.
 */
export default function Placeholder({ title = 'Page', icon = 'construction' }) {
  return (
    <div className="min-h-screen bg-outer flex items-center justify-center p-6">
      <div className="bg-panel rounded-3xl p-12 text-center max-w-md w-full">
        <span
          className="material-symbols-rounded text-text-panel block"
          style={{ fontSize: '64px', opacity: 0.7 }}
        >
          {icon}
        </span>

        <h1 className="font-display text-text-panel text-3xl font-bold mt-4">
          {title}
        </h1>

        <p className="text-text-panel/50 mt-3 text-sm">
          Coming soon
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 bg-card text-text-card rounded-full font-medium text-sm hover:opacity-90 transition-opacity no-underline"
        >
          <span className="material-symbols-rounded" style={{ fontSize: '18px' }}>
            arrow_back
          </span>
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
