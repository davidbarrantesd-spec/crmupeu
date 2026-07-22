import { cn } from '@/lib/utils'

/** Muestra JSON formateado con colores por tipo. */
export function JsonViewer({ data, className }: { data: unknown; className?: string }) {
  if (data === null || data === undefined) {
    return <p className="text-sm text-muted-foreground">Sin datos</p>
  }
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed text-foreground',
        className,
      )}
    >
      {renderValue(data, 0)}
    </pre>
  )
}

function renderValue(value: unknown, depth: number): React.ReactNode {
  const indent = '  '.repeat(depth)
  const childIndent = '  '.repeat(depth + 1)
  if (value === null) return <span className="text-muted-foreground">null</span>
  if (typeof value === 'boolean') return <span className="text-violet-600 dark:text-violet-400">{String(value)}</span>
  if (typeof value === 'number') return <span className="text-blue-600 dark:text-blue-400">{value}</span>
  if (typeof value === 'string') return <span className="text-emerald-700 dark:text-emerald-400">"{value}"</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>
    return (
      <>
        {'[\n'}
        {value.map((v, i) => (
          <span key={i}>
            {childIndent}
            {renderValue(v, depth + 1)}
            {i < value.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {indent}]
      </>
    )
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return <span>{'{}'}</span>
    return (
      <>
        {'{\n'}
        {entries.map(([k, v], i) => (
          <span key={k}>
            {childIndent}
            <span className="text-amber-700 dark:text-amber-400">"{k}"</span>
            {': '}
            {renderValue(v, depth + 1)}
            {i < entries.length - 1 ? ',' : ''}
            {'\n'}
          </span>
        ))}
        {indent}
        {'}'}
      </>
    )
  }
  return <span>{String(value)}</span>
}
