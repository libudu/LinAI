import { TaskList } from '../../common/TaskList'
import { TemplateSection } from '../TemplateSection'

export const Home = () => {
  return (
    <>
      <TemplateSection />
      <section className="space-y-4">
        <TaskList />
      </section>
    </>
  )
}
