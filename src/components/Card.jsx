export default function Card({
  title,
  children,
  className = '',
  accentBorder = false,
  id,
  style = {},
}) {
  return (
    <div
      id={id}
      style={{
        background: '#F5E6A0',
        borderRadius: '32px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        boxSizing: 'border-box',
        ...(accentBorder
          ? { boxShadow: '0 0 0 2px #2D8FE0' }
          : {}),
        ...style,
      }}
      className={className}
    >
      {title && (
        <h3
          style={{
            fontFamily: "'Caesar Dressing', system-ui",
            fontWeight: 400,
            fontSize: '28px',
            color: '#3F4A1F',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: 0,
            paddingBottom: '16px',
            lineHeight: 1,
          }}
        >
          {title}
        </h3>
      )}
      <div
        style={{
          color: '#3F4A1F',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  )
}
