import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  setDoc,
  query,
  where,
  deleteDoc
} from 'firebase/firestore';
import { Employee, Checkin, Team, SystemSettings } from '../types';
import { calculateEmployeeStats, SPORT_PTS_MAP, TARGET_WORD } from '../lib/calcEngine';

const ADMIN_PASSWORD = 'shiny2026admin';

export default function AdminView({ onSwitchToPlayer }: { onSwitchToPlayer: () => void }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPw, setAdminPw] = useState('');
  const [adminOperator, setAdminOperator] = useState('');
  const [pwErr, setPwErr] = useState('');

  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'checkins' | 'members' | 'inbody' | 'ranking' | 'jelly' | 'completion' | 'spell' | 'teams' | 'audit' | 'settings'
  >('dashboard');

  // State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({});

  // Filter state
  const [checkinStatusFilter, setCheckinStatusFilter] = useState('待審核');
  const [checkinTaskFilter, setCheckinTaskFilter] = useState('');
  const [searchEmp, setSearchEmp] = useState('');
  const [checkinDateFilter, setCheckinDateFilter] = useState('');
  const [memberGroupFilter, setMemberGroupFilter] = useState('');
  const [inbodyGroupFilter, setInbodyGroupFilter] = useState('');
  const [rankGroupFilter, setRankGroupFilter] = useState('');
  const [jellyFilter, setJellyFilter] = useState('pending');
  const [completionFilter, setCompletionFilter] = useState('all');
  const [spellFilter, setSpellFilter] = useState('all');

  // Quick Review Lightbox Modal State
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Edit Employee Modal
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editTotalPts, setEditTotalPts] = useState(0);

  // Makeup Modal
  const [makeupEmp, setMakeupModalEmp] = useState<Employee | null>(null);
  const [makeupTask, setMakeupTask] = useState('飲食打卡');
  const [makeupDate, setMakeupDate] = useState(new Date().toISOString().split('T')[0]);
  const [makeupReason, setMakeupReason] = useState('');

  // Settings State Form
  const [startDateSetting, setStartDateSetting] = useState('2026-07-13');

  // Audit State
  const [auditResults, setAuditResults] = useState<{
    correctCount: number;
    diffCount: number;
    diffList: { emp: Employee; calcStats: ReturnType<typeof calculateEmployeeStats> }[];
  } | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const handleAdminLogin = async () => {
    if (adminPw !== ADMIN_PASSWORD) {
      setPwErr('密碼錯誤');
      return;
    }
    if (!adminOperator.trim()) {
      setPwErr('請輸入操作員編號（例如 SM0001）');
      return;
    }
    setPwErr('');
    setIsAuthenticated(true);
    fetchData();
  };

  const fetchData = async () => {
    try {
      const eSnap = await getDocs(collection(db, 'summer2026_employees'));
      setEmployees(eSnap.docs.map((d) => ({ empId: d.id, ...d.data() } as Employee)));

      const cSnap = await getDocs(collection(db, 'summer2026_checkins'));
      setCheckins(cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Checkin)));

      const tSnap = await getDocs(collection(db, 'summer2026_teams'));
      setTeams(tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Team)));

      const sSnap = await getDoc(doc(db, 'summer2026_settings', 'main'));
      if (sSnap.exists()) {
        const sData = sSnap.data() as SystemSettings;
        setSettings(sData);
        if (sData.startDate) setStartDateSetting(sData.startDate);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, activeTab]);

  // 重算單一員工分數並寫入數據庫
  const recalcAndUpdateEmp = async (empId: string, customCheckinsList?: Checkin[]) => {
    const checkinsToUse = customCheckinsList || checkins;
    const empSnap = await getDoc(doc(db, 'summer2026_employees', empId));
    if (!empSnap.exists()) return;
    const empData = { empId, ...empSnap.data() } as Employee;

    // 篩選該員工「通過」與「補登通過」的打卡
    const myApproved = checkinsToUse.filter(
      (c) => c.empId === empId && (c.status === '通過' || c.status === '補登通過')
    );

    const calc = calculateEmployeeStats(empData, myApproved, settings.startDate || '2026-07-13');

    const updates = {
      taskPts: calc.taskPts,
      totalPts: calc.totalPts,
      weeklyDiet: calc.weeklyDiet,
      weeklySport: calc.weeklySport,
      weeklyHealth: calc.weeklyHealth,
      consecutiveDays: calc.consecutiveDays,
      lastDietDate: calc.lastDietDate,
      jellyCount: calc.jellyCount,
      lastWeek: calc.lastWeek,
      letters: calc.letters,
    };

    await updateDoc(doc(db, 'summer2026_employees', empId), updates);
    return updates;
  };

  // 審核打卡 (Quick Review)
  const handleQuickReview = async (checkinId: string, status: '通過' | '駁回', empId: string) => {
    try {
      // 1. 更新打卡紀錄
      const cRef = doc(db, 'summer2026_checkins', checkinId);
      await updateDoc(cRef, {
        status,
        reviewedAt: new Date(),
        reviewedBy: adminOperator,
      });

      // 2. 隨即精確重算該員工所有分數並更新
      const updatedCheckins = checkins.map((c) => (c.id === checkinId ? { ...c, status } : c));
      await recalcAndUpdateEmp(empId, updatedCheckins);

      // 重新載入
      fetchData();
    } catch (e: any) {
      alert('審核失敗：' + e.message);
    }
  };

  // 補登打卡
  const handleSaveMakeup = async () => {
    if (!makeupEmp) return;
    try {
      const docRef = await addDoc(collection(db, 'summer2026_checkins'), {
        empId: makeupEmp.empId,
        empName: makeupEmp.name,
        taskType: makeupTask,
        pts: makeupTask === '飲食打卡' ? 1 : makeupTask === '運動打卡' ? 1 : 2,
        status: '補登通過',
        isMakeup: true,
        makeupDate,
        makeupReason: makeupReason || '主辦人補登',
        makeupBy: adminOperator,
        createdAt: new Date(makeupDate + 'T12:00:00'),
      });

      await recalcAndUpdateEmp(makeupEmp.empId);
      alert('✅ 補登成功！');
      setMakeupModalEmp(null);
      fetchData();
    } catch (e: any) {
      alert('補登失敗：' + e.message);
    }
  };

  // 標記果凍發放 (單包或一鍵發放全數)
  const handleDeliverJelly = async (empId: string, newDeliveredCount: number) => {
    try {
      await updateDoc(doc(db, 'summer2026_employees', empId), {
        jellyDelivered: newDeliveredCount,
      });
      alert(`✅ 已更新果凍發放紀錄！(目前已發放 ${newDeliveredCount} 包)`);
      fetchData();
    } catch (e: any) {
      alert('發放標記失敗：' + e.message);
    }
  };

  // 標記完賽禮發放
  const handleDeliverCompletion = async (empId: string) => {
    try {
      await updateDoc(doc(db, 'summer2026_employees', empId), {
        completionDelivered: true,
        completionDeliveredAt: new Date(),
      });
      alert('✅ 已標記完賽禮已發放！');
      fetchData();
    } catch (e: any) {
      alert('標記失敗：' + e.message);
    }
  };

  // 標記拼字獎勵發放
  const handleDeliverSpell = async (empId: string) => {
    try {
      await updateDoc(doc(db, 'summer2026_employees', empId), {
        spellDelivered: true,
        spellDeliveredAt: new Date(),
      });
      alert('✅ 已標記拼字獎勵已發放！');
      fetchData();
    } catch (e: any) {
      alert('標記失敗：' + e.message);
    }
  };

  // 計算並分配名次積分
  const handleCalcRankPts = async () => {
    if (!confirm('確定要根據體態達成率計算並寫入前三名名次積分 (40/35/30分) 嗎？')) return;
    try {
      const settSnap = await getDoc(doc(db, 'summer2026_settings', 'main'));
      const sett = settSnap.exists() ? settSnap.data() : {};
      const r1 = sett.rank1Pts || 40;
      const r2 = sett.rank2Pts || 35;
      const r3 = sett.rank3Pts || 30;

      const fatEmps = employees
        .filter((e) => e.group === 'fat' && e.targetVal > 0)
        .sort((a, b) => (a.currentGap || a.targetVal) - (b.currentGap || b.targetVal));

      const muscleEmps = employees
        .filter((e) => e.group === 'muscle' && e.targetVal > 0)
        .sort((a, b) => (a.currentGap || a.targetVal) - (b.currentGap || b.targetVal));

      const rankScores = [r1, r2, r3];

      for (const [groupIndex, groupList] of [fatEmps, muscleEmps].entries()) {
        for (let i = 0; i < Math.min(3, groupList.length); i++) {
          const emp = groupList[i];
          const addedRankPts = rankScores[i];
          await updateDoc(doc(db, 'summer2026_employees', emp.empId), {
            rankPts: addedRankPts,
            totalPts: (emp.taskPts || 0) + (emp.inbodyPts || 0) + addedRankPts,
          });
        }
      }
      alert('✅ 名次積分計算並套用完成！');
      fetchData();
    } catch (e: any) {
      alert('計算失敗：' + e.message);
    }
  };

  // 解散隊伍
  const handleDisbandTeam = async (teamId: string, teamName: string) => {
    if (!confirm(`確定要解散「${teamName}」隊伍嗎？`)) return;
    try {
      await updateDoc(doc(db, 'summer2026_teams', teamId), { disbanded: true, members: [] });
      alert('✅ 隊伍已解散');
      fetchData();
    } catch (e: any) {
      alert('操作失敗：' + e.message);
    }
  };

  // 匯出 CSV 檔案
  const downloadCSV = (rows: string[][], filename: string) => {
    const bom = '\uFEFF';
    const csv = bom + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // 1. 匯出成員總表 CSV
  const exportMembersCSV = () => {
    const rows = [
      ['員工編號', '姓名', '暱稱', '組別', '任務積分', 'InBody積分', '名次加分', '總積分', '連續打卡天數', '應得果凍包數', '已發果凍包數', '收集字母數'],
      ...employees.map((e) => [
        e.empId,
        e.name,
        e.nickname || '',
        e.group === 'fat' ? '減脂組' : e.group === 'muscle' ? '增肌組' : '未選擇',
        String(e.taskPts || 0),
        String(e.inbodyPts || 0),
        String(e.rankPts || 0),
        String(e.totalPts || 0),
        String(e.consecutiveDays || 0),
        String(e.jellyCount || 0),
        String(e.jellyDelivered || 0),
        String((e.letters || []).length),
      ]),
    ];
    downloadCSV(rows, '夏日挑戰_成員積分總表');
  };

  // 2. 匯出打卡紀錄 CSV
  const exportCheckinsCSV = () => {
    const rows = [
      ['打卡紀錄ID', '員工編號', '姓名', '任務類型', '審核狀態', '獲得分數', '打卡時間', '審核/補登人員', '是否補登', '補登原因'],
      ...filteredCheckins.map((c) => [
        c.id || '',
        c.empId,
        c.empName,
        c.taskType,
        c.status,
        String(c.pts || 0),
        c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000).toLocaleString('zh-TW') : '',
        c.reviewedBy || c.makeupBy || '',
        c.isMakeup ? '是' : '否',
        c.makeupReason || '',
      ]),
    ];
    downloadCSV(rows, '夏日挑戰_打卡審核紀錄');
  };

  // 3. 匯出 InBody 數據 CSV
  const exportInbodyCSV = () => {
    const rows = [
      ['員工編號', '姓名', '組別', '目標類型', '目標數值', '距離目標差距', '名次加分'],
      ...employees
        .filter((e) => e.group)
        .map((e) => [
          e.empId,
          e.name,
          e.group === 'fat' ? '減脂組' : '增肌組',
          e.target || '',
          String(e.targetVal || 0),
          String(e.currentGap || 0),
          String(e.rankPts || 0),
        ]),
    ];
    downloadCSV(rows, '夏日挑戰_InBody體態數據表');
  };

  // 4. 批量全選一鍵通過審核 (支援依關卡)
  const handleBatchApprovePending = async () => {
    const taskTitle = checkinTaskFilter ? `【${checkinTaskFilter}】` : '所有關卡';
    const pendingList = filteredCheckins.filter((c) => c.status === '待審核');
    if (pendingList.length === 0) {
      alert(`目前 ${taskTitle} 無任何「待審核」的打卡紀錄！`);
      return;
    }
    if (!confirm(`確定要將 ${taskTitle} 目前顯示的 ${pendingList.length} 筆「待審核」紀錄，一次性全部標記為「通過」嗎？`)) return;

    try {
      const affectedEmps = new Set<string>();
      for (const c of pendingList) {
        if (!c.id) continue;
        await updateDoc(doc(db, 'summer2026_checkins', c.id), {
          status: '通過',
          reviewedAt: new Date(),
          reviewedBy: adminOperator,
        });
        affectedEmps.add(c.empId);
      }

      // 重算相關員工積分
      for (const empId of affectedEmps) {
        await recalcAndUpdateEmp(empId);
      }

      alert(`✅ 已成功一鍵通過 ${taskTitle} 共 ${pendingList.length} 筆打卡審核！並自動更新同仁總積分。`);
      fetchData();
    } catch (e: any) {
      alert('批量審核失敗：' + e.message);
    }
  };

  // 儲存系統設定
  const handleSaveSettings = async () => {
    try {
      await updateDoc(doc(db, 'summer2026_settings', 'main'), {
        startDate: startDateSetting,
        updatedAt: new Date(),
      });
      alert('✅ 設定已更新！');
      fetchData();
    } catch (e: any) {
      alert('儲存失敗：' + e.message);
    }
  };

  // 執行稽核
  const runAudit = () => {
    setIsAuditing(true);
    const approvedCheckins = checkins.filter((c) => c.status === '通過' || c.status === '補登通過');

    let correct = 0;
    let diff = 0;
    const diffList: { emp: Employee; calcStats: ReturnType<typeof calculateEmployeeStats> }[] = [];

    employees.forEach((emp) => {
      if (!emp.group) return;
      const myCheckins = approvedCheckins.filter((c) => c.empId === emp.empId);
      const calcStats = calculateEmployeeStats(emp, myCheckins, settings.startDate || '2026-07-13');

      const isSame =
        emp.totalPts === calcStats.totalPts &&
        emp.weeklyDiet === calcStats.weeklyDiet &&
        emp.weeklySport === calcStats.weeklySport &&
        emp.weeklyHealth === calcStats.weeklyHealth &&
        emp.consecutiveDays === calcStats.consecutiveDays;

      if (isSame) {
        correct++;
      } else {
        diff++;
        diffList.push({ emp, calcStats });
      }
    });

    setAuditResults({ correctCount: correct, diffCount: diff, diffList });
    setIsAuditing(false);
  };

  // 一鍵修正所有稽核差異
  const handleFixAllDiffs = async () => {
    if (!auditResults?.diffList.length) return;
    if (!confirm(`確定要一鍵修正 ${auditResults.diffList.length} 位有差異的員工分數嗎？`)) return;

    try {
      for (const item of auditResults.diffList) {
        await recalcAndUpdateEmp(item.emp.empId);
      }
      alert('✅ 所有差異均已修復！');
      fetchData();
      runAudit();
    } catch (e: any) {
      alert('修復過程發生錯誤：' + e.message);
    }
  };

  // 登入介面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center p-4">
        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl p-6 w-full max-w-sm text-center text-[#e8e8ff]">
          <div className="text-xl font-bold text-[#ffd700] mb-1">⚔ ShapeShifter</div>
          <div className="text-xs text-[#8888aa] mb-6">主辦人後台管理系統</div>
          <div className="space-y-3">
            <input
              type="password"
              value={adminPw}
              onChange={(e) => setAdminPw(e.target.value)}
              placeholder="請輸入管理員密碼"
              className="w-full bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg px-3 py-2 text-sm text-[#e8e8ff] outline-none focus:border-[#ffd700]"
            />
            <input
              type="text"
              value={adminOperator}
              onChange={(e) => setAdminOperator(e.target.value.toUpperCase())}
              placeholder="操作員編號（如 SM0001）"
              className="w-full bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg px-3 py-2 text-sm text-[#e8e8ff] outline-none focus:border-[#ffd700] uppercase"
            />
            {pwErr && <div className="text-xs text-red-400">{pwErr}</div>}
            <button
              onClick={handleAdminLogin}
              className="w-full py-2.5 bg-[#4a3a9a] hover:bg-[#5a4aaa] text-white font-bold rounded-lg text-sm transition-all"
            >
              登入後台
            </button>
            <button onClick={onSwitchToPlayer} className="text-xs text-[#8888aa] hover:underline mt-2 block mx-auto">
              ← 返回前台遊戲畫面
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 篩選打卡列表
  const filteredCheckins = checkins.filter((c) => {
    if (checkinStatusFilter !== '全部' && c.status !== checkinStatusFilter) return false;
    if (checkinTaskFilter && c.taskType !== checkinTaskFilter) return false;
    if (searchEmp) {
      const kw = searchEmp.toUpperCase();
      return c.empId.includes(kw) || c.empName?.includes(kw);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-[#e8e8ff] flex">
      {/* 側邊導覽 */}
      <div className="w-48 bg-[#1a1a2e] border-r border-[#2a2a4a] p-4 flex flex-col justify-between flex-shrink-0">
        <div className="space-y-1">
          <div className="text-sm font-bold text-[#ffd700] border-b border-[#2a2a4a] pb-3 mb-3">⚔ 後台管理</div>
          {[
            { id: 'dashboard', label: '📊 總覽' },
            { id: 'checkins', label: '📋 打卡審核' },
            { id: 'members', label: '👥 成員管理' },
            { id: 'inbody', label: '📐 InBody 數據' },
            { id: 'ranking', label: '🏆 排行榜' },
            { id: 'jelly', label: '🧡 馬甲果凍' },
            { id: 'completion', label: '🎁 完賽禮名單' },
            { id: 'spell', label: '🎉 拼字獎勵' },
            { id: 'teams', label: '👥 隊伍管理' },
            { id: 'audit', label: '🔍 積分稽核修復' },
            { id: 'settings', label: '⚙️ 活動設定' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id ? 'bg-[#2a2a4a] text-[#ffd700]' : 'text-[#8888aa] hover:bg-[#2a2a4a]/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="space-y-2 border-t border-[#2a2a4a] pt-3">
          <button onClick={onSwitchToPlayer} className="w-full text-left text-xs text-[#8888aa] hover:text-white">
            🎮 切換至前台遊戲
          </button>
          <button onClick={() => setIsAuthenticated(false)} className="w-full text-left text-xs text-red-400">
            🚪 登出
          </button>
        </div>
      </div>

      {/* 主要內容區 */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* 1. 總覽 Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-[#ffd700]">📊 活動總覽</h2>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#ffd700]">
                  {employees.filter((e) => e.group).length}
                </div>
                <div className="text-xs text-[#8888aa] mt-1">已參加人數</div>
              </div>
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#ffd700]">
                  {checkins.filter((c) => c.status === '待審核').length}
                </div>
                <div className="text-xs text-[#8888aa] mt-1">待審核打卡</div>
              </div>
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#ffd700]">
                  {checkins.filter((c) => c.status === '通過' || c.status === '補登通過').length}
                </div>
                <div className="text-xs text-[#8888aa] mt-1">已通過打卡</div>
              </div>
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#ffd700]">{teams.length}</div>
                <div className="text-xs text-[#8888aa] mt-1">建立隊伍數</div>
              </div>
            </div>
          </div>
        )}

        {/* 2. 打卡審核 Checkins */}
        {activeTab === 'checkins' && (
          <div className="space-y-4">
            {/* 頁面標題與動作 */}
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700] flex items-center gap-2">
                  <span>📋</span> 打卡審核中心
                </h2>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  支援關主專屬分頁、圖片微縮點擊即審、連續快速審核 Modal 及關卡批量審核
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBatchApprovePending}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  ⚡ 一鍵通過
                  <span className="bg-emerald-900/60 px-1.5 py-0.5 rounded text-[10px] text-emerald-200 font-normal">
                    {checkinTaskFilter ? `【${checkinTaskFilter}】` : '全部關卡'}
                  </span>
                  ({filteredCheckins.filter((c) => c.status === '待審核').length} 筆)
                </button>
                <button
                  onClick={exportCheckinsCSV}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1"
                >
                  📥 匯出 CSV
                </button>
                <button onClick={fetchData} className="px-3 py-1.5 bg-[#4a3a9a] hover:bg-[#5a4aaa] text-white rounded-lg text-xs">
                  🔄 重新整理
                </button>
              </div>
            </div>

            {/* 關主專屬：三大關卡快捷分頁頁籤 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-1">
              {[
                { id: '', label: '🌐 全部關卡', icon: '✨' },
                { id: '飲食打卡', label: '🥗 飲食打卡', icon: '🥗' },
                { id: '健康飲食', label: '🏅 健康飲食', icon: '🏅' },
                { id: '運動打卡', label: '🏋️ 運動打卡', icon: '🏋️' },
                { id: '照片心得', label: '📸 照片心得', icon: '📸' },
              ].map((taskTab) => {
                const isSelected = checkinTaskFilter === taskTab.id;
                const pendingCount = checkins.filter(
                  (c) => c.status === '待審核' && (!taskTab.id || c.taskType === taskTab.id)
                ).length;

                return (
                  <button
                    key={taskTab.id}
                    onClick={() => setCheckinTaskFilter(taskTab.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                      isSelected
                        ? 'bg-gradient-to-br from-[#2a2a5a] to-[#1e1e3e] border-[#ffd700] text-white shadow-lg ring-1 ring-[#ffd700]'
                        : 'bg-[#1a1a2e] border-[#2a2a4a] text-[#8888aa] hover:bg-[#252545] hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>{taskTab.label}</span>
                      {pendingCount > 0 ? (
                        <span className="bg-amber-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full animate-pulse">
                          {pendingCount} 待審
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">已完審</span>
                      )}
                    </div>
                    <div className="text-[10px] mt-1 opacity-70">
                      {taskTab.id ? '關主快速審核' : '全關卡匯總清單'}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 輔助篩選列 */}
            <div className="flex gap-2 flex-wrap items-center bg-[#1a1a2e] p-2.5 rounded-xl border border-[#2a2a4a]">
              <div className="flex items-center gap-1.5 text-xs text-[#8888aa]">
                <span>審核狀態：</span>
                <select
                  value={checkinStatusFilter}
                  onChange={(e) => setCheckinStatusFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-2.5 py-1 text-xs text-white"
                >
                  <option value="待審核">⏳ 待審核</option>
                  <option value="全部">全部狀態</option>
                  <option value="通過">✅ 通過/補登</option>
                  <option value="駁回">❌ 駁回</option>
                </select>
              </div>

              <input
                type="text"
                placeholder="🔍 搜尋員工編號/姓名"
                value={searchEmp}
                onChange={(e) => setSearchEmp(e.target.value)}
                className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-2.5 py-1 text-xs text-white w-44"
              />

              <div className="flex items-center gap-1 text-xs text-[#8888aa]">
                <span>📅 日期：</span>
                <input
                  type="date"
                  value={checkinDateFilter}
                  onChange={(e) => setCheckinDateFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-2 py-1 text-xs text-white"
                />
                {checkinDateFilter && (
                  <button
                    onClick={() => setCheckinDateFilter('')}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    清除
                  </button>
                )}
              </div>

              <div className="ml-auto text-xs text-purple-300 font-bold">
                當前顯示：{filteredCheckins.length} 筆
              </div>
            </div>

            {/* 打卡列表 Table */}
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa] border-b border-[#2a2a4a]">
                    <th className="p-3 w-16 text-center">截圖預覽</th>
                    <th className="p-3">時間</th>
                    <th className="p-3">員工</th>
                    <th className="p-3">關卡類型</th>
                    <th className="p-3">狀態</th>
                    <th className="p-3 text-right">即時審核操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {filteredCheckins.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#8888aa]">
                        <div className="text-2xl mb-1">🔍</div>
                        尚無符合條件的打卡紀錄
                      </td>
                    </tr>
                  ) : (
                    filteredCheckins.map((c, index) => (
                      <tr key={c.id || index} className="hover:bg-[#252545]/60 transition-colors">
                        {/* 截圖微縮圖 */}
                        <td className="p-2 text-center">
                          {c.fileUrl ? (
                            <div
                              onClick={() => setLightboxIndex(index)}
                              className="relative group w-12 h-12 mx-auto rounded-lg overflow-hidden border border-purple-500/40 cursor-pointer shadow-sm hover:border-amber-400 transition-all"
                            >
                              <img
                                src={c.fileUrl}
                                alt="打卡截圖"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-white font-bold transition-opacity">
                                大圖
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-500">無截圖</span>
                          )}
                        </td>

                        <td className="p-3 text-[#8888aa] whitespace-nowrap">
                          {c.createdAt?.seconds
                            ? new Date(c.createdAt.seconds * 1000).toLocaleString('zh-TW', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </td>
                        <td className="p-3 font-bold">
                          <div className="text-white text-xs">{c.empName}</div>
                          <div className="text-[10px] text-[#8888aa]">{c.empId}</div>
                        </td>
                        <td className="p-3">
                          <span className="bg-purple-950/80 text-purple-300 border border-purple-800 px-2 py-0.5 rounded text-[11px] font-bold">
                            {c.taskType}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              c.status === '通過' || c.status === '補登通過'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : c.status === '待審核'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-red-950 text-red-400 border border-red-800'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>

                        {/* 操作按鈕 */}
                        <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                          {c.fileUrl && (
                            <button
                              onClick={() => setLightboxIndex(index)}
                              className="px-2.5 py-1 bg-purple-900/80 hover:bg-purple-800 text-purple-200 border border-purple-700/60 rounded-md text-[11px] font-bold transition-all"
                            >
                              🔍 看大圖連續審核
                            </button>
                          )}
                          {c.status === '待審核' && (
                            <>
                              <button
                                onClick={() => handleQuickReview(c.id!, '通過', c.empId)}
                                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-md text-[11px] font-bold shadow-sm transition-all"
                              >
                                ✅ 通過
                              </button>
                              <button
                                onClick={() => handleQuickReview(c.id!, '駁回', c.empId)}
                                className="px-2.5 py-1 bg-red-700 hover:bg-red-600 text-white rounded-md text-[11px] font-bold shadow-sm transition-all"
                              >
                                ❌ 駁回
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. 成員管理 Members */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-[#ffd700]">👥 成員管理 ({employees.length} 人)</h2>
              <div className="flex gap-2">
                <button
                  onClick={exportMembersCSV}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded text-xs shadow flex items-center gap-1"
                >
                  📥 匯出成員總表 CSV
                </button>
                <select
                  value={memberGroupFilter}
                  onChange={(e) => setMemberGroupFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white"
                >
                  <option value="">全部組別</option>
                  <option value="fat">減脂組</option>
                  <option value="muscle">增肌組</option>
                </select>
                <button onClick={fetchData} className="px-3 py-1.5 bg-[#4a3a9a] text-white rounded text-xs">
                  🔄 重新整理
                </button>
              </div>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa]">
                    <th className="p-3">編號 / 姓名</th>
                    <th className="p-3">暱稱</th>
                    <th className="p-3">組別</th>
                    <th className="p-3">總積分</th>
                    <th className="p-3">連續天數</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {employees
                    .filter((e) => !memberGroupFilter || e.group === memberGroupFilter)
                    .map((e) => (
                      <tr key={e.empId}>
                        <td className="p-3 font-bold">
                          {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                        </td>
                        <td className="p-3">{e.nickname || '未設定'}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              e.group === 'fat' ? 'bg-orange-950 text-orange-400' : 'bg-blue-950 text-blue-400'
                            }`}
                          >
                            {e.group === 'fat' ? '減脂' : e.group === 'muscle' ? '增肌' : '未選擇'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-[#ffd700]">{e.totalPts || 0} 分</td>
                        <td className="p-3">{e.consecutiveDays || 0} 天</td>
                        <td className="p-3 space-x-2">
                          <button
                            onClick={() => setMakeupModalEmp(e)}
                            className="px-2 py-1 bg-emerald-700 text-white rounded text-[10px]"
                          >
                            📋 補登
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. InBody 數據管理 */}
        {activeTab === 'inbody' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">📐 InBody 前後測數據與名次計算</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">可依組別切換檢視減脂/增肌目標進度與預期名次加分</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportInbodyCSV}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded text-xs shadow flex items-center gap-1"
                >
                  📥 匯出 InBody 數據 CSV
                </button>
                <select
                  value={inbodyGroupFilter}
                  onChange={(e) => setInbodyGroupFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white"
                >
                  <option value="">全部組別</option>
                  <option value="fat">🔥 減脂組</option>
                  <option value="muscle">💪 增肌組</option>
                </select>
                <button
                  onClick={handleCalcRankPts}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded text-xs shadow"
                >
                  ⚡ 計算體態名次積分 (前三名 40/35/30分)
                </button>
              </div>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa]">
                    <th className="p-3">預期名次</th>
                    <th className="p-3">員工</th>
                    <th className="p-3">組別</th>
                    <th className="p-3">目標</th>
                    <th className="p-3">前測差距</th>
                    <th className="p-3">最新差距</th>
                    <th className="p-3">名次加分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {employees
                    .filter((e) => e.group && (!inbodyGroupFilter || e.group === inbodyGroupFilter))
                    .sort((a, b) => (a.currentGap || a.targetVal || 999) - (b.currentGap || b.targetVal || 999))
                    .map((e, idx) => (
                      <tr key={e.empId}>
                        <td className="p-3 font-bold">
                          {idx === 0 ? (
                            <span className="text-amber-400 font-bold">🥇 第 1 名 (+40分)</span>
                          ) : idx === 1 ? (
                            <span className="text-gray-300 font-bold">🥈 第 2 名 (+35分)</span>
                          ) : idx === 2 ? (
                            <span className="text-amber-600 font-bold">🥉 第 3 名 (+30分)</span>
                          ) : (
                            <span className="text-gray-500">#{idx + 1}</span>
                          )}
                        </td>
                        <td className="p-3 font-bold">
                          {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              e.group === 'fat' ? 'bg-orange-950 text-orange-400' : 'bg-blue-950 text-blue-400'
                            }`}
                          >
                            {e.group === 'fat' ? '減脂' : '增肌'}
                          </span>
                        </td>
                        <td className="p-3">{e.target || '未設定'}</td>
                        <td className="p-3">{e.targetVal || 0}</td>
                        <td className="p-3 text-[#ffd700] font-bold">{e.currentGap ?? '—'}</td>
                        <td className="p-3 text-emerald-400 font-bold">+{e.rankPts || 0} 分</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. 排行榜 Ranking */}
        {activeTab === 'ranking' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">🏆 全員即時積分排行榜</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">即時展現全體同仁總積分（任務分 + 名次加分）排名</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#8888aa]">組別篩選：</label>
                <select
                  value={rankGroupFilter}
                  onChange={(e) => setRankGroupFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white"
                >
                  <option value="">全部組別</option>
                  <option value="fat">🔥 減脂組</option>
                  <option value="muscle">💪 增肌組</option>
                </select>
              </div>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa]">
                    <th className="p-3">名次</th>
                    <th className="p-3">員工</th>
                    <th className="p-3">組別</th>
                    <th className="p-3">任務分</th>
                    <th className="p-3">名次分</th>
                    <th className="p-3">總積分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {[...employees]
                    .filter((e) => e.group && (!rankGroupFilter || e.group === rankGroupFilter))
                    .sort((a, b) => (b.totalPts || 0) - (a.totalPts || 0))
                    .map((e, idx) => (
                      <tr key={e.empId}>
                        <td className="p-3 font-bold text-[#ffd700]">
                          {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                        </td>
                        <td className="p-3 font-bold">
                          {e.nickname || e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              e.group === 'fat' ? 'bg-orange-950 text-orange-400' : 'bg-blue-950 text-blue-400'
                            }`}
                          >
                            {e.group === 'fat' ? '減脂' : '增肌'}
                          </span>
                        </td>
                        <td className="p-3">{e.taskPts || 0}</td>
                        <td className="p-3">{e.rankPts || 0}</td>
                        <td className="p-3 text-base font-bold text-[#ffd700]">{e.totalPts || 0} 分</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. 馬甲果凍發放 Jelly */}
        {activeTab === 'jelly' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">🧡 馬甲果凍發放管理</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">根據連續打卡天數追蹤應得果凍數，提供分包發放與一鍵領取全數</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={jellyFilter}
                  onChange={(e) => setJellyFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white"
                >
                  <option value="pending">待發放 (有剩餘未領)</option>
                  <option value="all">顯示全部名單</option>
                  <option value="completed">已全數發放完畢</option>
                </select>
              </div>
            </div>

            <div className="bg-[#1a2a1a] border border-[#2a4a2a] p-3.5 rounded-xl text-xs text-emerald-200 space-y-1">
              <div className="font-bold">💡 說明：若同仁可兌換 2 包以上（例如連鎖打卡達 20 天應得 2 包），發放如何進行？</div>
              <div className="text-[11px] text-[#a0e0a0]">
                後台提供兩種發放模式：① 點擊『發放 1 包 (+1)』每次發出一包；② 點擊『🚀 一鍵發放剩餘 N 包』將尚未領取的剩餘果凍一次全數標記完成。系統自動實時計算待領數與發放狀態。
              </div>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa]">
                    <th className="p-3">員工</th>
                    <th className="p-3">連續天數</th>
                    <th className="p-3">應得總數</th>
                    <th className="p-3">已發放數</th>
                    <th className="p-3">剩餘待發</th>
                    <th className="p-3">操作發放</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {employees
                    .filter((e) => {
                      const total = e.jellyCount || 0;
                      const delivered = e.jellyDelivered || 0;
                      const pending = total - delivered;
                      if (jellyFilter === 'pending') return total > 0 && pending > 0;
                      if (jellyFilter === 'completed') return total > 0 && pending === 0;
                      return total > 0;
                    })
                    .map((e) => {
                      const total = e.jellyCount || 0;
                      const delivered = e.jellyDelivered || 0;
                      const pending = Math.max(0, total - delivered);
                      return (
                        <tr key={e.empId}>
                          <td className="p-3 font-bold">
                            {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                          </td>
                          <td className="p-3">{e.consecutiveDays || 0} 天</td>
                          <td className="p-3 font-bold text-[#ffd700]">{total} 包</td>
                          <td className="p-3 text-emerald-400 font-bold">{delivered} 包</td>
                          <td className="p-3">
                            {pending > 0 ? (
                              <span className="text-amber-400 font-bold">剩餘 {pending} 包</span>
                            ) : (
                              <span className="text-gray-500">已結清</span>
                            )}
                          </td>
                          <td className="p-3 space-x-2">
                            {pending > 0 ? (
                              <>
                                <button
                                  onClick={() => handleDeliverJelly(e.empId, delivered + 1)}
                                  className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-bold"
                                >
                                  ✅ 發放 1 包 (+1)
                                </button>
                                {pending > 1 && (
                                  <button
                                    onClick={() => handleDeliverJelly(e.empId, total)}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-bold"
                                  >
                                    🚀 一鍵發放全部 ({pending}包)
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] text-gray-500">🎉 已發放完畢</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. 完賽禮名單 Completion */}
        {activeTab === 'completion' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-[#ffd700]">🎁 完賽禮選擇名單 (門檻 ≥ 45 分 + 照片心得)</h2>
              <button
                onClick={() => {
                  const rows = [['員工編號', '姓名', '組別', '積分', '選擇獎品', '是否發放']];
                  employees
                    .filter((e) => (e.totalPts || 0) >= 45 || e.completionReward)
                    .forEach((e) => {
                      rows.push([
                        e.empId,
                        e.name,
                        e.group,
                        String(e.totalPts || 0),
                        e.completionReward || '未選擇',
                        e.completionDelivered ? '已發放' : '未發放',
                      ]);
                    });
                  downloadCSV(rows, '完賽禮領取名單');
                }}
                className="px-3 py-1.5 bg-amber-600 text-white rounded text-xs font-bold"
              >
                📥 匯出 CSV 報表
              </button>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa]">
                    <th className="p-3">員工</th>
                    <th className="p-3">總積分</th>
                    <th className="p-3">選擇之完賽禮</th>
                    <th className="p-3">發放狀態</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {employees
                    .filter((e) => (e.totalPts || 0) >= 45 || e.completionReward)
                    .map((e) => (
                      <tr key={e.empId}>
                        <td className="p-3 font-bold">
                          {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                        </td>
                        <td className="p-3 font-bold text-[#ffd700]">{e.totalPts || 0} 分</td>
                        <td className="p-3">{e.completionReward || <span className="text-gray-500">未選</span>}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              e.completionDelivered ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                            }`}
                          >
                            {e.completionDelivered ? '已發放' : '待發放'}
                          </span>
                        </td>
                        <td className="p-3">
                          {e.completionReward && !e.completionDelivered && (
                            <button
                              onClick={() => handleDeliverCompletion(e.empId)}
                              className="px-2 py-1 bg-emerald-700 text-white rounded text-[10px]"
                            >
                              ✅ 標記已發放
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 8. 拼字獎勵 Spell */}
        {activeTab === 'spell' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">🎉 拼字挑戰 Bonus 獎勵名單</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">即時追蹤同仁收集字母進度、累積單字狀態與獎勵發放</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={spellFilter}
                  onChange={(e) => setSpellFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white"
                >
                  <option value="all">顯示全部同仁</option>
                  <option value="completed">集滿 11 個字母者</option>
                  <option value="pending_delivery">待發放獎勵者</option>
                  <option value="delivered">已完成發放者</option>
                </select>
              </div>
            </div>

            <div className="bg-[#1a1a3e] border border-[#2a2a6a] p-3.5 rounded-xl text-xs text-purple-200 space-y-1">
              <div className="font-bold">🔤 拼字字母獲得機制說明：</div>
              <div className="text-[11px] text-[#c0c0ff]">
                同仁每累積獲得 <span className="font-bold text-[#ffd700]">8 總積分</span>，系統將自動隨機抽取並解鎖一個未收集到的「SHINYBRANDS」字母（全套共 11 個字母：S-H-I-N-Y-B-R-A-N-D-S）。集滿 11 個字母即可解鎖選領拼字大獎！
              </div>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#2a2a4a] text-[#8888aa]">
                    <th className="p-3">員工</th>
                    <th className="p-3">收集字母進度</th>
                    <th className="p-3">已解鎖字母明細</th>
                    <th className="p-3">選擇之 Bonus 獎勵</th>
                    <th className="p-3">發放狀態</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {employees
                    .filter((e) => {
                      const count = (e.letters || []).length;
                      if (spellFilter === 'completed') return count >= 11;
                      if (spellFilter === 'pending_delivery') return e.spellReward && !e.spellDelivered;
                      if (spellFilter === 'delivered') return e.spellDelivered;
                      return count > 0 || e.spellReward;
                    })
                    .map((e) => {
                      const letters = e.letters || [];
                      const isFull = letters.length >= 11;
                      return (
                        <tr key={e.empId}>
                          <td className="p-3 font-bold">
                            {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                          </td>
                          <td className="p-3 font-bold">
                            <span className={isFull ? 'text-amber-400' : 'text-purple-300'}>
                              {letters.length} / 11 {isFull && '🎉 (已集滿)'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {letters.length > 0 ? (
                                letters.map((l, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 bg-[#2a2a5a] text-[#ffd700] rounded font-mono text-[10px] border border-[#4a4a8a]"
                                  >
                                    {l}
                                  </span>
                                ))
                              ) : (
                                <span className="text-gray-500">尚未收集</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">{e.spellReward || <span className="text-gray-500">未選擇</span>}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] ${
                                e.spellDelivered
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : e.spellReward
                                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                  : 'bg-gray-800 text-gray-400'
                              }`}
                            >
                              {e.spellDelivered ? '已發放' : e.spellReward ? '待發放' : '未選擇獎勵'}
                            </span>
                          </td>
                          <td className="p-3">
                            {e.spellReward && !e.spellDelivered ? (
                              <button
                                onClick={() => handleDeliverSpell(e.empId)}
                                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-bold"
                              >
                                ✅ 標記已發放
                              </button>
                            ) : e.spellDelivered ? (
                              <span className="text-[10px] text-gray-500">完成</span>
                            ) : (
                              <span className="text-[10px] text-gray-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 9. 隊伍管理 Teams */}
        {activeTab === 'teams' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[#ffd700]">👥 隊伍管理 ({teams.filter((t) => !t.disbanded).length} 隊)</h2>
            <div className="grid grid-cols-2 gap-4">
              {teams
                .filter((t) => !t.disbanded)
                .map((t) => (
                  <div key={t.id} className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl space-y-2">
                    <div className="flex justify-between items-center border-b border-[#2a2a4a] pb-2">
                      <div>
                        <div className="font-bold text-sm text-[#ffd700]">🏴 {t.teamName}</div>
                        <div className="text-[10px] text-gray-400">邀請碼：{t.inviteCode}</div>
                      </div>
                      <button
                        onClick={() => handleDisbandTeam(t.id, t.teamName)}
                        className="px-2 py-1 bg-red-900 text-red-200 rounded text-[10px]"
                      >
                        🗑️ 解散隊伍
                      </button>
                    </div>
                    <div className="text-xs text-[#8888aa]">隊員成員 ({t.members.length} 人):</div>
                    <div className="text-xs space-y-1">
                      {t.members.map((mId) => {
                        const mEmp = employees.find((e) => e.empId === mId);
                        return (
                          <div key={mId} className="flex justify-between items-center bg-[#0d0d1a] p-2 rounded">
                            <span>{mEmp ? `${mEmp.name} (${mId})` : mId}</span>
                            <span className="text-[#ffd700] font-bold">{mEmp?.totalPts || 0} 分</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 10. 精確積分稽核與修復 Audit & Recalculate */}
        {activeTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">🔍 精確積分稽核與一鍵修復引擎</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  精確比對「通過之打卡紀錄」與「員工個人總分」，發現差異即可一鍵全自動修復連動。
                </p>
              </div>
              <button
                onClick={runAudit}
                disabled={isAuditing}
                className="px-4 py-2 bg-[#4a3a9a] hover:bg-[#5a4aaa] text-white rounded-lg font-bold text-xs"
              >
                {isAuditing ? '稽核中...' : '🔍 執行全民稽核'}
              </button>
            </div>

            {auditResults && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1a2a1a] border border-[#2a3a2a] p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-emerald-400">{auditResults.correctCount}</div>
                    <div className="text-xs text-[#8888aa] mt-1">積分 100% 精確一致</div>
                  </div>
                  <div className="bg-[#2a1a1a] border border-[#3a2a2a] p-4 rounded-xl text-center">
                    <div className="text-2xl font-bold text-red-400">{auditResults.diffCount}</div>
                    <div className="text-xs text-[#8888aa] mt-1">發現差異</div>
                  </div>
                </div>

                {auditResults.diffCount > 0 && (
                  <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-[#ffd700]">⚠️ 差異明細清單</h3>
                      <button
                        onClick={handleFixAllDiffs}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs shadow"
                      >
                        ✅ 一鍵修正所有差異
                      </button>
                    </div>

                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-[#2a2a4a] text-[#8888aa]">
                          <th className="p-2">員工</th>
                          <th className="p-2">目前記載總分</th>
                          <th className="p-2">精確應得總分</th>
                          <th className="p-2">每週次數 (飲食/運動/健康)</th>
                          <th className="p-2">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2a4a]">
                        {auditResults.diffList.map(({ emp, calcStats }) => (
                          <tr key={emp.empId} className="hover:bg-[#2a2a4a]/30">
                            <td className="p-2 font-bold">
                              {emp.name} ({emp.empId})
                            </td>
                            <td className="p-2 text-red-400 font-bold">{emp.totalPts || 0} 分</td>
                            <td className="p-2 text-emerald-400 font-bold">{calcStats.totalPts} 分</td>
                            <td className="p-2 text-[#8888aa]">
                              {calcStats.weeklyDiet} / {calcStats.weeklySport} / {calcStats.weeklyHealth}
                            </td>
                            <td className="p-2">
                              <button
                                onClick={async () => {
                                  await recalcAndUpdateEmp(emp.empId);
                                  alert(`✅ 已修正 ${emp.name} 的分數！`);
                                  runAudit();
                                }}
                                className="px-2 py-1 bg-amber-600 text-white rounded text-[10px]"
                              >
                                🔧 單獨修正
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 11. 活動設定 Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[#ffd700]">⚙️ 活動系統設定</h2>
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-4 rounded-xl space-y-4 max-w-md">
              <div>
                <label className="block text-xs text-[#8888aa] mb-1">活動開始日期 (每週重置基準點)</label>
                <input
                  type="date"
                  value={startDateSetting}
                  onChange={(e) => setStartDateSetting(e.target.value)}
                  className="w-full bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                onClick={handleSaveSettings}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs"
              >
                💾 儲存系統設定
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 補登對話框 Modal */}
      {makeupEmp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-2xl p-5 w-full max-w-sm space-y-3">
            <h3 className="font-bold text-[#ffd700] text-sm">📋 補登打卡紀錄：{makeupEmp.name}</h3>
            <div>
              <label className="block text-xs text-[#8888aa] mb-1">選擇任務</label>
              <select
                value={makeupTask}
                onChange={(e) => setMakeupTask(e.target.value)}
                className="w-full bg-[#0d0d1a] border border-[#2a2a4a] rounded p-2 text-xs text-white"
              >
                <option value="飲食打卡">🥗 飲食打卡 (+1分)</option>
                <option value="健康飲食">🏅 健康飲食 (依週計)</option>
                <option value="運動打卡">🏋️ 運動打卡 (依週計)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#8888aa] mb-1">補登日期</label>
              <input
                type="date"
                value={makeupDate}
                onChange={(e) => setMakeupDate(e.target.value)}
                className="w-full bg-[#0d0d1a] border border-[#2a2a4a] rounded p-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-[#8888aa] mb-1">備註原因</label>
              <input
                type="text"
                placeholder="例：網路問題"
                value={makeupReason}
                onChange={(e) => setMakeupReason(e.target.value)}
                className="w-full bg-[#0d0d1a] border border-[#2a2a4a] rounded p-2 text-xs text-white"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setMakeupModalEmp(null)}
                className="w-1/2 py-2 bg-[#2a2a4a] text-white rounded text-xs"
              >
                取消
              </button>
              <button
                onClick={handleSaveMakeup}
                className="w-1/2 py-2 bg-emerald-600 text-white font-bold rounded text-xs"
              >
                確認補登
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 連續快速審核 Lightbox Modal */}
      {lightboxIndex !== null && filteredCheckins[lightboxIndex] && (
        (() => {
          const activeC = filteredCheckins[lightboxIndex];
          const isPending = activeC.status === '待審核';

          const handleLightboxReview = async (status: '通過' | '駁回') => {
            if (!activeC.id) return;
            await handleQuickReview(activeC.id, status, activeC.empId);

            // 尋找下一個「待審核」紀錄
            const nextPendingIndex = filteredCheckins.findIndex(
              (item, idx) => idx > lightboxIndex && item.status === '待審核'
            );

            if (nextPendingIndex !== -1) {
              setLightboxIndex(nextPendingIndex);
            } else if (lightboxIndex + 1 < filteredCheckins.length) {
              setLightboxIndex(lightboxIndex + 1);
            } else {
              setLightboxIndex(null);
            }
          };

          return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 z-50">
              <div className="bg-[#1a1a2e] border border-[#3a3a6a] w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
                {/* Modal Header */}
                <div className="bg-[#2a2a4a] px-5 py-3.5 flex justify-between items-center border-b border-[#3a3a6a] flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-sm">📸 快速圖片審核</span>
                    <span className="text-[10px] bg-purple-900/80 text-purple-200 border border-purple-700 px-2 py-0.5 rounded-full">
                      第 {lightboxIndex + 1} / {filteredCheckins.length} 筆
                    </span>
                    {checkinTaskFilter && (
                      <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full font-bold">
                        當前關卡：{checkinTaskFilter}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setLightboxIndex(null)}
                    className="w-8 h-8 rounded-full bg-[#1a1a2e] hover:bg-purple-900 text-gray-300 flex items-center justify-center font-bold transition-all text-sm"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-4 md:p-6 flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* 大圖預覽 */}
                  <div className="md:col-span-7 flex flex-col items-center justify-center bg-black/60 rounded-2xl p-2 border border-[#2a2a4a] min-h-[280px] max-h-[500px]">
                    {activeC.fileUrl ? (
                      <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-xl group">
                        <img
                          src={activeC.fileUrl}
                          alt="截圖"
                          className="max-h-[460px] w-auto object-contain rounded-xl"
                        />
                        <a
                          href={activeC.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-3 right-3 bg-black/70 hover:bg-black text-amber-300 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-500/50 shadow transition-all flex items-center gap-1"
                        >
                          🔗 開啟原圖
                        </a>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-center py-12">
                        <div className="text-4xl mb-2">🖼️</div>
                        此打卡無上傳截圖
                      </div>
                    )}
                  </div>

                  {/* 右側審核與詳細資訊 */}
                  <div className="md:col-span-5 space-y-4 flex flex-col justify-between h-full">
                    <div className="space-y-3 bg-[#22223a] p-4 rounded-2xl border border-[#333355]">
                      <div className="flex justify-between items-start border-b border-[#333355] pb-2.5">
                        <div>
                          <div className="text-lg font-bold text-white flex items-center gap-1.5">
                            {activeC.empName}
                            <span className="text-xs text-amber-300 font-normal">({activeC.empId})</span>
                          </div>
                          <div className="text-[11px] text-[#8888aa] mt-0.5">
                            時間：
                            {activeC.createdAt?.seconds
                              ? new Date(activeC.createdAt.seconds * 1000).toLocaleString('zh-TW')
                              : '未知'}
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            activeC.status === '通過' || activeC.status === '補登通過'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                              : activeC.status === '待審核'
                              ? 'bg-amber-950 text-amber-400 border border-amber-700 animate-pulse'
                              : 'bg-red-950 text-red-400 border border-red-700'
                          }`}
                        >
                          {activeC.status}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center bg-[#1a1a2e] p-2 rounded-xl">
                          <span className="text-[#8888aa]">打卡關卡</span>
                          <span className="font-bold text-amber-300 bg-purple-950/80 px-2 py-0.5 rounded border border-purple-800">
                            {activeC.taskType}
                          </span>
                        </div>
                        {activeC.isMakeup && (
                          <div className="flex justify-between items-center bg-amber-950/40 p-2 rounded-xl border border-amber-900/50 text-amber-300">
                            <span>補登原因</span>
                            <span className="font-bold">{activeC.makeupReason || '主辦人補登'}</span>
                          </div>
                        )}
                        {activeC.reviewedBy && (
                          <div className="flex justify-between items-center text-[10px] text-gray-400 px-1 pt-1">
                            <span>前次審核人：</span>
                            <span>{activeC.reviewedBy}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 審核核心按鈕區 */}
                    <div className="space-y-2 pt-2">
                      <div className="text-[11px] text-center text-purple-200 font-bold">
                        {isPending ? '⚡ 點擊下方審核（自動跳下一筆）' : '此筆紀錄已審核完畢'}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => handleLightboxReview('通過')}
                          className="py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <span>✅</span> 通過 (+1~2分)
                        </button>
                        <button
                          onClick={() => handleLightboxReview('駁回')}
                          className="py-3.5 bg-gradient-to-r from-red-700 to-rose-700 hover:from-red-600 hover:to-rose-600 text-white font-extrabold rounded-2xl shadow-lg transition-all text-sm flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <span>❌</span> 駁回
                        </button>
                      </div>
                    </div>

                    {/* 上下筆切換按鈕 */}
                    <div className="flex justify-between items-center border-t border-[#3a3a6a] pt-3 text-xs">
                      <button
                        disabled={lightboxIndex === 0}
                        onClick={() => setLightboxIndex(lightboxIndex - 1)}
                        className="px-3 py-1.5 bg-[#2a2a4a] hover:bg-[#3a3a5a] disabled:opacity-40 disabled:hover:bg-[#2a2a4a] text-white rounded-xl transition-all font-bold flex items-center gap-1"
                      >
                        ◀ 上一筆
                      </button>
                      <button
                        onClick={() => setLightboxIndex(null)}
                        className="text-gray-400 hover:text-white text-xs underline"
                      >
                        關閉預覽
                      </button>
                      <button
                        disabled={lightboxIndex >= filteredCheckins.length - 1}
                        onClick={() => setLightboxIndex(lightboxIndex + 1)}
                        className="px-3 py-1.5 bg-[#2a2a4a] hover:bg-[#3a3a5a] disabled:opacity-40 disabled:hover:bg-[#2a2a4a] text-white rounded-xl transition-all font-bold flex items-center gap-1"
                      >
                        下一筆 ▶
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}

