import { TaskList } from './tasks'
import { TemplateSection } from './templates'

export const GenImage = () => {
  return (
    <>
      <TemplateSection />
      <section className="space-y-4">
        <TaskList />
      </section>
    </>
  )
}
