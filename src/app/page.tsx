import Link from "next/link";
import Reveal from "@/components/Reveal";
import FloatingShapes from "@/components/FloatingShapes";

export default function Home() {
  return (
    <section className="relative overflow-hidden">
      <div className="relative">
        <FloatingShapes />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <Reveal as="div" className="hover-float">
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
                  Turn raw CSVs into stories, insights, and charts.
                </h1>
              </Reveal>
              <Reveal as="div" className="hover-float" delayMs={80}>
                <p className="mt-4 text-base/7 opacity-80">
                  Upload your dataset and get executive summaries, actionable insights, and suggested visualizations powered by AI.
                </p>
              </Reveal>
              <Reveal as="div" className="hover-float" delayMs={160}>
                <div className="mt-8 flex items-center gap-3">
                  <Link href="/dashboard" className="btn-animated px-5 py-2.5 rounded shadow-md hover:scale-[1.02] transition">Get started</Link>
                  <a href="#how-it-works" className="px-5 py-2.5 rounded border border-white/15 hover:bg-white/10 transition">How it works</a>
                </div>
              </Reveal>
            </div>
            <Reveal as="div" className="card p-6 hover-scale" delayMs={120}>
            <div className="rounded-lg overflow-hidden border border-white/10">
              <div className="aspect-[16/10] bg-gradient-to-br from-cyan-500/20 to-indigo-500/20"></div>
            </div>
            <div className="mt-4 text-sm opacity-80">Demo preview – dashboards & charts generated from your data.</div>
            </Reveal>
          </div>
        </div>
      </div>

      <div id="how-it-works" className="max-w-6xl mx-auto px-6 pb-24">
        <Reveal>
          <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
        </Reveal>
        <div className="mt-6 grid sm:grid-cols-3 gap-4">
          <Reveal className="card p-5 hover-tilt">
            <div className="text-sm opacity-70">1</div>
            <div className="mt-1 font-medium">Upload your CSV</div>
            <div className="opacity-80 text-sm mt-2">We parse your data securely in your session.</div>
          </Reveal>
          <Reveal className="card p-5 hover-tilt" delayMs={80}>
            <div className="text-sm opacity-70">2</div>
            <div className="mt-1 font-medium">Generate insights</div>
            <div className="opacity-80 text-sm mt-2">AI surfaces key trends and narratives.</div>
          </Reveal>
          <Reveal className="card p-5 hover-tilt" delayMs={140}>
            <div className="text-sm opacity-70">3</div>
            <div className="mt-1 font-medium">Visualize & share</div>
            <div className="opacity-80 text-sm mt-2">Suggested charts and summaries you can present.</div>
          </Reveal>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 pb-28">
        <Reveal>
          <h2 className="text-xl font-semibold tracking-tight">Why Narrative?</h2>
        </Reveal>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <Reveal className="card p-6 hover-float">
            <div className="font-medium">Fast</div>
            <div className="opacity-80 text-sm mt-1">Upload, analyze, and visualize in seconds.</div>
          </Reveal>
          <Reveal className="card p-6 hover-float" delayMs={80}>
            <div className="font-medium">Private</div>
            <div className="opacity-80 text-sm mt-1">Your data stays in your account; per-user datasets.</div>
          </Reveal>
          <Reveal className="card p-6 hover-float" delayMs={140}>
            <div className="font-medium">Actionable</div>
            <div className="opacity-80 text-sm mt-1">Insights optimized for decisions and presentations.</div>
          </Reveal>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-32">
        <Reveal className="card p-8 md:p-10 hover-scale">
          <div className="md:flex items-center justify-between">
            <div>
              <div className="text-lg font-medium">Ready to turn data into narrative?</div>
              <div className="opacity-80 text-sm mt-2">Start with a simple CSV upload. No setup required.</div>
            </div>
            <div className="mt-4 md:mt-0">
              <Link href="/dashboard" className="btn-primary px-5 py-2.5 rounded shadow-md hover:scale-[1.02] transition">Open Dashboard</Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
