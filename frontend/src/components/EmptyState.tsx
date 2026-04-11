interface Props {
  icon: string
  title: string
  description: string
}

export default function EmptyState({ icon, title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <h2 className="text-lg font-semibold text-slate-300 mb-2">{title}</h2>
      <p className="text-sm text-slate-500 max-w-md">{description}</p>
    </div>
  )
}
