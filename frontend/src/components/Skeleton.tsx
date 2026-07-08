export function SkeletonLine({ width, height = 10 }: { width?: string | number; height?: number }) {
  return <div className="skeleton-line" style={{ width, height }} />;
}

export function SkeletonCircle({ size = 32 }: { size?: number }) {
  return <div className="skeleton-circle" style={{ width: size, height: size }} />;
}

export function SkeletonTable({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <table>
      <thead>
        <tr>{Array.from({ length: columns }).map((_, i) => <th key={i}><SkeletonLine width="60%" /></th>)}</tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c}><SkeletonLine width={c === 0 ? '75%' : '45%'} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SkeletonDetailPage() {
  return (
    <div>
      <div className="card detail-header-card" style={{ marginBottom: 20, display: 'flex', gap: 16 }}>
        <SkeletonCircle size={56} />
        <div style={{ flex: 1 }}>
          <SkeletonLine width="30%" height={20} />
          <div style={{ marginTop: 10 }}><SkeletonLine width="50%" /></div>
        </div>
      </div>
      <div className="detail-page-layout">
        <div className="detail-sidebar">
          <div className="card">
            <SkeletonLine width="40%" height={14} />
            <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonLine key={i} width={`${70 - i * 8}%`} />)}
            </div>
          </div>
        </div>
        <div className="detail-main">
          <div className="card">
            <SkeletonLine width="25%" height={14} />
            <div style={{ marginTop: 16 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton-row">
                  <SkeletonCircle />
                  <div className="skeleton-lines">
                    <SkeletonLine />
                    <SkeletonLine width="40%" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonKanban({ columns = 4, cardsPerColumn = 3 }: { columns?: number; cardsPerColumn?: number }) {
  return (
    <div className="kanban">
      {Array.from({ length: columns }).map((_, c) => (
        <div key={c} className="kanban-col" style={{ maxHeight: 'none' }}>
          <div className="kanban-col-fixed"><SkeletonLine width="50%" height={13} /></div>
          <div className="kanban-col-cards">
            {Array.from({ length: cardsPerColumn }).map((_, i) => (
              <div key={i} className="kanban-card" style={{ cursor: 'default' }}>
                <SkeletonLine width="70%" />
                <div style={{ marginTop: 8 }}><SkeletonLine width="40%" /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, height = 260 }: { count?: number; height?: number }) {
  return (
    <div className="dashboard-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card">
          <SkeletonLine width="35%" height={14} />
          <div style={{ marginTop: 16, height, borderRadius: 8 }} className="skeleton-line" />
        </div>
      ))}
    </div>
  );
}
