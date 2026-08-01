import { TaskList } from './TaskList'
import { TemplateSection } from './TemplateSection'

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
