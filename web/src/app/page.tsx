"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Compass, Server, ArrowRight } from "lucide-react";

interface HealthResponse {
  status: string;
  backend: string;
  timestamp: string;
  message: string;
}

export default function HomePage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Proves that Next.js rewrites (/api/health -> Express :3001/api/health) function properly
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      })
      .then((data: HealthResponse) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#FAF8F5]">
      <div className="max-w-xl w-full bg-white rounded-2xl shadow-sm border border-[#E5E0D8] p-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#1B4332] flex items-center justify-center text-white shadow-md">
            <Compass className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold text-[#081C15]">Wayfarer</h1>
            <p className="text-xs text-[#52796F] font-medium tracking-wide uppercase">
              Full-Stack Architecture Verification Checkpoint
            </p>
          </div>
        </div>

        <div className="border-t border-[#E5E0D8] pt-6 space-y-4">
          <h2 className="text-sm font-semibold text-[#081C15] flex items-center">
            <Server className="w-4 h-4 mr-2 text-[#1B4332]" />
            Frontend ↔ Express Backend Connectivity
          </h2>

          {loading && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm flex items-center">
              <div className="animate-spin w-4 h-4 border-2 border-[#1B4332] border-t-transparent rounded-full mr-3" />
              <span>Checking Express API connection through Next.js rewrites...</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start">
              <AlertCircle className="w-5 h-5 text-rose-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Connection failed</p>
                <p className="text-xs text-rose-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {health && (
            <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
              <div className="flex items-center text-emerald-800 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mr-2 flex-shrink-0" />
                Connection verified: Next.js reached Express successfully!
              </div>
              <div className="text-xs text-emerald-800 space-y-1 font-mono pt-1">
                <div>• Status: <span className="font-bold">{health.status.toUpperCase()}</span></div>
                <div>• Backend: {health.backend} API</div>
                <div>• Endpoint: /api/health (via Next.js rewrite)</div>
                <div>• Timestamp: {health.timestamp}</div>
              </div>
            </div>
          )}

          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] text-xs text-[#52796F] space-y-1">
            <div className="font-semibold text-[#081C15]">Architecture Arrangement:</div>
            <div>• <code className="bg-white px-1 py-0.5 rounded border border-slate-200">web/</code>: Next.js App Router (port 3000)</div>
            <div>• <code className="bg-white px-1 py-0.5 rounded border border-slate-200">api/</code>: Express API Server (port 3001)</div>
            <div>• Rewrites: <code className="bg-white px-1 py-0.5 rounded border border-slate-200">/api/:path*</code> → <code className="bg-white px-1 py-0.5 rounded border border-slate-200">http://localhost:3001/api/:path*</code></div>
          </div>
        </div>
      </div>
    </main>
  );
}

