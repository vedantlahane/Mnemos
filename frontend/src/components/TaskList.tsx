interface Props {
  tasks: string[]
}

export default function TaskList({ tasks }: Props) {
  if (tasks.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-400 mb-2">Tasks</h3>
      <ul className="space-y-1.5">
        {tasks.map((task, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-sm text-slate-300"
          >
            <span className="text-amber-400 mt-0.5">☐</span>
            <span>{task}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
