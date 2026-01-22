import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface HeroPanelProps {
    status: 'active' | 'idle'
}

export function HeroPanel({ status: _status }: HeroPanelProps) {
    return (
        <Card className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-purple-700 p-8 text-white shadow-xl border-0">
            {/* Ambient Glows */}
            <div className="absolute top-0 right-0 h-[300px] w-[300px] translate-x-1/3 -translate-y-1/3 rounded-full bg-purple-400/30 blur-[120px]" />
            <div className="absolute bottom-0 left-0 h-[200px] w-[200px] -translate-x-1/3 translate-y-1/3 rounded-full bg-indigo-400/20 blur-[100px]" />
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.02]" />

            <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="space-y-4 max-w-2xl">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="inline-flex px-3 py-1 rounded-full bg-indigo-500/30 backdrop-blur-sm border border-white/20">
                                <span className="text-xs font-bold uppercase tracking-wider text-white">NEW FEATURE</span>
                            </div>
                        </div>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
                        AI Analytics Ready
                    </h1>

                    <p className="text-indigo-50/80 text-base leading-relaxed max-w-lg">
                        Boost your system performance with our new AI-driven insights engine.
                    </p>

                    <div className="flex items-center gap-3 mt-6">
                        <Button
                            variant="outline"
                            className="h-11 border-white/30 bg-white/10 text-white hover:bg-white/20 px-6 backdrop-blur-sm font-semibold"
                            asChild
                        >
                            <a
                                href={import.meta.env.VITE_OPENSEARCH_DASHBOARDS_URL}
                                target="_blank"
                                rel="noreferrer"
                            >
                                View Full Report
                            </a>
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
}
