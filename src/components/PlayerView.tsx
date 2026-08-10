import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Employee, Checkin, Team } from '../types';
import { calculateEmployeeStats, SPORT_PTS_MAP, TARGET_WORD, attachCalculatedPointsToCheckins, CalculatedCheckin } from '../lib/calcEngine';
import { HeroAvatarSVG } from './HeroAvatarSVG';

const CHARS = {
  fat: [
    { id: 'assassin', name: '刺客', emoji: '🗡️', slogan: '燃燒每一卡，消滅每一克' },
    { id: 'hunter', name: '獵人', emoji: '🏹', slogan: '鎖定脂肪，追蹤到底' },
    { id: 'ninja', name: '忍者', emoji: '🌀', slogan: '悄悄瘦下去，驚豔所有人' },
  ],
  muscle: [
    { id: 'knight', name: '騎士', emoji: '🛡️', slogan: '每一下都是鎧甲，鍛鍊出鋼鐵之軀' },
    { id: 'warrior', name: '戰士', emoji: '⚔️', slogan: '汗水澆灌肌肉，痛苦雕刻線條' },
    { id: 'hero', name: '勇者', emoji: '✨', slogan: '從平凡到傳說，一塊肌肉一個故事' },
  ],
};

const LEVELS = [
  { min: 0, title: '體態實習生', next: 30 },
  { min: 30, title: '熱血冒險者 🔥', next: 60 },
  { min: 60, title: '全能達人 🏆', next: 100 },
  { min: 100, title: '體態傳奇聖王 👑', next: 999 },
];

const TASK_INSTRUCTIONS: Record<string, string> = {
  '飲食打卡': `<b>📋 操作步驟：</b><br>
1. 上傳食物照片至 WonderFood-AI，AI 自動分析營養成分<br>
2. 點「日統計」，截圖當天熱量與營養成分頁面<br>
3. 上傳截圖至此，審核通過得 1 分<br>
<br>
⚠️ 一天限上傳 1 次，不得補打卡`,

  '健康飲食': `<b>📋 規則說明：</b><br>
碳水化合物、蛋白質、脂肪<b>三項皆需達 80-110%</b> 才算達標，缺一不可<br>
<br>
<b>積分計算：</b><br>
• 1-3 次：0 分（未達門檻）<br>
• 第 4 次：一次獲得 4 分<br>
• 第 5-7 次：每次各 +2 分（最高 10 分）<br>
<br>
⚠️ 一天限上傳 1 次，不得補打卡`,

  '運動打卡': `<b>📋 符合規定的運動證明（擇一上傳）：</b><br>
1. 公司運動課程簽到表<br>
2. 運動 APP 或智慧手錶記錄（時間需至少 30 分鐘）<br>
3. 走路步數達 10,000 步以上 / 爬梯達 50 層以上<br>
4. 重訓照片、各種球類活動照片等<br>
<br>
<b>積分計算（每週）：</b><br>
第1次+1、第2次+1、第3次+3、第4次+1、第5次+1、第6次+3、第7次+0<br>
<br>
⚠️ 一天限上傳 1 次，不得補打卡`,

  '照片心得': `<b>📋 上傳內容：</b><br>
• 活動前後對比照片（至少 3 張）<br>
• 心得文字（100 字以上）<br>
<br>
⚠️ 整個活動僅能上傳 1 次，送出後鎖定<br>
<br>
✨ 上傳後解鎖【進階挑戰】：在 Threads 發文，瀏覽超過 5,000 次可獲得額外 $1,000！`
};

