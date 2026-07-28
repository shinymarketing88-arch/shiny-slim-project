import React from 'react';

interface HeroAvatarSVGProps {
  job: string; // 'warrior' | 'mage' | 'archer' | etc.
  stage: number; // 0: 圓滾滾肉肉態, 1: 輕盈結實態, 2: 爆發筋肉態, 3: 黃金傳奇聖軀
  className?: string;
  size?: number;
}

export const HeroAvatarSVG: React.FC<HeroAvatarSVGProps> = ({ job, stage, className = '', size = 140 }) => {
  // 決定主配色與道具
  const isWarrior = job === 'warrior' || job === '劍士';
  const isMage = job === 'mage' || job === '法師';
  const isArcher = job === 'archer' || job === '弓箭手';

  // 身材參數 (根據 stage 設定體型寬度、肌肉線條、特效)
  // Stage 0: 圓滾滾 (rx/ry 大，腹部圓胖)
  // Stage 1: 輕盈結實 (標準比例)
  // Stage 2: 筋肉暴發 (寬肩倒三角，雙臂肌肉)
  // Stage 3: 黃金聖軀 (金光閃爍，黃金翅膀/背光)

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* 光芒背景特效 */}
      {stage === 3 && (
        <div className="absolute inset-0 rounded-full bg-amber-400/20 blur-xl animate-pulse" />
      )}
      {stage === 2 && (
        <div className="absolute inset-0 rounded-full bg-purple-500/15 blur-lg" />
      )}

      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-md transition-all duration-500"
      >
        <defs>
          {/* 背景漸層 */}
          <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={stage === 3 ? '#ffe066' : stage === 2 ? '#9333ea' : '#312e81'} stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
          </radialGradient>

          {/* 黃金金屬漸層 */}
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff3b0" />
            <stop offset="50%" stopColor="#ffd700" />
            <stop offset="100%" stopColor="#b8860b" />
          </linearGradient>

          {/* 鎧甲/衣服漸層 */}
          <linearGradient id="armorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isWarrior ? '#ef4444' : isMage ? '#8b5cf6' : '#10b981'} />
            <stop offset="100%" stopColor={isWarrior ? '#7f1d1d' : isMage ? '#4c1d95' : '#064e3b'} />
          </linearGradient>

          {/* 膚色漸層 */}
          <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffed2" />
            <stop offset="100%" stopColor="#f3c299" />
          </linearGradient>
        </defs>

        {/* 圓形底座舞台 */}
        <circle cx="100" cy="100" r="92" fill="url(#bgGrad)" stroke={stage === 3 ? '#ffd700' : '#475569'} strokeWidth="4" />
        <ellipse cx="100" cy="170" rx="60" ry="12" fill="#000000" opacity="0.4" />

        {/* --- STAGE 3 專屬背光 / 聖光翅膀 --- */}
        {stage === 3 && (
          <g className="animate-pulse">
            {/* 左翅膀 */}
            <path
              d="M 80 90 Q 20 40 10 90 Q 40 110 80 120 Z"
              fill="url(#goldGrad)"
              opacity="0.9"
            />
            {/* 右翅膀 */}
            <path
              d="M 120 90 Q 180 40 190 90 Q 160 110 120 120 Z"
              fill="url(#goldGrad)"
              opacity="0.9"
            />
            {/* 頭頂天使光環 */}
            <ellipse cx="100" cy="32" rx="28" ry="7" fill="none" stroke="#ffd700" strokeWidth="4" />
          </g>
        )}

        {/* --- 身體 Body (根據階段縮放胖瘦) --- */}
        {/* Stage 0: 圓滾滾大肚子 */}
        {stage === 0 && (
          <g>
            {/* 圓胖軀幹 */}
            <ellipse cx="100" cy="132" rx="42" ry="36" fill="url(#armorGrad)" />
            {/* 肚腩突出的圓弧線 */}
            <path d="M 75 130 Q 100 160 125 130" fill="none" stroke="#fcd34d" strokeWidth="3" opacity="0.8" />
            {/* 胖胖雙腿 */}
            <rect x="76" y="156" width="18" height="20" rx="8" fill="#334155" />
            <rect x="106" y="156" width="18" height="20" rx="8" fill="#334155" />
            {/* 胖胖短臂 */}
            <circle cx="56" cy="130" r="14" fill="url(#skinGrad)" />
            <circle cx="144" cy="130" r="14" fill="url(#skinGrad)" />
          </g>
        )}

        {/* Stage 1: 輕盈結實態 */}
        {stage === 1 && (
          <g>
            {/* 標準比例軀幹 */}
            <path d="M 76 110 L 124 110 L 116 156 L 84 156 Z" fill="url(#armorGrad)" rx="6" />
            {/* 皮帶 */}
            <rect x="80" y="136" width="40" height="6" fill="#78350f" />
            <rect x="95" y="134" width="10" height="10" fill="#ffd700" />
            {/* 雙腿 */}
            <rect x="78" y="154" width="16" height="24" rx="6" fill="#334155" />
            <rect x="106" y="154" width="16" height="24" rx="6" fill="#334155" />
            {/* 結實手臂 */}
            <rect x="58" y="112" width="14" height="28" rx="7" fill="url(#skinGrad)" />
            <rect x="128" y="112" width="14" height="28" rx="7" fill="url(#skinGrad)" />
          </g>
        )}

        {/* Stage 2 & 3: 爆發筋肉態 / 黃金聖軀 (倒三角寬肩、強壯胸肌腹肌) */}
        {(stage === 2 || stage === 3) && (
          <g>
            {/* 寬肩倒三角胸腹 */}
            <path d="M 62 104 L 138 104 L 118 156 L 82 156 Z" fill={stage === 3 ? 'url(#goldGrad)' : 'url(#armorGrad)'} />
            {/* 胸肌腹肌線條 */}
            <path d="M 82 118 C 90 126 100 126 100 126 C 100 126 110 126 118 118" fill="none" stroke="#000000" strokeWidth="2.5" opacity="0.4" />
            {/* 六塊腹肌線條 */}
            <line x1="100" y1="126" x2="100" y2="152" stroke="#000000" strokeWidth="2" opacity="0.3" />
            <line x1="88" y1="135" x2="112" y2="135" stroke="#000000" strokeWidth="2" opacity="0.3" />
            <line x1="90" y1="145" x2="110" y2="145" stroke="#000000" strokeWidth="2" opacity="0.3" />

            {/* 強壯腳肌 */}
            <rect x="76" y="154" width="20" height="26" rx="8" fill="#1e293b" />
            <rect x="104" y="154" width="20" height="26" rx="8" fill="#1e293b" />

            {/* 爆發健美雙臂 (麒麟臂) */}
            <circle cx="52" cy="112" r="16" fill="url(#skinGrad)" />
            <rect x="42" y="118" width="18" height="24" rx="9" fill="url(#skinGrad)" />
            <circle cx="148" cy="112" r="16" fill="url(#skinGrad)" />
            <rect x="140" y="118" width="18" height="24" rx="9" fill="url(#skinGrad)" />
          </g>
        )}

        {/* --- 頭部與臉部表情 Head & Face --- */}
        <g>
          {/* 頭部圓形/雙頰 (Stage 0 雙頰較圓) */}
          <circle cx="100" cy="74" r={stage === 0 ? "28" : "24"} fill="url(#skinGrad)" />

          {/* Stage 0 特有：紅暈與汗珠 */}
          {stage === 0 && (
            <g>
              <circle cx="84" cy="80" r="5" fill="#f43f5e" opacity="0.5" />
              <circle cx="116" cy="80" r="5" fill="#f43f5e" opacity="0.5" />
              {/* 流汗水滴 */}
              <path d="M 126 60 C 126 58 130 54 130 58 C 130 62 126 62 126 60 Z" fill="#38bdf8" />
            </g>
          )}

          {/* 眼睛 Eyes */}
          {stage === 0 ? (
            // 胖胖喘氣表情 (圓圓眼或暈眩眼)
            <g>
              <circle cx="90" cy="72" r="3.5" fill="#1e293b" />
              <circle cx="110" cy="72" r="3.5" fill="#1e293b" />
              {/* 喘氣圓嘴 */}
              <circle cx="100" cy="84" r="4" fill="#991b1b" />
            </g>
          ) : stage === 1 ? (
            // 自信微笑
            <g>
              <ellipse cx="90" cy="72" rx="3" ry="4" fill="#1e293b" />
              <ellipse cx="110" cy="72" rx="3" ry="4" fill="#1e293b" />
              <path d="M 92 82 Q 100 88 108 82" fill="none" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          ) : (
            // 爆發霸氣眼神 (銳利眼神 + 戰意微光)
            <g>
              <path d="M 84 68 L 96 73 L 86 75 Z" fill="#1e293b" />
              <path d="M 116 68 L 104 73 L 114 75 Z" fill="#1e293b" />
              <circle cx="91" cy="72" r="2" fill={stage === 3 ? '#ffd700' : '#ef4444'} />
              <circle cx="109" cy="72" r="2" fill={stage === 3 ? '#ffd700' : '#ef4444'} />
              {/* 堅毅嘴角 */}
              <path d="M 92 84 L 108 84" fill="none" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
            </g>
          )}

          {/* 頭飾 / 髮型 (依職業) */}
          {isWarrior && (
            <path
              d="M 72 66 C 72 40 128 40 128 66 C 128 50 72 50 72 66 Z"
              fill={stage === 3 ? 'url(#goldGrad)' : '#475569'}
            />
          )}
          {isMage && (
            <g>
              {/* 尖尖巫師帽 */}
              <path d="M 68 62 L 100 20 L 132 62 Z" fill={stage === 3 ? '#b45309' : '#4c1d95'} />
              <ellipse cx="100" cy="62" rx="36" ry="8" fill={stage === 3 ? '#ffd700' : '#6d28d9'} />
            </g>
          )}
          {isArcher && (
            <g>
              {/* 綠林風帽 / 獵人羽毛 */}
              <path d="M 70 64 Q 100 42 130 64 L 124 54 Q 100 38 76 54 Z" fill="#047857" />
              <path d="M 120 50 L 136 30 L 126 54 Z" fill="#ef4444" />
            </g>
          )}
        </g>

        {/* --- 職業專屬武器 (Weapon) --- */}
        <g>
          {/* 劍士武器 */}
          {isWarrior && (
            <g>
              {stage === 0 ? (
                // 短小木劍
                <rect x="146" y="110" width="6" height="30" rx="2" fill="#854d0e" transform="rotate(-20 146 110)" />
              ) : stage === 1 ? (
                // 鋼鐵長劍
                <g transform="rotate(-25 150 90)">
                  <rect x="150" y="60" width="8" height="60" rx="2" fill="#cbd5e1" stroke="#475569" />
                  <rect x="142" y="110" width="24" height="6" fill="#fbbf24" />
                </g>
              ) : (
                // 巨型烈焰/黃金聖劍
                <g transform="rotate(-30 155 70)">
                  <path d="M 152 20 L 164 20 L 168 110 L 148 110 Z" fill={stage === 3 ? 'url(#goldGrad)' : '#f97316'} stroke="#f59e0b" strokeWidth="2" />
                  <rect x="140" y="110" width="36" height="10" fill="#b45309" />
                  {/* 劍刃火焰特效 */}
                  <path d="M 148 40 Q 140 30 150 20 Q 160 10 168 30 Z" fill="#ef4444" opacity="0.7" />
                </g>
              )}
            </g>
          )}

          {/* 法師武器 */}
          {isMage && (
            <g>
              {stage === 0 ? (
                // 甜甜圈浮在旁邊 + 小手杖
                <circle cx="50" cy="90" r="10" fill="#f43f5e" stroke="#fde047" strokeWidth="4" />
              ) : (
                // 星光/黃金法杖
                <g>
                  <line x1="152" y1="50" x2="152" y2="150" stroke={stage === 3 ? '#ffd700' : '#8b5cf6'} strokeWidth="6" strokeLinecap="round" />
                  <circle cx="152" cy="45" r="14" fill={stage === 3 ? '#f59e0b' : '#38bdf8'} className="animate-pulse" />
                </g>
              )}
            </g>
          )}

          {/* 弓箭手武器 */}
          {isArcher && (
            <g>
              {stage === 0 ? (
                // 頭頂小蘋果
                <circle cx="100" cy="38" r="8" fill="#ef4444" />
              ) : (
                // 獵弓
                <path
                  d="M 148 50 Q 170 100 148 150"
                  fill="none"
                  stroke={stage === 3 ? '#ffd700' : '#b45309'}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              )}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
};
