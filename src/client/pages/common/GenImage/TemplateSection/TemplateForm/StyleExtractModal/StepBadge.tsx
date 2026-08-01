export function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-600">
      {n}
    </span>
  )
}