export default function PlayerView({ onSwitchToAdmin }: { onSwitchToAdmin: () => void }) {
  const [empIdInput, setEmpIdInput] = useState('');
  const [empData, setEmpData] = useState<Employee | null>(null);
  const [loginErr, setLoginErr] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'rank' | 'me'>('map');

  // Setup Wizard State
  const [setupStep, setSetupStep] = useState<number>(1);
  const [selectedGroup, setSelectedGroup] = useState<'fat' | 'muscle'>('fat');
  const [selectedChar, setSelectedChar] = useState<string>('assassin');
  const [nicknameInput, setNicknameInput] = useState('');
  const [targetValInput, setTargetValInput] = useState('');
  const [gapInput, setGapInput] = useState('');

  // Checkins & Realtime State
  const [myCheckins, setMyCheckins] = useState<Checkin[]>([]);
  const [rankingList, setRankingList] = useState<any[]>([]);
  const [rankFilter, setRankFilter] = useState<'all' | 'fat' | 'muscle' | 'team'>('all');
  const [sysSettings, setSysSettings] = useState<any>(null);
  const [previewStage, setPreviewStage] = useState<number | null>(null);

  // Modals
  const [uploadTask, setUploadTask] = useState<{ task: string; pts: number } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [showScoreDetail, setShowScoreDetail] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showSpellModal, setShowSpellModal] = useState(false);
  const [completionChoice, setCompletionChoice] = useState('');
  const [spellChoice, setSpellChoice] = useState('');

  // Team
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [teamCodeInput, setTeamCodeInput] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // 1. 登入邏輯
  const handleLogin = async () => {
    const id = empIdInput.trim().toUpperCase();
    if (!id) {
      setLoginErr('請輸入員工編號');
      return;
    }
    setIsLoggingIn(true);
    setLoginErr('');
    try {
      const snap = await getDoc(doc(db, 'summer2026_employees', id));
      if (!snap.exists()) {
        setLoginErr('找不到此員工編號，請確認後重試');
        setIsLoggingIn(false);
        return;
      }
      const data = { empId: id, ...snap.data() } as Employee;
      setEmpData(data);

      if (data.group && data.charId && data.nickname) {
        // 已完成初始設定
        setSetupStep(0);
      } else {
        // 尚未設定，進行引導
        setSelectedGroup(data.group || 'fat');
        setSelectedChar(data.charId || (data.group === 'muscle' ? 'knight' : 'assassin'));
        setNicknameInput(data.nickname || '');
        setSetupStep(1);
      }
    } catch (err: any) {
      setLoginErr('連線失敗：' + (err.message || '請稍後再試'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 2. 即時連動：當登入完成後，監聽個人 Employee 文件 & 個人 Checkin 集合
  useEffect(() => {
    if (!empData?.empId || setupStep !== 0) return;

    // A. 即時監聽個人文件
    const unsubEmp = onSnapshot(doc(db, 'summer2026_employees', empData.empId), (snap) => {
      if (snap.exists()) {
        setEmpData((prev) => (prev ? { ...prev, ...snap.data() } : null));
      }
    });

    // B. 即時監聽個人的所有打卡紀錄
    const qCheck = query(collection(db, 'summer2026_checkins'), where('empId', '==', empData.empId));
    const unsubCheck = onSnapshot(qCheck, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Checkin[];
      setMyCheckins(list);
    });

    return () => {
      unsubEmp();
      unsubCheck();
    };
  }, [empData?.empId, setupStep]);

  // 載入團隊資料
  useEffect(() => {
    if (!empData?.empId || setupStep !== 0) return;
    const fetchTeam = async () => {
      const q = query(collection(db, 'summer2026_teams'), where('members', 'array-contains', empData.empId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const teamDoc = snap.docs[0];
        setMyTeam({ id: teamDoc.id, ...teamDoc.data() } as Team);
      } else {
        setMyTeam(null);
      }
    };
    fetchTeam();
  }, [empData?.empId, setupStep]);

  // 載入排行榜 (包含全體即時精確動態計算)
  const loadRankings = async () => {
    try {
      const snap = await getDocs(collection(db, 'summer2026_employees'));
      const cSnap = await getDocs(collection(db, 'summer2026_checkins'));
      const allCheckins = cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Checkin));

      let list = snap.docs.map((d) => {
        const emp = { empId: d.id, ...d.data() } as Employee;
        const myApproved = allCheckins.filter(
          (c) => c.empId === emp.empId && (c.status === '通過' || c.status === '補登通過')
        );
        const calc = calculateEmployeeStats(emp, myApproved, startDateStr);
        return {
          ...emp,
          taskPts: calc.taskPts,
          totalPts: calc.totalPts,
          weeklyDiet: calc.weeklyDiet,
          weeklySport: calc.weeklySport,
          weeklyHealth: calc.weeklyHealth,
        };
      }).filter((e) => e.group && e.nickname);

      if (rankFilter === 'fat' || rankFilter === 'muscle') {
        list = list.filter((e) => e.group === rankFilter);
      } else if (rankFilter === 'team' && myTeam) {
        list = list.filter((e) => myTeam.members.includes(e.empId));
      }
      list.sort((a, b) => (b.totalPts || 0) - (a.totalPts || 0));
      setRankingList(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (setupStep === 0) {
      loadRankings();
    }
  }, [rankFilter, setupStep]);

  // 設定引導完成儲存
  const handleSaveSetup = async () => {
    if (!empData) return;
    const tVal = parseFloat(targetValInput) || 0;
    const gVal = parseFloat(gapInput) || 0;
    const targetStr = selectedGroup === 'fat' ? `減脂 ${tVal}%` : `增肌 ${tVal}kg`;

    const updates = {
      group: selectedGroup,
      charId: selectedChar,
      nickname: nicknameInput.trim() || empData.name,
      targetVal: tVal,
      currentGap: gVal,
      target: targetStr,
      registeredAt: empData.registeredAt || new Date(),
    };

    try {
      await updateDoc(doc(db, 'summer2026_employees', empData.empId), updates);
      setEmpData({ ...empData, ...updates });
      setSetupStep(0);
      showToast('🎉 設定完成！展開體態進化旅程！');
    } catch (e: any) {
      showToast('儲存失敗：' + e.message);
    }
  };

  // 打卡上傳處理
  const handleUploadSubmit = async () => {
    if (!selectedFile || !uploadTask || !empData) {
      showToast('請先選擇截圖');
      return;
    }
    setIsUploading(true);
    try {
      const ext = selectedFile.name.split('.').pop();
      const path = `checkins/${empData.empId}/${uploadTask.task}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, selectedFile);
      const url = await getDownloadURL(storageRef);

      await addDoc(collection(db, 'summer2026_checkins'), {
        empId: empData.empId,
        empName: empData.name,
        taskType: uploadTask.task,
        pts: uploadTask.pts,
        fileUrl: url,
        status: '待審核',
        createdAt: new Date(),
      });

      setUploadTask(null);
      setSelectedFile(null);
      setPreviewUrl('');
      showToast('✅ 打卡成功！等待審核後自動加分與更新狀態');
    } catch (e: any) {
      showToast('上傳失敗：' + e.message);
    } finally {
      setIsUploading(false);
    }
  };

  // 完賽禮選擇提交
  const handleCompletionSubmit = async () => {
    if (!completionChoice || !empData) return;
    try {
      await updateDoc(doc(db, 'summer2026_employees', empData.empId), {
        completionReward: completionChoice,
        completionRewardAt: new Date(),
      });
      setShowCompletionModal(false);
      showToast('🎁 完賽禮已選定！等待主辦人確認發放');
    } catch (e: any) {
      showToast('儲存失敗');
    }
  };

  // 拼字選擇提交
  const handleSpellSubmit = async () => {
    if (!spellChoice || !empData) return;
    try {
      await updateDoc(doc(db, 'summer2026_employees', empData.empId), {
        spellReward: spellChoice,
        spellRewardAt: new Date(),
      });
      setShowSpellModal(false);
      showToast('🎉 Bonus 獎勵已選定！等待主辦人確認發放');
    } catch (e: any) {
      showToast('儲存失敗');
    }
  };

  // 載入系統設定
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'summer2026_settings', 'main'));
        if (snap.exists()) {
          setSysSettings(snap.data());
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchSettings();
  }, []);

  // 活動天數動態計算 (45-Day Quest)
  const startDateStr = sysSettings?.startDate || '2026-07-13';
  const totalDays = 45;
  const questStartDate = new Date(startDateStr);
  const todayNow = new Date();
  const rawDiffDays = Math.floor((todayNow.getTime() - questStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const currentDay = Math.min(totalDays, Math.max(1, rawDiffDays));
  const dayProgressPct = Math.min(100, Math.max(0, Math.round((currentDay / totalDays) * 100)));

  // 動態即時精確計算分數 (確保打卡與每週規則 100% 精確連動)
  const approvedCheckins = useMemo(() => {
    return myCheckins.filter((c) => c.status === '通過' || c.status === '補登通過');
  }, [myCheckins]);

  const computedStats = useMemo(() => {
    return calculateEmployeeStats(empData || {}, approvedCheckins, startDateStr);
  }, [empData, approvedCheckins, startDateStr]);

  const totalPts = computedStats.totalPts;

  // 自動連動修復數據庫 (若 Firestore 文件內儲存的總分與即時動態精算不符，自動同步連動)
  useEffect(() => {
    if (
      empData?.empId &&
      setupStep === 0 &&
      computedStats.totalPts !== undefined &&
      (computedStats.totalPts !== empData.totalPts || computedStats.taskPts !== empData.taskPts)
    ) {
      updateDoc(doc(db, 'summer2026_employees', empData.empId), {
        taskPts: computedStats.taskPts,
        totalPts: computedStats.totalPts,
        weeklyDiet: computedStats.weeklyDiet,
        weeklySport: computedStats.weeklySport,
        weeklyHealth: computedStats.weeklyHealth,
        consecutiveDays: computedStats.consecutiveDays,
        lastDietDate: computedStats.lastDietDate,
        jellyCount: computedStats.jellyCount,
        lastWeek: computedStats.lastWeek,
        letters: computedStats.letters,
      }).catch((err) => console.error('Auto sync score err:', err));
    }
  }, [
    empData?.empId,
    setupStep,
    empData?.totalPts,
    empData?.taskPts,
    computedStats,
  ]);

  const getPhysiqueStage = (pts: number) => {
    if (pts >= 100) {
      return {
        stageIdx: 3,
        stageName: '黃金傳奇聖軀',
        badge: '👑✨',
        statusText: '人神合一！全身散發耀眼黃金聖光，成為夏日巔峰霸主！',
        prevPts: 100,
        nextPts: 100,
        pct: 100,
      };
    } else if (pts >= 60) {
      return {
        stageIdx: 2,
        stageName: '爆發筋肉形態',
        badge: '💪🔥',
        statusText: '肌肉線條深邃刻劃！充滿剛猛爆發力，體脂蕩然無存！',
        prevPts: 60,
        nextPts: 100,
        pct: Math.min(100, Math.round(((pts - 60) / 40) * 100)),
      };
    } else if (pts >= 30) {
      return {
        stageIdx: 1,
        stageName: '熱血輕盈結實態',
        badge: '⚡🏃',
        statusText: '體脂顯著下降！體態輕盈俐落，腹肌線條露出端倪！',
        prevPts: 30,
        nextPts: 60,
        pct: Math.min(100, Math.round(((pts - 30) / 30) * 100)),
      };
    } else {
      return {
        stageIdx: 0,
        stageName: '圓滾滾肉肉態',
        badge: '🐷🐽',
        statusText: '圓滾滾蓄積卡路里！每日打卡揮灑汗水，準備爆發蛻變！',
        prevPts: 0,
        nextPts: 30,
        pct: Math.min(100, Math.round((pts / 30) * 100)),
      };
    }
  };

  const physiqueStage = getPhysiqueStage(totalPts);

  // InBody 成效目標進度條計算 (%)
  const inbodyTargetVal = empData?.targetVal || 0;
  const inbodyCurrentGap = empData?.currentGap || 0;
  const goalCompletionPct = inbodyTargetVal > 0
    ? Math.min(100, Math.max(0, Math.round(((inbodyTargetVal - inbodyCurrentGap) / inbodyTargetVal) * 100)))
    : 0;

  // 計算精確個人統計資料（包含連續飲食打卡天數與馬甲果凍數）
  const userStats = computedStats;

  // 檢查完賽資格（總積分 ≥ 45 分 且 照片心得 / 變身日記 已審核通過）
  const photoApproved = myCheckins.some(
    (c) => c.taskType === '照片心得' && (c.status === '通過' || c.status === '補登通過')
  );
  const isCompletionEligible = totalPts >= 45 && photoApproved;

  // 計算今日任務狀態
  const todayStr = new Date().toDateString();
  const getTaskStatus = (taskName: string) => {
    const list = myCheckins.filter(
      (c) => c.taskType === taskName && new Date(c.createdAt?.seconds ? c.createdAt.seconds * 1000 : c.createdAt || 0).toDateString() === todayStr
    );
    if (list.some((c) => c.status === '通過' || c.status === '補登通過')) return 'done';
    if (list.some((c) => c.status === '待審核')) return 'pending';
    return 'todo';
  };

  const photoStatus = (() => {
    const list = myCheckins.filter((c) => c.taskType === '照片心得');
    if (list.some((c) => c.status === '通過' || c.status === '補登通過')) return 'done';
    if (list.some((c) => c.status === '待審核')) return 'pending';
    return 'todo';
  })();

  const currentLevel = LEVELS.find((l) => totalPts >= l.min) || LEVELS[0];
  const charInfo = [...CHARS.fat, ...CHARS.muscle].find((c) => c.id === empData?.charId) || CHARS.fat[0];

  // 如果未登入
  if (!empData) {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden border border-purple-100">
          <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-8 text-center text-white">
            <div className="font-pixel text-xl tracking-wider mb-1">SHAPE SHIFTER</div>
            <div className="font-pixel text-[10px] text-purple-200 mb-4">LEVEL UP YOUR BODY</div>
            <div className="text-xs text-purple-100 leading-relaxed mb-4">
              2026 夏季體態進化挑戰<br />7/13 – 8/26 共 45 天
            </div>
            <div className="text-6xl">🧙</div>
          </div>
          <div className="p-6">
            <label className="block text-xs font-bold text-purple-950 mb-2">請輸入員工編號</label>
            <input
              type="text"
              value={empIdInput}
              onChange={(e) => setEmpIdInput(e.target.value.toUpperCase())}
              placeholder="例如 SM0001 或 VE0001"
              className="w-full bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-600 mb-2 uppercase"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            {loginErr && <div className="text-xs text-red-500 mb-3">{loginErr}</div>}
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold rounded-xl text-sm transition-all shadow-md"
            >
              {isLoggingIn ? '驗證中...' : '▶ START GAME'}
            </button>
            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <button onClick={onSwitchToAdmin} className="text-xs text-purple-600 hover:underline font-bold">
                ⚙️ 切換至主辦人後台
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 初始設定精靈 Setup Steps
  if (setupStep > 0) {
    return (
      <div className="min-h-screen bg-[#f8f7ff] max-w-md mx-auto flex flex-col justify-between p-4">
        <div>
          <div className="flex items-center justify-between mb-6 bg-white p-3 rounded-2xl shadow-sm border border-purple-100">
            <span className="text-xs font-bold text-purple-900">冒險者角色設定 ({setupStep}/3)</span>
            <span className="text-xs text-purple-500 font-mono">ID: {empData.empId}</span>
          </div>

          {setupStep === 1 && (
            <div>
              <h2 className="text-lg font-bold text-purple-950 mb-1">選擇組別與角色</h2>
              <p className="text-xs text-purple-600 mb-4">組別選定後不能更換，角色之後可隨時更換</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => {
                    setSelectedGroup('fat');
                    setSelectedChar('assassin');
                  }}
                  className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${
                    selectedGroup === 'fat'
                      ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  ⚡ 減脂組
                </button>
                <button
                  onClick={() => {
                    setSelectedGroup('muscle');
                    setSelectedChar('knight');
                  }}
                  className={`py-3 px-4 rounded-xl border-2 font-bold text-xs transition-all ${
                    selectedGroup === 'muscle'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  💪 增肌組
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {CHARS[selectedGroup].map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedChar(c.id)}
                    className={`p-3 bg-white border-2 rounded-2xl text-center cursor-pointer transition-all ${
                      selectedChar === c.id ? 'border-purple-600 bg-purple-50 shadow-md scale-105' : 'border-purple-100'
                    }`}
                  >
                    <div className="text-3xl mb-1">{c.emoji}</div>
                    <div className="text-xs font-bold text-purple-950">{c.name}</div>
                    <div className="text-[9px] text-purple-500 mt-1 leading-tight">{c.slogan}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {setupStep === 2 && (
            <div>
              <h2 className="text-lg font-bold text-purple-950 mb-1">設定冒險者暱稱</h2>
              <p className="text-xs text-purple-600 mb-4">排行榜上顯示的名稱，之後隨時可改</p>
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="輸入暱稱（最多 8 字）"
                maxLength={8}
                className="w-full bg-white border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-600"
              />
            </div>
          )}

          {setupStep === 3 && (
            <div>
              <h2 className="text-lg font-bold text-purple-950 mb-1">設定體態目標</h2>
              <p className="text-xs text-purple-600 mb-4">根據 InBody 前測數據填寫差距即可，不需填真實數值保護隱私。</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-purple-950 mb-1">
                    我的目標 ({selectedGroup === 'fat' ? '減脂 %' : '增肌 kg'})
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={targetValInput}
                    onChange={(e) => setTargetValInput(e.target.value)}
                    placeholder={selectedGroup === 'fat' ? '例如：3' : '例如：0.8'}
                    className="w-full bg-white border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-purple-950 mb-1">目前距離目標還差</label>
                  <input
                    type="number"
                    step="0.1"
                    value={gapInput}
                    onChange={(e) => setGapInput(e.target.value)}
                    placeholder={selectedGroup === 'fat' ? '例如：3' : '例如：0.8'}
                    className="w-full bg-white border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-8">
          {setupStep > 1 && (
            <button
              onClick={() => setSetupStep((prev) => prev - 1)}
              className="px-5 py-3 border border-purple-200 bg-white text-purple-600 font-bold rounded-xl text-xs"
            >
              ← 上一步
            </button>
          )}
          {setupStep < 3 ? (
            <button
              onClick={() => setSetupStep((prev) => prev + 1)}
              className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl text-xs shadow-md"
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={handleSaveSetup}
              className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl text-xs shadow-md"
            >
              ✅ 完成並進入遊戲
            </button>
          )}
        </div>
      </div>
    );
  }

  // 主遊戲界面
  return (
    <div className="min-h-screen bg-[#f8f7ff] max-w-md mx-auto pb-24 relative">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-950 text-white text-xs px-4 py-2.5 rounded-xl font-bold shadow-2xl z-50 animate-bounce">
          {toastMsg}
        </div>
      )}

      {/* 頂部 Header & HUD */}
      <div className="bg-gradient-to-r from-purple-700 to-indigo-600 p-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white/20 border-2 border-white/50 rounded-full flex items-center justify-center text-2xl flex-shrink-0">
            {charInfo.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm truncate">{empData.nickname || empData.name}</div>
              <button
                onClick={onSwitchToAdmin}
                className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded border border-white/40 text-white"
              >
                ⚙️ 後台
              </button>
            </div>
            <div className="text-[11px] text-purple-200 mt-0.5">{currentLevel.title}</div>
            <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-amber-300 h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(
                    100,
                    ((totalPts - currentLevel.min) / ((currentLevel.next === 999 ? 100 : currentLevel.next) - currentLevel.min)) * 100
                  )}%`,
                }}
              ></div>
            </div>
          </div>
          <div className="text-right flex-shrink-0 pl-2">
            <div className="text-2xl font-extrabold text-amber-300 leading-none">{totalPts}</div>
            <div className="text-[10px] text-purple-200 mt-1">總積分</div>
            <button
              onClick={() => setShowScoreDetail(true)}
              className="text-[9px] bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded text-purple-100 border border-white/20 mt-1"
            >
              📊 明細
            </button>
          </div>
        </div>
      </div>

      {/* 主要內容區分頁 */}
      {activeTab === 'map' && (
        <div className="p-3 space-y-4">
          {/* 1. 45-DAY QUEST 動態天數進度條 */}
          <div className="bg-[#13103a] p-4 rounded-2xl border border-purple-800 text-white shadow-lg space-y-2">
            <div className="flex justify-between items-center">
              <div className="font-pixel text-[10px] text-purple-300 tracking-wider">
                ⚔️ 45-DAY QUEST · DAY {currentDay} / {totalDays}
              </div>
              <div className="text-[11px] font-bold text-amber-400 bg-purple-950/80 px-2.5 py-0.5 rounded-full border border-purple-700">
                {dayProgressPct}% 達成
              </div>
            </div>
            {/* 動態天數進度條 */}
            <div className="w-full bg-purple-950 h-3 rounded-full overflow-hidden border border-purple-800 p-0.5">
              <div
                className="bg-gradient-to-r from-purple-500 via-pink-500 to-amber-400 h-full rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${dayProgressPct}%` }}
              ></div>
            </div>
            <div className="flex justify-between items-center text-[10px] text-purple-300/80 pt-0.5">
              <span>起跑日：{startDateStr}</span>
              <span>剩餘 {Math.max(0, totalDays - currentDay)} 天</span>
            </div>
          </div>

          {/* 2. 英雄角色趣味體態演化卡 (SVG 視覺繪製) */}
          {(() => {
            const activeStageIdx = previewStage !== null ? previewStage : physiqueStage.stageIdx;
            const stageConfigMap = [
              { stageName: '圓滾滾肉肉態', badge: '🐷🐽', statusText: '蓄積大量卡路里！持續打卡揮灑汗水，準備突破蛻變！' },
              { stageName: '熱血輕盈態', badge: '⚡🏃', statusText: '體脂顯著下降！體態輕盈俐落，動作迅速靈敏！' },
              { stageName: '爆發筋肉態', badge: '💪🔥', statusText: '倒三角腹肌深邃刻劃！充滿剛猛爆發力與強悍線條！' },
              { stageName: '黃金傳奇聖軀', badge: '👑✨', statusText: '人神合一！一身黃金聖甲與光輝翅膀，霸氣登頂！' },
            ];
            const activeStageInfo = stageConfigMap[activeStageIdx];

            return (
              <div className="bg-gradient-to-br from-purple-950 via-[#181242] to-slate-900 p-4 rounded-2xl border border-purple-700/80 text-white shadow-md space-y-3 relative overflow-hidden">
                {previewStage !== null && (
                  <div className="absolute top-2 right-2 bg-amber-500 text-slate-950 text-[9px] font-bold px-2 py-0.5 rounded-full shadow animate-pulse flex items-center gap-1">
                    <span>👁️ 試穿預覽中</span>
                    <button
                      onClick={() => setPreviewStage(null)}
                      className="underline ml-1 hover:text-white"
                    >
                      (重置)
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* SVG 動態角色畫布 */}
                  <div className="flex-shrink-0 bg-purple-950/60 p-2 rounded-2xl border border-purple-700/60 shadow-inner flex flex-col items-center">
                    <HeroAvatarSVG
                      job={empData?.charId || 'warrior'}
                      stage={activeStageIdx}
                      size={130}
                    />
                    <span className="text-[10px] text-amber-300 font-bold mt-1 bg-purple-900/80 px-2 py-0.5 rounded-full border border-purple-600">
                      {charInfo.name || '英雄'}
                    </span>
                  </div>

                  {/* 角色當前階段說明 */}
                  <div className="flex-1 space-y-1.5 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <span className="text-base font-extrabold text-amber-300">{activeStageInfo.stageName}</span>
                      <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/40">
                        {activeStageInfo.badge}
                      </span>
                    </div>
                    <p className="text-xs text-purple-200 leading-relaxed">
                      {activeStageInfo.statusText}
                    </p>
                    <div className="text-[10px] text-purple-400 pt-1">
                      {physiqueStage.stageIdx < 3
                        ? `💡 努力累積任務積分，達到 ${physiqueStage.nextPts} 分解鎖下階段形態！`
                        : '🎉 恭喜已成就最高階【黃金傳奇聖軀】！'}
                    </div>
                  </div>
                </div>

                {/* 四階段體態進程 Stepper & 鎖定機制 */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {[
                    { name: '肉肉態', icon: '🐷', limit: '0-29分' },
                    { name: '輕盈態', icon: '⚡', limit: '30-59分' },
                    { name: '筋肉態', icon: '💪', limit: '60-99分' },
                    { name: '黃金聖軀', icon: '👑', limit: '100分+' },
                  ].map((st, idx) => {
                    const isActualCurrent = physiqueStage.stageIdx === idx;
                    const isUnlocked = idx <= physiqueStage.stageIdx;
                    const isSelected = activeStageIdx === idx;

                    return (
                      <button
                        key={idx}
                        disabled={!isUnlocked}
                        onClick={() => {
                          if (isUnlocked) {
                            setPreviewStage(idx === previewStage ? null : idx);
                          }
                        }}
                        className={`p-2 rounded-xl text-center border transition-all duration-200 ${
                          !isUnlocked
                            ? 'bg-purple-950/20 border-purple-900/40 text-purple-600 opacity-60 cursor-not-allowed'
                            : isSelected
                            ? 'bg-amber-500/30 border-amber-400 text-amber-200 font-bold scale-105 shadow-md ring-2 ring-amber-400/50 cursor-pointer'
                            : isActualCurrent
                            ? 'bg-purple-800/50 border-purple-500 text-purple-200 font-bold cursor-pointer'
                            : 'bg-purple-950/40 border-purple-900/60 text-purple-300 hover:bg-purple-900/40 cursor-pointer'
                        }`}
                      >
                        <div className="text-base">{isUnlocked ? st.icon : '🔒'}</div>
                        <div className="text-[10px] mt-0.5 leading-none font-medium">
                          {isUnlocked ? st.name : '待解鎖'}
                        </div>
                        <div className="text-[8px] opacity-70 mt-0.5">{st.limit}</div>
                        {isActualCurrent && (
                          <div className="text-[7px] bg-amber-500 text-slate-950 font-bold rounded mt-1 py-0.2">
                            當前狀態
                          </div>
                        )}
                        {!isUnlocked && (
                          <div className="text-[7px] bg-purple-900/80 text-purple-400 rounded mt-1 py-0.2">
                            需達標
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* 下一階演化進度條 */}
                {physiqueStage.stageIdx < 3 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center text-[10px] text-purple-300">
                      <span>距下一階段真實進化 ({physiqueStage.nextPts}分)</span>
                      <span className="font-bold text-amber-400">{totalPts} / {physiqueStage.nextPts} 分 ({physiqueStage.pct}%)</span>
                    </div>
                    <div className="w-full bg-purple-950 h-2 rounded-full overflow-hidden border border-purple-800">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-yellow-300 h-full rounded-full transition-all duration-500"
                        style={{ width: `${physiqueStage.pct}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 3. InBody 數據動態成效進度條 */}
          {empData?.group && (
            <div className="bg-white p-3.5 rounded-2xl border border-purple-100 shadow-sm space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-xs font-bold text-purple-950">
                  <span>📐</span>
                  <span>InBody 體態目標：{empData.target || (empData.group === 'fat' ? '減脂' : '增肌')}</span>
                </div>
                <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                  目標達成率 {goalCompletionPct}%
                </span>
              </div>

              {/* 成效進度條 */}
              <div className="w-full bg-purple-50 h-2.5 rounded-full overflow-hidden border border-purple-100 p-0.5">
                <div
                  className="bg-gradient-to-r from-purple-600 to-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${goalCompletionPct}%` }}
                ></div>
              </div>

              <div className="flex justify-between items-center text-[11px] text-gray-500">
                <span>目標：{empData.targetVal || 0} {empData.group === 'fat' ? '%' : 'kg'}</span>
                <span>目前差距：<strong className="text-purple-900">{empData.currentGap || 0}</strong> {empData.group === 'fat' ? '%' : 'kg'}</span>
              </div>
            </div>
          )}

          {/* 今日任務列表 */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2 px-1">今日任務</div>
            <div className="space-y-2">
              {/* 飲食打卡 */}
              <div className="bg-white p-3 rounded-2xl border border-purple-100 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-xl">🥗</div>
                  <div>
                    <div className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <span>【今日熱量】飲食打卡</span>
                      {userStats.consecutiveDays > 0 && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
                          🔥 連續 {userStats.consecutiveDays} 天
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-purple-600 mt-0.5">
                      WonderFood-AI 日統計截圖 +1分（每連續 10 天贈送馬甲果凍 1 包）
                    </div>
                  </div>
                </div>
                <button
                  disabled={getTaskStatus('飲食打卡') !== 'todo'}
                  onClick={() => setUploadTask({ task: '飲食打卡', pts: 1 })}
                  className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                    getTaskStatus('飲食打卡') === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : getTaskStatus('飲食打卡') === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-purple-100 text-purple-700 active:scale-95'
                  }`}
                >
                  {getTaskStatus('飲食打卡') === 'done' ? '✅ 完成' : getTaskStatus('飲食打卡') === 'pending' ? '⏳ 審核中' : '▶ 上傳'}
                </button>
              </div>

              {/* 健康飲食 */}
              <div className="bg-white p-3 rounded-2xl border border-purple-100 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-xl">🏅</div>
                  <div>
                    <div className="text-xs font-bold text-purple-950">【均衡滿分】健康達標</div>
                    <div className="text-[10px] text-purple-600 mt-0.5">週達4次+4分，第5-7次各+2分</div>
                  </div>
                </div>
                <button
                  disabled={getTaskStatus('健康飲食') !== 'todo'}
                  onClick={() => setUploadTask({ task: '健康飲食', pts: 2 })}
                  className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                    getTaskStatus('健康飲食') === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : getTaskStatus('健康飲食') === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-purple-100 text-purple-700 active:scale-95'
                  }`}
                >
                  {getTaskStatus('健康飲食') === 'done' ? '✅ 完成' : getTaskStatus('健康飲食') === 'pending' ? '⏳ 審核中' : '▶ 上傳'}
                </button>
              </div>

              {/* 運動打卡 */}
              <div className="bg-white p-3 rounded-2xl border border-purple-100 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl">🏋️</div>
                  <div>
                    <div className="text-xs font-bold text-purple-950">【汗水閃耀】運動打卡</div>
                    <div className="text-[10px] text-purple-600 mt-0.5">週積分：1/1/3/1/1/3/0（第3、6次爆擊+3，每週最高10分）</div>
                  </div>
                </div>
                <button
                  disabled={getTaskStatus('運動打卡') !== 'todo'}
                  onClick={() => setUploadTask({ task: '運動打卡', pts: 1 })}
                  className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                    getTaskStatus('運動打卡') === 'done'
                      ? 'bg-emerald-100 text-emerald-700'
                      : getTaskStatus('運動打卡') === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-purple-100 text-purple-700 active:scale-95'
                  }`}
                >
                  {getTaskStatus('運動打卡') === 'done' ? '✅ 完成' : getTaskStatus('運動打卡') === 'pending' ? '⏳ 審核中' : '▶ 上傳'}
                </button>
              </div>
            </div>
          </div>

          {/* 活動限定任務 */}
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2 px-1">活動大任務</div>
            <div className="bg-white p-3 rounded-2xl border border-purple-100 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-xl">📸</div>
                <div>
                  <div className="text-xs font-bold text-purple-950">【變身日記】照片 + 心得</div>
                  <div className="text-[10px] text-purple-600 mt-0.5">3張照片 + 100字心得（整個活動限1次 +5分）</div>
                </div>
              </div>
              <button
                disabled={photoStatus !== 'todo'}
                onClick={() => setUploadTask({ task: '照片心得', pts: 5 })}
                className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all ${
                  photoStatus === 'done'
                    ? 'bg-emerald-100 text-emerald-700'
                    : photoStatus === 'pending'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-purple-100 text-purple-700 active:scale-95'
                }`}
              >
                {photoStatus === 'done' ? '✅ 已完成' : photoStatus === 'pending' ? '⏳ 審核中' : '▶ 上傳'}
              </button>
            </div>
          </div>

          {/* 🧡 馬甲果凍 (飲食連續打卡獎勵) */}
          <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 border border-amber-200 p-4 rounded-2xl shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <span>🧡</span> 馬甲果凍 (飲食連續打卡獎勵)
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                連續飲食 {userStats.consecutiveDays} 天
              </span>
            </div>

            <div className="text-[11px] text-amber-800 leading-relaxed mb-3">
              連續上傳飲食日誌每滿 10 天即可獲得 1 包馬甲果凍（最多 4 包）。達標後由主辦人審核發放。
            </div>

            {/* 進度條與門檻標記 */}
            <div className="space-y-1.5 mb-3 bg-white/70 p-2.5 rounded-xl border border-amber-100">
              <div className="flex justify-between items-center text-[10px] font-bold text-amber-900">
                <span>連續打卡目標進度</span>
                <span>{userStats.consecutiveDays} / 40 天</span>
              </div>
              <div className="w-full bg-amber-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-400 to-orange-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (userStats.consecutiveDays / 40) * 100)}%` }}
                />
              </div>
              <div className="grid grid-cols-4 gap-1 text-[9px] text-center pt-1 font-bold text-amber-800">
                <div className={userStats.consecutiveDays >= 10 ? 'text-amber-900 font-extrabold' : 'text-gray-400'}>
                  10天 (1包) {userStats.consecutiveDays >= 10 ? '✓' : ''}
                </div>
                <div className={userStats.consecutiveDays >= 20 ? 'text-amber-900 font-extrabold' : 'text-gray-400'}>
                  20天 (2包) {userStats.consecutiveDays >= 20 ? '✓' : ''}
                </div>
                <div className={userStats.consecutiveDays >= 30 ? 'text-amber-900 font-extrabold' : 'text-gray-400'}>
                  30天 (3包) {userStats.consecutiveDays >= 30 ? '✓' : ''}
                </div>
                <div className={userStats.consecutiveDays >= 40 ? 'text-amber-900 font-extrabold' : 'text-gray-400'}>
                  40天 (4包) {userStats.consecutiveDays >= 40 ? '✓' : ''}
                </div>
              </div>
            </div>

            {/* 果凍數量狀態 */}
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
              <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                <div className="text-gray-500 font-medium">應得果凍</div>
                <div className="text-base font-extrabold text-amber-600 mt-0.5">{userStats.jellyCount} 包</div>
              </div>
              <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                <div className="text-gray-500 font-medium">已領取發放</div>
                <div className="text-base font-extrabold text-emerald-600 mt-0.5">{empData?.jellyDelivered || 0} 包</div>
              </div>
              <div className="bg-white/80 p-2 rounded-xl border border-amber-100">
                <div className="text-gray-500 font-medium">待發放</div>
                <div className="text-base font-extrabold text-orange-600 mt-0.5">
                  {Math.max(0, userStats.jellyCount - (empData?.jellyDelivered || 0))} 包
                </div>
              </div>
            </div>
          </div>

          {/* 完賽獎勵狀態 */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <span>🎁</span> 完賽禮解鎖狀態
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCompletionEligible ? 'bg-emerald-500 text-white' : 'bg-amber-200 text-amber-900'}`}>
                {isCompletionEligible ? '已達標！' : '未達標'}
              </span>
            </div>
            <div className="text-[11px] text-amber-800 leading-relaxed">
              門檻條件：總積分 ≥ 45 分 + 變身日記（照片心得）審核通過。
            </div>
            {isCompletionEligible && (
              <button
                onClick={() => {
                  setCompletionChoice(empData.completionReward || 'm2-超能水光凍*10入');
                  setShowCompletionModal(true);
                }}
                className="mt-3 w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs rounded-xl shadow-md active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🎁</span>
                <span>{empData.completionReward ? `✅ 已選擇：${empData.completionReward} (點擊可修改)` : '點此選擇完賽禮 (3選1)'}</span>
              </button>
            )}
          </div>

          {/* 拼字字母區 */}
          <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm relative overflow-hidden">
            <div className="flex justify-between items-center mb-1">
              <div className="text-xs font-bold text-purple-950 flex items-center gap-1">
                <span>🎉</span> 拼字挑戰 (SHINYBRANDS)
              </div>
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                每 8 分解鎖 1 字母
              </span>
            </div>
            <div className="text-[10px] text-purple-600 mb-3">集齊全部 11 個字母解鎖特殊 Bonus 完賽禮物！</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(() => {
                const activeLetters = userStats?.letters || empData?.letters || [];
                const lettersCopy = [...activeLetters];
                return TARGET_WORD.split('').map((char, idx) => {
                  const foundIndex = lettersCopy.indexOf(char);
                  const hasChar = foundIndex !== -1;
                  if (hasChar) {
                    lettersCopy.splice(foundIndex, 1);
                  }
                  return (
                    <div
                      key={idx}
                      className={`w-7 h-9 rounded-xl flex items-center justify-center font-bold text-sm border transition-all duration-300 transform ${
                        hasChar
                          ? 'bg-gradient-to-b from-purple-600 to-indigo-700 text-amber-300 border-amber-400 shadow-md scale-105 animate-pulse'
                          : 'bg-purple-50 text-gray-300 border-purple-100 opacity-60'
                      }`}
                    >
                      {hasChar ? char : '?'}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="flex justify-between items-center text-[10px] text-gray-500 pt-1 flex-wrap gap-2">
              {(() => {
                const activeLetters = userStats?.letters || empData?.letters || [];
                const isFull = activeLetters.length >= 11;
                return (
                  <>
                    <span>已解鎖：<strong className="text-purple-900 font-bold">{activeLetters.length} / 11</strong> 個字母</span>
                    {empData?.spellReward ? (
                      <button
                        onClick={() => {
                          setSpellChoice(empData.spellReward || '【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)');
                          setShowSpellModal(true);
                        }}
                        className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100"
                      >
                        ✅ 已選 Bonus：{empData.spellReward}
                      </button>
                    ) : isFull ? (
                      <button
                        onClick={() => {
                          setSpellChoice('【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)');
                          setShowSpellModal(true);
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] animate-bounce shadow"
                      >
                        🎉 選擇 Bonus 獎勵 (2選1)
                      </button>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 排行榜 Tab */}
      {activeTab === 'rank' && (
        <div className="p-3 space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'all', label: '🏆 綜合' },
              { id: 'fat', label: '⚡ 減脂組' },
              { id: 'muscle', label: '💪 增肌組' },
              { id: 'team', label: '👥 我的隊伍' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setRankFilter(btn.id as any)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  rankFilter === btn.id ? 'bg-purple-600 text-white' : 'bg-white border border-purple-100 text-gray-600'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-purple-100 overflow-hidden shadow-sm">
            <div className="p-3 bg-purple-50 border-b border-purple-100 text-xs font-bold text-purple-900 flex justify-between">
              <span>名次 / 暱稱</span>
              <span>積分</span>
            </div>
            <div className="divide-y divide-purple-50">
              {rankingList.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">尚無排行資料</div>
              ) : (
                rankingList.map((emp, idx) => {
                  const isMe = emp.empId === empData.empId;
                  return (
                    <div
                      key={emp.empId}
                      className={`p-3 flex items-center justify-between text-xs ${isMe ? 'bg-purple-100/60 font-bold' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            idx === 0 ? 'bg-amber-400 text-amber-950' : idx === 1 ? 'bg-gray-300 text-gray-800' : idx === 2 ? 'bg-amber-700 text-amber-100' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-purple-950">
                          {emp.nickname || emp.name} {isMe && '👈 (我)'}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded ${
                            emp.group === 'fat' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {emp.group === 'fat' ? '減脂' : '增肌'}
                        </span>
                      </div>
                      <span className="font-extrabold text-purple-700">{emp.totalPts || 0} 分</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}



      {/* 個人 Profile Tab */}
      {activeTab === 'me' && (
        <div className="p-3 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-purple-100 space-y-3 shadow-sm">
            <div className="flex justify-between items-center border-b border-purple-50 pb-2">
              <span className="text-xs text-gray-500">員工編號</span>
              <span className="text-xs font-bold text-purple-950">{empData.empId}</span>
            </div>
            <div className="flex justify-between items-center border-b border-purple-50 pb-2">
              <span className="text-xs text-gray-500">姓名</span>
              <span className="text-xs font-bold text-purple-950">{empData.name}</span>
            </div>
            <div className="flex justify-between items-center border-b border-purple-50 pb-2">
              <span className="text-xs text-gray-500">目前組別</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${empData.group === 'fat' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                {empData.group === 'fat' ? '⚡ 減脂組' : '💪 增肌組'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">累積總積分</span>
              <span className="text-sm font-extrabold text-purple-600">{totalPts} 分</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-sm">
            <div className="text-xs font-bold text-purple-950 mb-3">👥 我的隊伍</div>
            {myTeam ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-purple-50 p-2.5 rounded-xl border border-purple-100">
                  <span className="text-xs font-bold text-purple-900">🏴 {myTeam.teamName}</span>
                  <span className="text-[10px] bg-white px-2 py-0.5 rounded font-mono text-purple-600 border border-purple-200">
                    碼: {myTeam.inviteCode}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">隊員人數: {myTeam.members.length}/5 人</div>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <div className="text-gray-400">尚未加入隊伍（2–5人可參加團體競賽）</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={teamNameInput}
                    onChange={(e) => setTeamNameInput(e.target.value)}
                    placeholder="建立隊伍名稱"
                    className="flex-1 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    onClick={async () => {
                      if (!teamNameInput.trim()) return;
                      const code = Array(6).fill(0).map(() => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 30)]).join('');
                      const docRef = await addDoc(collection(db, 'summer2026_teams'), {
                        teamName: teamNameInput.trim(),
                        inviteCode: code,
                        leaderId: empData.empId,
                        members: [empData.empId],
                        createdAt: new Date(),
                      });
                      setMyTeam({ id: docRef.id, teamName: teamNameInput.trim(), inviteCode: code, leaderId: empData.empId, members: [empData.empId] });
                      setTeamNameInput('');
                      showToast('✅ 隊伍建立成功！');
                    }}
                    className="bg-purple-600 text-white px-3 py-2 rounded-xl font-bold"
                  >
                    建立
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setEmpData(null)}
            className="w-full py-3 bg-red-50 text-red-600 font-bold border border-red-200 rounded-xl text-xs"
          >
            🚪 登出系統
          </button>
        </div>
      )}

      {/* 底部導覽列 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-purple-100 flex justify-around py-2 shadow-lg z-40">
        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'map' ? 'text-purple-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">🗺️</span> 地圖
        </button>
        <button
          onClick={() => setActiveTab('rank')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'rank' ? 'text-purple-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">🏆</span> 排行
        </button>
        <button
          onClick={() => setActiveTab('me')}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-bold ${activeTab === 'me' ? 'text-purple-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">👤</span> 我的
        </button>
      </div>

      {/* 上傳對話框 Modal */}
      {uploadTask && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-purple-950 text-base">上傳：{uploadTask.task}</h3>
              <button onClick={() => setUploadTask(null)} className="text-gray-400 font-bold text-xl">✕</button>
            </div>

            <div
              className="bg-purple-50 p-3 rounded-2xl text-[11px] text-purple-900 leading-relaxed border border-purple-100"
              dangerouslySetInnerHTML={{ __html: TASK_INSTRUCTIONS[uploadTask.task] || '' }}
            />

            <div className="border-2 border-dashed border-purple-200 rounded-2xl p-6 text-center bg-purple-50/50">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFile(file);
                    setPreviewUrl(URL.createObjectURL(file));
                  }
                }}
                className="hidden"
                id="fileUploadInp"
              />
              <label htmlFor="fileUploadInp" className="cursor-pointer block">
                {previewUrl ? (
                  <img src={previewUrl} alt="預覽" className="max-h-48 mx-auto rounded-xl object-contain" />
                ) : (
                  <div>
                    <div className="text-3xl mb-1">📎</div>
                    <div className="text-xs font-bold text-purple-700">點擊選擇照片 / 截圖</div>
                  </div>
                )}
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setUploadTask(null)}
                className="w-24 py-3 bg-gray-100 text-gray-600 font-bold text-xs rounded-xl"
              >
                取消
              </button>
              <button
                disabled={isUploading || !selectedFile}
                onClick={handleUploadSubmit}
                className="flex-1 py-3 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                {isUploading ? '上傳中...' : '✅ 確認送出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 明細對話框 Modal */}
      {showScoreDetail && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 space-y-4 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-purple-100 pb-3 flex-shrink-0">
              <div>
                <h3 className="font-bold text-purple-950 text-sm flex items-center gap-1.5">
                  <span>📊</span> 個人得分與打卡詳細紀錄
                </h3>
                <p className="text-[10px] text-purple-500 mt-0.5">按週別與關卡分類統計打卡狀況與得分</p>
              </div>
              <button
                onClick={() => setShowScoreDetail(false)}
                className="w-7 h-7 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-full flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Score Summary Box */}
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-3.5 rounded-2xl text-white flex-shrink-0 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs border-b border-purple-700/60 pb-2">
                <span className="text-purple-200">累計總積分</span>
                <span className="text-lg font-extrabold text-amber-300">{totalPts} 分</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-0.5">
                <div className="bg-purple-950/50 p-1.5 rounded-xl border border-purple-800">
                  <div className="text-purple-300">總打卡</div>
                  <div className="font-bold text-amber-200 mt-0.5">{myCheckins.length} 筆</div>
                </div>
                <div className="bg-purple-950/50 p-1.5 rounded-xl border border-purple-800">
                  <div className="text-purple-300">已通過</div>
                  <div className="font-bold text-emerald-300 mt-0.5">
                    {myCheckins.filter((c) => c.status === '通過' || c.status === '補登通過').length} 筆
                  </div>
                </div>
                <div className="bg-purple-950/50 p-1.5 rounded-xl border border-purple-800">
                  <div className="text-purple-300">待審核</div>
                  <div className="font-bold text-amber-300 mt-0.5">
                    {myCheckins.filter((c) => c.status === '待審核').length} 筆
                  </div>
                </div>
              </div>
            </div>

            {/* Week-Grouped List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {myCheckins.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs">
                  <div className="text-3xl mb-2">📥</div>
                  尚未有任何打卡紀錄，快到地圖頁面點選任務打卡吧！
                </div>
              ) : (
                (() => {
                  const calculatedCheckins = attachCalculatedPointsToCheckins(myCheckins, startDateStr);
                  const startMs = new Date(startDateStr).getTime();
                  // 整理打卡紀錄並按週次分類
                  const groupedWeeks: Record<number, { weekPts: number; list: CalculatedCheckin[] }> = {};

                  calculatedCheckins.forEach((c) => {
                    const cDate = c.createdAt?.seconds
                      ? new Date(c.createdAt.seconds * 1000)
                      : new Date(c.createdAt || Date.now());
                    const diffDays = Math.floor((cDate.getTime() - startMs) / (1000 * 60 * 60 * 24));
                    const weekNum = diffDays >= 0 ? Math.floor(diffDays / 7) + 1 : 1;

                    if (!groupedWeeks[weekNum]) {
                      groupedWeeks[weekNum] = { weekPts: 0, list: [] };
                    }
                    groupedWeeks[weekNum].list.push(c);
                    if (c.status === '通過' || c.status === '補登通過') {
                      groupedWeeks[weekNum].weekPts += c.earnedPts;
                    }
                  });

                  // 依週次倒序排列 (最新的週在最上方)
                  const weekKeys = Object.keys(groupedWeeks)
                    .map(Number)
                    .sort((a, b) => b - a);

                  return weekKeys.map((wk) => {
                    const group = groupedWeeks[wk];

                    // 將本週紀錄按關卡 (taskType) 分組並統計
                    const taskGroupMap: Record<
                      string,
                      { count: number; passedCount: number; pts: number; list: Checkin[] }
                    > = {};

                    group.list.forEach((c) => {
                      const tName = c.taskType || '一般打卡';
                      if (!taskGroupMap[tName]) {
                        taskGroupMap[tName] = { count: 0, passedCount: 0, pts: 0, list: [] };
                      }
                      taskGroupMap[tName].count += 1;
                      taskGroupMap[tName].list.push(c);
                      if (c.status === '通過' || c.status === '補登通過') {
                        taskGroupMap[tName].passedCount += 1;
                        taskGroupMap[tName].pts += c.earnedPts || 0;
                      }
                    });

                    // 日期轉換與解析函式
                    const parseCheckinDate = (c: Checkin) => {
                      let dateObj: Date;
                      if (c.isMakeup && c.makeupDate) {
                        const parts = c.makeupDate.split('-');
                        if (parts.length === 3) {
                          dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                        } else {
                          dateObj = new Date(c.makeupDate);
                        }
                      } else if (c.createdAt?.seconds) {
                        dateObj = new Date(c.createdAt.seconds * 1000);
                      } else if (c.createdAt) {
                        dateObj = new Date(c.createdAt);
                      } else {
                        dateObj = new Date();
                      }
                      const m = dateObj.getMonth() + 1;
                      const d = dateObj.getDate();
                      const dateStr = `${m}/${d}`;
                      return { dateObj, dateStr };
                    };

                    return (
                      <div key={wk} className="bg-purple-50/70 border border-purple-100 rounded-2xl overflow-hidden shadow-2xs">
                        {/* Week Header Bar */}
                        <div className="bg-gradient-to-r from-purple-100 to-indigo-100 px-3 py-2 flex justify-between items-center border-b border-purple-200/60">
                          <div className="font-bold text-purple-950 text-xs flex items-center gap-1.5">
                            <span className="bg-purple-700 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-2xs">
                              Week {wk}
                            </span>
                            <span>第 {wk} 週</span>
                          </div>
                          <div className="text-xs font-extrabold text-purple-800 bg-white/80 px-2 py-0.5 rounded-lg border border-purple-200/80">
                            週計 <span className="text-amber-600">+{group.weekPts}</span> 分
                          </div>
                        </div>

                        {/* 本週各關卡分類得分卡片 */}
                        <div className="p-3 bg-white/90 space-y-2">
                          <div className="text-[11px] font-bold text-purple-900 flex justify-between items-center pb-1 border-b border-purple-100">
                            <span className="flex items-center gap-1">
                              <span>🎯</span> 各關卡紀錄得分狀況
                            </span>
                            <span className="text-[9px] text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full font-normal">
                              點擊關卡可展開 / 收合明細
                            </span>
                          </div>

                          <div className="space-y-2">
                            {Object.entries(taskGroupMap).map(([tName, stat]) => {
                              const taskKey = `${wk}_${tName}`;
                              const isExpanded = !!expandedTasks[taskKey];

                              // 排序該關卡的打卡紀錄 (依打卡日期由早到晚，如 8/3, 8/4, 8/5...)
                              const sortedTaskCheckins = [...stat.list].sort((a, b) => {
                                const dA = parseCheckinDate(a).dateObj.getTime();
                                const dB = parseCheckinDate(b).dateObj.getTime();
                                return dA - dB;
                              });

                              return (
                                <div
                                  key={tName}
                                  className="border border-purple-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs transition-all"
                                >
                                  {/* 可點擊展開的關卡 Header */}
                                  <button
                                    onClick={() =>
                                      setExpandedTasks((prev) => ({
                                        ...prev,
                                        [taskKey]: !prev[taskKey],
                                      }))
                                    }
                                    className="w-full text-left p-2.5 flex items-center justify-between bg-gradient-to-r from-purple-50/90 to-indigo-50/40 hover:bg-purple-100/60 transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-purple-950 text-xs">{tName}</span>
                                      <span className="text-purple-700 bg-purple-200/60 px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                                        {stat.passedCount} 次成功
                                      </span>
                                      <span className="font-extrabold text-amber-600 text-xs">
                                        {stat.pts} 分
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-white/80 border border-purple-200/70 px-2 py-0.5 rounded-full shadow-2xs">
                                      <span>{isExpanded ? '收合' : '點擊展開'}</span>
                                      <span>{isExpanded ? '▲' : '▼'}</span>
                                    </div>
                                  </button>

                                  {/* 點擊展開後的詳細列表 (依日期排序) */}
                                  {isExpanded && (
                                    <div className="p-2 bg-purple-50/40 border-t border-purple-100 space-y-1.5">
                                      <div className="text-[10px] font-bold text-purple-500 px-1 flex justify-between items-center">
                                        <span>📅 【{tName}】依日期紀錄明細：</span>
                                        <span>共 {stat.list.length} 筆</span>
                                      </div>
                                      <div className="space-y-1">
                                        {sortedTaskCheckins.map((c) => {
                                          const { dateStr } = parseCheckinDate(c);
                                          const isPassed = c.status === '通過' || c.status === '補登通過';
                                          const isPending = c.status === '待審核';

                                          return (
                                            <div
                                              key={c.id || Math.random()}
                                              className="p-2 bg-white rounded-xl flex items-center justify-between text-xs border border-purple-100/80 shadow-2xs"
                                            >
                                              <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-extrabold text-purple-900 bg-purple-100/80 px-2 py-0.5 rounded-md text-[11px] flex-shrink-0">
                                                  {dateStr}
                                                </span>
                                                {c.isMakeup && (
                                                  <span className="text-[8px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                                                    補登 ({c.makeupDate || dateStr})
                                                  </span>
                                                )}
                                              </div>

                                              <div className="flex items-center gap-2 flex-shrink-0">
                                                {isPassed ? (
                                                  <span
                                                    className={`font-extrabold text-xs px-2 py-0.5 rounded-md ${
                                                      c.isCrit
                                                        ? 'text-amber-800 bg-amber-100 border border-amber-300 shadow-2xs font-bold animate-pulse'
                                                        : c.earnedPts === 0
                                                        ? 'text-gray-400 bg-gray-100'
                                                        : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                                    }`}
                                                  >
                                                    +{c.earnedPts} 分 {c.isCrit && '💥 爆擊!'}
                                                  </span>
                                                ) : null}

                                                <span
                                                  className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${
                                                    isPassed
                                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                      : isPending
                                                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                                                      : 'bg-red-100 text-red-700 border border-red-200'
                                                  }`}
                                                >
                                                  {c.status}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* 完賽禮彈窗 Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 text-center space-y-3">
            <div className="text-4xl">🎁</div>
            <h3 className="font-bold text-purple-950 text-base">恭喜達成完賽條件！</h3>
            <p className="text-xs text-purple-600">請選擇完賽禮（3選1）</p>

            <div className="space-y-2 text-left">
              {[
                { id: 'm2-超能水光凍*10入', label: '💧 m2-超能水光凍*10入' },
                { id: 'm2-超能膠原凍*10入', label: '✨ m2-超能膠原凍*10入' },
                { id: '新普利夜酵凍*10入', label: '🌙 新普利夜酵凍*10入' },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => setCompletionChoice(item.id)}
                  className={`p-3 rounded-xl border-2 font-bold text-xs cursor-pointer transition-all ${
                    completionChoice === item.id ? 'border-purple-600 bg-purple-50 text-purple-950' : 'border-purple-100 text-gray-600'
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCompletionModal(false)} className="w-20 py-2.5 bg-gray-100 text-gray-600 font-bold text-xs rounded-xl">
                取消
              </button>
              <button
                disabled={!completionChoice}
                onClick={handleCompletionSubmit}
                className="flex-1 py-2.5 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                確認選擇
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 拼字 Bonus 獎勵彈窗 Modal */}
      {showSpellModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 text-center space-y-3">
            <div className="text-4xl">🎉</div>
            <h3 className="font-bold text-purple-950 text-base">恭喜解鎖拼字大獎！</h3>
            <p className="text-xs text-purple-600">請選擇拼字 BONUS 禮（2選1）</p>

            <div className="space-y-2 text-left">
              {[
                {
                  id: '【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)',
                  label: '🌸 【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)',
                },
                {
                  id: '【新普利】日本專利益生菌DX 30入',
                  label: '🌿 【新普利】日本專利益生菌DX 30入',
                },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSpellChoice(item.id)}
                  className={`p-3 rounded-xl border-2 font-bold text-xs cursor-pointer leading-relaxed transition-all ${
                    spellChoice === item.id ? 'border-purple-600 bg-purple-50 text-purple-950' : 'border-purple-100 text-gray-600'
                  }`}
                >
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowSpellModal(false)} className="w-20 py-2.5 bg-gray-100 text-gray-600 font-bold text-xs rounded-xl">
                取消
              </button>
              <button
                disabled={!spellChoice}
                onClick={handleSpellSubmit}
                className="flex-1 py-2.5 bg-purple-600 text-white font-bold text-xs rounded-xl shadow-md disabled:opacity-50"
              >
                確認選擇
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
