import React, { useState } from 'react';
import PlayerView from './components/PlayerView';
import AdminView from './components/AdminView';

export default function App() {
  const [viewMode, setViewMode] = useState<'player' | 'admin'>('player');

  return (
    <div className="min-h-screen bg-slate-900 font-sans">
      {/* 頂部切換 Toggle Bar (輕量浮動) */}
      <div className="fixed top-2 right-2 z-50 flex bg-black/80 backdrop-blur border border-white/20 rounded-full p-1 shadow-2xl text-[11px] font-bold text-white">
        <button
          onClick={() => setViewMode('player')}
          className={`px-3 py-1 rounded-full transition-all ${
            viewMode === 'player' ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
          }`}
        >
          🎮 遊戲前台
        </button>
        <button
          onClick={() => setViewMode('admin')}
          className={`px-3 py-1 rounded-full transition-all ${
            viewMode === 'admin' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
          }`}
        >
          ⚙️ 後台管理
        </button>
      </div>

      {viewMode === 'player' ? (
        <PlayerView onSwitchToAdmin={() => setViewMode('admin')} />
      ) : (
        <AdminView onSwitchToPlayer={() => setViewMode('player')} />
      )}
    </div>
  );
}

