import { useEffect, useState } from "react";

export function WanSection() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/wan/status");
      const data = await res.json();
      setIsLoggedIn(data.isLoggedIn);
      setAutoSubmit(data.autoSubmit);
      setErrorMsg(data.errorMsg);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await fetch("/api/wan/login", { method: "POST" });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleAutoSubmit = async () => {
    const nextState = !autoSubmit;
    setAutoSubmit(nextState);
    try {
      await fetch("/api/wan/auto-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: nextState }),
      });
      await fetchStatus();
    } catch (e) {
      console.error(e);
      setAutoSubmit(!nextState);
    }
  };

  if (loading && !isLoggedIn) {
    return <div className="p-4">加载中...</div>;
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span>🚀</span> 快捷入口 - Wan 视频下载
      </h2>

      <div className="space-y-4">
        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
            <span className="font-semibold">错误信息：</span> {errorMsg}
          </div>
        )}

        {!isLoggedIn ? (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <span className="text-gray-600">
              您尚未登录，请先登录以继续操作。
            </span>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex flex-col">
              <span className="font-medium text-gray-900">自动提交任务</span>
              <span className="text-sm text-gray-500">
                开启后将自动轮询并提交新的下载任务
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoSubmit}
                onChange={toggleAutoSubmit}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
