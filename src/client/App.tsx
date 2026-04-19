import { WanSection } from './components/WanSection'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* 快捷入口 */}
        <WanSection />

        {/* 任务编排 */}
        <section className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>📋</span> 任务编排
          </h2>
          <div className="text-gray-400 italic text-sm py-8 text-center border-2 border-dashed border-gray-100 rounded-lg">
            (暂无具体内容)
          </div>
        </section>

      </div>
    </div>
  )
}

export default App
