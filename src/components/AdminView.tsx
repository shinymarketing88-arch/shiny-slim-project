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
import { Employee, Checkin, Team, SystemSettings, GenderType, AgeGroupType } from '../types';
import {
  calculateEmployeeStats,
  SPORT_PTS_MAP,
  TARGET_WORD,
  attachCalculatedPointsToCheckins,
  calculateTournamentResults,
  getP22Target,
  getTierInbodyPoints,
} from '../lib/calcEngine';
import {
  generateFullSettlementCSV,
  generatePrizeReportCSV,
  generateOfficialAwardsCSV,
  downloadCSVFile
} from '../lib/reportsData';
import {
  convertOfficialRecordsToEmployees,
  OFFICIAL_TEAMS_DATA
} from '../lib/officialSettlementData';

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
  const [completionItemFilter, setCompletionItemFilter] = useState('');
  const [completionDeliveryFilter, setCompletionDeliveryFilter] = useState('all');
  const [spellFilter, setSpellFilter] = useState('all');
  const [spellItemFilter, setSpellItemFilter] = useState('');
  const [spellDeliveryFilter, setSpellDeliveryFilter] = useState('all');

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

  // 隊伍管理與自訂分隊 State
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isEditTeamOpen, setIsEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamFormName, setTeamFormName] = useState('');
  const [teamFormGroup, setTeamFormGroup] = useState<'fat' | 'muscle'>('fat');
  const [teamFormLeaderId, setTeamFormLeaderId] = useState('');
  const [teamFormMembers, setTeamFormMembers] = useState<string[]>([]);
  const [teamTabGroupFilter, setTeamTabGroupFilter] = useState<'all' | 'fat' | 'muscle'>('all');
  const [showTeamAdjustPanelInRankings, setShowTeamAdjustPanelInRankings] = useState(true);

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
      const rawEmployees = eSnap.docs.map((d) => ({ empId: d.id, ...d.data() } as Employee));

      const cSnap = await getDocs(collection(db, 'summer2026_checkins'));
      const rawCheckins = cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Checkin));
      setCheckins(rawCheckins);

      const tSnap = await getDocs(collection(db, 'summer2026_teams'));
      setTeams(tSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Team)));

      const sSnap = await getDoc(doc(db, 'summer2026_settings', 'main'));
      let startDateStr = '2026-07-13';
      if (sSnap.exists()) {
        const sData = sSnap.data() as SystemSettings;
        setSettings(sData);
        if (sData.startDate) {
          startDateStr = sData.startDate;
          setStartDateSetting(sData.startDate);
        }
      }

      // 💥 精確即時重算全體參賽者分數並進行 Firestore 資料同步
      const updatedEmployees = rawEmployees.map((emp) => {
        const myApproved = rawCheckins.filter(
          (c) => c.empId === emp.empId && (c.status === '通過' || c.status === '補登通過')
        );
        const calc = calculateEmployeeStats(emp, myApproved, startDateStr);

        if (
          emp.totalPts !== calc.totalPts ||
          emp.taskPts !== calc.taskPts ||
          emp.weeklySport !== calc.weeklySport ||
          emp.weeklyHealth !== calc.weeklyHealth
        ) {
          updateDoc(doc(db, 'summer2026_employees', emp.empId), {
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
          }).catch((err) => console.error('Auto sync err:', err));
        }

        return {
          ...emp,
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
      });

      setEmployees(updatedEmployees);
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

  // 切換完賽禮發放狀態 (已發放 / 待發放)
  const handleToggleDeliverCompletion = async (empId: string, currentDelivered?: boolean) => {
    const nextDelivered = !currentDelivered;
    try {
      await updateDoc(doc(db, 'summer2026_employees', empId), {
        completionDelivered: nextDelivered,
        completionDeliveredAt: nextDelivered ? new Date() : null,
      });
      alert(`✅ 已將完賽禮發放狀態更新為：${nextDelivered ? '已發放' : '待發放'}`);
      fetchData();
    } catch (e: any) {
      alert('更新失敗：' + e.message);
    }
  };

  // 切換拼字獎勵發放狀態 (已發放 / 待發放)
  const handleToggleDeliverSpell = async (empId: string, currentDelivered?: boolean) => {
    const nextDelivered = !currentDelivered;
    try {
      await updateDoc(doc(db, 'summer2026_employees', empId), {
        spellDelivered: nextDelivered,
        spellDeliveredAt: nextDelivered ? new Date() : null,
      });
      alert(`✅ 已將拼字 Bonus 禮發放狀態更新為：${nextDelivered ? '已發放' : '待發放'}`);
      fetchData();
    } catch (e: any) {
      alert('更新失敗：' + e.message);
    }
  };

  const [isCalculatingTournament, setIsCalculatingTournament] = useState(false);

  // 一鍵套用並同步 8/27 官方原始核定數據庫至系統
  const [isApplyingOfficial, setIsApplyingOfficial] = useState(false);
  const handleApplyOfficialSettlementToFirestore = async () => {
    if (
      !confirm(
        '確定要一鍵將【8/27 官方大會校定數據庫】完整同步寫入後台資料庫嗎？\n\n' +
        '包含：\n' +
        '1. 全員 58 位同仁之任務打卡分、體態成果分（名次分/級距分）、總積分\n' +
        '2. P22 達標狀態與 23 位達標獎（每人 $2,000）\n' +
        '3. 個人競賽獎（減脂組冠亞季軍：鄭凱中 $10,000、李芮綺 $6,000、范紋綾 $3,000；增肌組冠亞季軍：張健威 $10,000、黃寶螢 $6,000、鍾利羚 $3,000）\n' +
        '4. 團體競賽獎（減脂組冠軍第1組、亞軍第7組；增肌組冠軍第2組、亞軍第1組）'
      )
    ) {
      return;
    }

    setIsApplyingOfficial(true);
    try {
      const officialEmps = convertOfficialRecordsToEmployees();
      let updatedEmpsCount = 0;

      for (const emp of officialEmps) {
        await updateDoc(doc(db, 'summer2026_employees', emp.empId), {
          group: emp.group,
          gender: emp.gender,
          ageGroup: emp.ageGroup,
          taskPts: emp.taskPts,
          inbodyPts: emp.inbodyPts,
          rankPts: emp.rankPts,
          totalPts: emp.totalPts,
          bodyResult: emp.bodyResult,
          p22Target: emp.p22Target,
          isGoalMet: emp.isGoalMet,
          isMinPtsMet: emp.isMinPtsMet,
          achievementAward: emp.achievementAward,
          individualAward: emp.individualAward || null,
          individualAwardPrize: emp.individualAwardPrize || null,
          letters: emp.letters || [],
        });
        updatedEmpsCount++;
      }

      // 同步隊伍
      for (const t of OFFICIAL_TEAMS_DATA) {
        await setDoc(doc(db, 'summer2026_teams', t.id), {
          teamName: t.teamName,
          group: t.group,
          leaderId: t.leaderId,
          members: t.members,
          inviteCode: t.inviteCode,
          disbanded: false,
          updatedAt: new Date(),
        }, { merge: true });
      }

      await fetchData();
      alert(`🎉 成功同步！已將 8/27 官方核定結算數據完整寫入後台 Firestore（共更新 ${updatedEmpsCount} 位同仁與 ${OFFICIAL_TEAMS_DATA.length} 支隊伍）！`);
    } catch (e: any) {
      alert('同步官方數據失敗：' + e.message);
    } finally {
      setIsApplyingOfficial(false);
    }
  };

  // 8/27 自動結算與名次計算
  const handleRunTournamentCalculation = async () => {
    if (
      !confirm(
        '確定要執行【8/27 賽事自動結算與名次計算】嗎？\n\n系統將根據挑戰賽規則自動完成：\n1. 體態成果分結算 (前三名名次分 40/35/30分；非前三名依增肌/減脂成果級距加 20/15/10/0分)\n2. 個人總積分結算 (任務分 + 體態分)\n3. 個人競賽獎判定 (各組總積分最高者，同分比序最終體態成果，檢核P22達標與滿45分)\n4. 個人達標獎判定 ($2,000，符合P22年齡性別標準且總分滿45分)\n5. 團體競賽獎判定 (2-5人組隊，平均總分最高前2組，同分比序平均體態成果)'
      )
    )
      return;

    setIsCalculatingTournament(true);
    try {
      const settSnap = await getDoc(doc(db, 'summer2026_settings', 'main'));
      const sett = settSnap.exists() ? settSnap.data() : {};

      const result = calculateTournamentResults(employees, teams, sett);

      // 批次寫入 Firestore 每一位同仁的結算成果
      for (const emp of result.updatedEmployees) {
        if (!emp.empId) continue;
        await updateDoc(doc(db, 'summer2026_employees', emp.empId), {
          gender: emp.gender || 'female',
          ageGroup: emp.ageGroup || 'under40',
          bodyResult: emp.bodyResult ?? 0,
          bodyRank: emp.bodyRank ?? null,
          p22Target: emp.p22Target ?? null,
          isGoalMet: emp.isGoalMet ?? false,
          isMinPtsMet: emp.isMinPtsMet ?? false,
          rankPts: emp.rankPts ?? 0,
          inbodyPts: emp.inbodyPts ?? 0,
          totalPts: emp.totalPts ?? 0,
          achievementAward: emp.achievementAward ?? false,
          individualAward: emp.individualAward || null,
          individualAwardRank: emp.individualAwardRank || null,
          individualAwardPrize: emp.individualAwardPrize || null,
        });
      }

      alert(
        `🎉 8/27 挑戰賽名次自動結算完成！\n\n` +
          `📊 結算重點摘要：\n` +
          `• 參賽結算人數：${result.stats.totalParticipants} 位 (減脂組 ${result.stats.fatCount} 人、增肌組 ${result.stats.muscleCount} 人)\n` +
          `• 個人達標獎 ($2,000)：共 ${result.stats.achievementCount} 位同仁達標獲獎\n` +
          `• 個人競賽獎：\n` +
          `  - 減脂組：${result.individualFatWinners.map((w) => `${w.name} (${w.individualAward})`).join('、') || '無'}\n` +
          `  - 增肌組：${result.individualMuscleWinners.map((w) => `${w.name} (${w.individualAward})`).join('、') || '無'}\n` +
          `• 團體競賽獎：\n` +
          `  - 減脂組：${result.fatTeamWinners.map((t) => `${t.teamName} (${t.awardName})`).join('、') || '無'}\n` +
          `  - 增肌組：${result.muscleTeamWinners.map((t) => `${t.teamName} (${t.awardName})`).join('、') || '無'}\n` +
          `• 預計頒發總獎金：$${result.stats.totalPrizePool.toLocaleString()}`
      );

      fetchData();
    } catch (e: any) {
      alert('結算過程發生錯誤：' + e.message);
    } finally {
      setIsCalculatingTournament(false);
    }
  };

  // 單筆儲存同仁體態後測資訊
  const handleSaveSingleEmpInbody = async (
    empId: string,
    gender: GenderType,
    ageGroup: AgeGroupType,
    bodyResult: number,
    targetVal?: number,
    currentGap?: number
  ) => {
    try {
      await updateDoc(doc(db, 'summer2026_employees', empId), {
        gender,
        ageGroup,
        bodyResult,
        ...(targetVal !== undefined ? { targetVal } : {}),
        ...(currentGap !== undefined ? { currentGap } : {}),
      });

      // 更新本地 state
      setEmployees((prev) =>
        prev.map((e) =>
          e.empId === empId
            ? {
                ...e,
                gender,
                ageGroup,
                bodyResult,
                targetVal: targetVal !== undefined ? targetVal : e.targetVal,
                currentGap: currentGap !== undefined ? currentGap : e.currentGap,
              }
            : e
        )
      );
      alert('✅ 已儲存同仁體態後測數據！可點擊上方按鈕執行名次與獎項自動結算。');
    } catch (e: any) {
      alert('儲存失敗：' + e.message);
    }
  };

  // 匯出 8/27 賽事結算總報表 CSV
  const exportTournamentCSV = () => {
    const calc = calculateTournamentResults(employees, teams, settings);
    const rows = [
      [
        '名次/獲獎狀態',
        '員工編號',
        '姓名',
        '暱稱',
        '組別',
        '性別',
        '年齡層',
        'P22達標標準',
        '體態成果(kg/%)',
        '體態是否達標',
        '任務打卡積分',
        '體態名次加分',
        '體態級距加分',
        '個人總積分',
        '總分滿45分',
        '個人達標獎($2,000)',
        '個人競賽獎',
        '個人競賽獎金',
      ],
      ...[...calc.fatRankings, ...calc.muscleRankings].map((e, idx) => {
        const genderLabel = e.gender === 'male' ? '男' : '女';
        const ageLabel =
          e.ageGroup === 'age50plus' ? '50歲以上' : e.ageGroup === 'age40to49' ? '40歲以上' : '40歲以下';
        const groupLabel = e.group === 'fat' ? '減脂組' : '增肌組';
        const unit = e.group === 'fat' ? '%' : 'kg';
        const targetDesc = e.p22Target !== undefined ? `${e.p22Target} ${unit}` : '';
        const bodyDesc = e.bodyResult !== undefined ? `${e.bodyResult} ${unit}` : '';

        return [
          e.individualAward || (e.achievementAward ? '個人達標獎' : `#${idx + 1}`),
          e.empId,
          e.name,
          e.nickname || '',
          groupLabel,
          genderLabel,
          ageLabel,
          targetDesc,
          bodyDesc,
          e.isGoalMet ? '是 (達標)' : '否 (未達標)',
          String(e.taskPts || 0),
          String(e.rankPts || 0),
          String(e.inbodyPts || 0),
          String(e.totalPts || 0),
          e.isMinPtsMet ? '是' : '否',
          e.achievementAward ? '$2,000' : '$0',
          e.individualAward || '無',
          e.individualAwardPrize ? `$${e.individualAwardPrize}` : '$0',
        ];
      }),
    ];
    downloadCSV(rows, '8月27日_夏日挑戰賽_賽事結算總報表');
  };

  // 輔助函式：取得同仁目前所屬隊伍
  const getEmpTeam = (empId: string): Team | undefined => {
    return teams.find((t) => !t.disbanded && (t.members || []).includes(empId));
  };

  // 輔助函式：取得未在任何有效隊伍中的同仁清單
  const getUnassignedEmployees = (groupFilter?: 'fat' | 'muscle') => {
    const assignedSet = new Set<string>();
    teams.filter((t) => !t.disbanded).forEach((t) => {
      (t.members || []).forEach((id) => assignedSet.add(id));
    });
    return employees.filter((e) => {
      if (assignedSet.has(e.empId)) return false;
      if (groupFilter && e.group !== groupFilter) return false;
      return true;
    });
  };

  // 開啟建立隊伍 Modal
  const handleOpenCreateTeam = (group?: 'fat' | 'muscle', defaultMemberId?: string) => {
    const targetGroup = group || 'fat';
    const groupLabel = targetGroup === 'fat' ? '減脂' : '增肌';
    const count = teams.filter((t) => !t.disbanded && ((t.group || employees.find((e) => e.empId === t.members[0])?.group) === targetGroup)).length;
    setTeamFormName(`${groupLabel}活力隊${count + 1}`);
    setTeamFormGroup(targetGroup);
    setTeamFormLeaderId(defaultMemberId || '');
    setTeamFormMembers(defaultMemberId ? [defaultMemberId] : []);
    setIsCreateTeamOpen(true);
  };

  // 儲存建立隊伍
  const handleCreateTeamSubmit = async () => {
    if (!teamFormName.trim()) {
      alert('請輸入隊伍名稱');
      return;
    }
    if (teamFormMembers.length === 0) {
      alert('請至少勾選一位隊員');
      return;
    }
    try {
      const leader = teamFormLeaderId || teamFormMembers[0];
      const inviteCode = `TEAM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // 1. 建立新隊伍
      const docRef = await addDoc(collection(db, 'summer2026_teams'), {
        teamName: teamFormName.trim(),
        group: teamFormGroup,
        leaderId: leader,
        members: teamFormMembers,
        inviteCode,
        disbanded: false,
        createdAt: new Date(),
      });

      // 2. 從其他隊伍中移除這些被選中的成員
      for (const t of teams.filter((t) => !t.disbanded && t.id !== docRef.id)) {
        const conflictMembers = t.members.filter((id) => teamFormMembers.includes(id));
        if (conflictMembers.length > 0) {
          const newMembers = t.members.filter((id) => !teamFormMembers.includes(id));
          const newLeader = teamFormMembers.includes(t.leaderId) ? (newMembers[0] || '') : t.leaderId;
          await updateDoc(doc(db, 'summer2026_teams', t.id), {
            members: newMembers,
            leaderId: newLeader,
          });
        }
      }

      await fetchData();
      setIsCreateTeamOpen(false);
      alert(`✅ 成功建立隊伍「${teamFormName.trim()}」！`);
    } catch (e: any) {
      alert('建立隊伍失敗：' + e.message);
    }
  };

  // 開啟編輯隊伍 Modal
  const handleOpenEditTeam = (team: Team) => {
    const inferredGroup = team.group || (employees.find((e) => e.empId === team.members[0])?.group as any) || 'fat';
    setEditingTeam(team);
    setTeamFormName(team.teamName);
    setTeamFormGroup(inferredGroup);
    setTeamFormLeaderId(team.leaderId || team.members[0] || '');
    setTeamFormMembers([...team.members]);
    setIsEditTeamOpen(true);
  };

  // 儲存編輯隊伍
  const handleSaveEditTeamSubmit = async () => {
    if (!editingTeam) return;
    if (!teamFormName.trim()) {
      alert('請輸入隊伍名稱');
      return;
    }
    try {
      const leader = teamFormLeaderId || teamFormMembers[0] || '';
      await updateDoc(doc(db, 'summer2026_teams', editingTeam.id), {
        teamName: teamFormName.trim(),
        group: teamFormGroup,
        leaderId: leader,
        members: teamFormMembers,
      });

      // 從其他隊伍移除被加入到這隊的成員
      for (const t of teams.filter((t) => !t.disbanded && t.id !== editingTeam.id)) {
        const conflictMembers = t.members.filter((id) => teamFormMembers.includes(id));
        if (conflictMembers.length > 0) {
          const newMembers = t.members.filter((id) => !teamFormMembers.includes(id));
          const newLeader = teamFormMembers.includes(t.leaderId) ? (newMembers[0] || '') : t.leaderId;
          await updateDoc(doc(db, 'summer2026_teams', t.id), {
            members: newMembers,
            leaderId: newLeader,
          });
        }
      }

      await fetchData();
      setIsEditTeamOpen(false);
      setEditingTeam(null);
      alert(`✅ 隊伍「${teamFormName.trim()}」資料與成員已更新！`);
    } catch (e: any) {
      alert('更新隊伍失敗：' + e.message);
    }
  };

  // 快速指派同仁至隊伍
  const handleQuickAssignEmp = async (empId: string, targetTeamId: string) => {
    try {
      if (targetTeamId === 'NEW') {
        const emp = employees.find((e) => e.empId === empId);
        handleOpenCreateTeam(emp?.group === 'muscle' ? 'muscle' : 'fat', empId);
        return;
      }

      if (targetTeamId === 'NONE') {
        // 從所有隊伍中移除
        for (const t of teams.filter((t) => !t.disbanded && t.members.includes(empId))) {
          const newMembers = t.members.filter((id) => id !== empId);
          const newLeader = t.leaderId === empId ? (newMembers[0] || '') : t.leaderId;
          await updateDoc(doc(db, 'summer2026_teams', t.id), {
            members: newMembers,
            leaderId: newLeader,
          });
        }
        await fetchData();
        alert('✅ 已將該同仁移出隊伍（設為無組隊）！');
        return;
      }

      // 指派至 targetTeamId
      const targetTeam = teams.find((t) => t.id === targetTeamId);
      if (!targetTeam) return;

      // 1. 先從原有的其他隊伍移除
      for (const t of teams.filter((t) => !t.disbanded && t.id !== targetTeamId && t.members.includes(empId))) {
        const newMembers = t.members.filter((id) => id !== empId);
        const newLeader = t.leaderId === empId ? (newMembers[0] || '') : t.leaderId;
        await updateDoc(doc(db, 'summer2026_teams', t.id), {
          members: newMembers,
          leaderId: newLeader,
        });
      }

      // 2. 加入目標隊伍
      const updatedMembers = Array.from(new Set([...targetTeam.members, empId]));
      await updateDoc(doc(db, 'summer2026_teams', targetTeamId), {
        members: updatedMembers,
      });

      await fetchData();
      alert(`✅ 已成功將同仁指派至「${targetTeam.teamName}」！`);
    } catch (err: any) {
      alert('指派失敗：' + err.message);
    }
  };

  // 智慧一鍵為未組隊同仁自動分組建立隊伍
  const handleAutoGroupUnassigned = async (group: 'fat' | 'muscle', targetTeamSize: number = 3) => {
    const unassigned = getUnassignedEmployees(group);
    if (unassigned.length === 0) {
      alert(`【${group === 'fat' ? '減脂組' : '增肌組'}】目前所有同仁皆已組隊，無未組隊同仁！`);
      return;
    }
    const groupLabel = group === 'fat' ? '減脂組' : '增肌組';
    if (
      !confirm(
        `即將為 ${unassigned.length} 位未組隊的【${groupLabel}】同仁自動建立隊伍（每組約 ${targetTeamSize} 人），是否確定？`
      )
    ) {
      return;
    }

    try {
      const existingCount = teams.filter(
        (t) =>
          !t.disbanded &&
          ((t.group || employees.find((e) => e.empId === t.members[0])?.group) === group)
      ).length;
      let teamIndex = existingCount + 1;

      for (let i = 0; i < unassigned.length; i += targetTeamSize) {
        const chunk = unassigned.slice(i, i + targetTeamSize);
        const memberIds = chunk.map((e) => e.empId);
        const teamName = `${groupLabel}活力隊${teamIndex}`;
        const inviteCode = `TEAM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        await addDoc(collection(db, 'summer2026_teams'), {
          teamName,
          group,
          leaderId: memberIds[0],
          members: memberIds,
          inviteCode,
          disbanded: false,
          createdAt: new Date(),
        });
        teamIndex++;
      }

      await fetchData();
      alert(`🎉 已成功為 ${unassigned.length} 位同仁自動建立 ${Math.ceil(unassigned.length / targetTeamSize)} 支隊伍！賽事排行榜已即時更新。`);
    } catch (e: any) {
      alert('自動組隊失敗：' + e.message);
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
    const calculated = attachCalculatedPointsToCheckins(filteredCheckins, settings.startDate || '2026-07-13');
    const rows = [
      ['打卡紀錄ID', '員工編號', '姓名', '任務類型', '審核狀態', '獲得分數', '打卡時間', '審核/補登人員', '是否補登', '補登原因'],
      ...calculated.map((c) => [
        c.id || '',
        c.empId,
        c.empName,
        c.taskType,
        c.status,
        String(c.earnedPts || 0),
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

  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // 全體一鍵重算與同步總分
  const handleSyncAllEmployeeScores = async () => {
    if (!confirm('確定要根據最新的打卡規則，一鍵重新計算全體同仁的分數與總積分嗎？')) return;
    setIsSyncingAll(true);
    try {
      const eSnap = await getDocs(collection(db, 'summer2026_employees'));
      const cSnap = await getDocs(collection(db, 'summer2026_checkins'));
      const allCheckins = cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Checkin));

      let updatedCount = 0;
      for (const empDoc of eSnap.docs) {
        await recalcAndUpdateEmp(empDoc.id, allCheckins);
        updatedCount++;
      }
      alert(`✅ 已完成！成功重新計算並連動更新全體 ${updatedCount} 位同仁的最新總積分！`);
      fetchData();
    } catch (err: any) {
      alert('同步失敗：' + (err.message || '未知錯誤'));
    } finally {
      setIsSyncingAll(false);
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
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h2 className="text-lg font-bold text-[#ffd700]">📊 活動總覽</h2>
              <button
                onClick={handleSyncAllEmployeeScores}
                disabled={isSyncingAll}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-md transition-all flex items-center gap-2 border border-purple-400/40"
              >
                {isSyncingAll ? '🔄 重新計算同步中...' : '⚡ 一鍵重算並同步全體同仁總分'}
              </button>
            </div>

            {/* 8/27 賽事結算總報表下載專區 (後台專用) */}
            <div className="bg-gradient-to-r from-indigo-950/80 via-purple-950/80 to-[#1a1a2e] border border-purple-500/40 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📥</span>
                    <h3 className="font-extrabold text-amber-300 text-base">
                      8/27 挑戰賽結算報表 下載專區 (Excel / CSV)
                    </h3>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] px-2 py-0.5 rounded-full font-bold">
                      UTF-8 繁體中文無亂碼
                    </span>
                  </div>
                  <p className="text-xs text-gray-300 mt-1 max-w-2xl">
                    包含全體 61 位同仁積分結算明細、前後測數據、P22達標判定，以及個人競賽冠亞季軍、團體冠亞軍與達標獎名冊。
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={() => {
                      const csv = generateFullSettlementCSV(employees, teams, settings);
                      downloadCSVFile(csv, '夏日挑戰賽_8月27日全員結算總報表.csv');
                    }}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-xl text-xs shadow-lg flex items-center gap-2 border border-emerald-400/30 transition-all cursor-pointer"
                  >
                    <span>📊</span>
                    <span>下載 8/27 全員結算總表 (CSV)</span>
                  </button>

                  <button
                    onClick={() => {
                      const csv = generatePrizeReportCSV(employees, teams, settings);
                      downloadCSVFile(csv, '夏日挑戰賽_得獎名冊與獎金總表.csv');
                    }}
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold rounded-xl text-xs shadow-lg flex items-center gap-2 border border-amber-400/30 transition-all cursor-pointer"
                  >
                    <span>🏆</span>
                    <span>下載 得獎名冊與獎金總表 (CSV)</span>
                  </button>
                </div>
              </div>
            </div>

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
                    <th className="p-3">得分/爆擊</th>
                    <th className="p-3">狀態</th>
                    <th className="p-3 text-right">即時審核操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {filteredCheckins.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[#8888aa]">
                        <div className="text-2xl mb-1">🔍</div>
                        尚無符合條件的打卡紀錄
                      </td>
                    </tr>
                  ) : (
                    (() => {
                      const calculatedList = attachCalculatedPointsToCheckins(filteredCheckins, settings.startDate || '2026-07-13');
                      return calculatedList.map((c, index) => (
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
                          <td className="p-3 font-bold">
                            {c.status === '通過' || c.status === '補登通過' ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  c.isCrit
                                    ? 'bg-amber-950/90 text-amber-300 border border-amber-600 animate-pulse font-extrabold'
                                    : c.earnedPts === 0
                                    ? 'bg-gray-900 text-gray-400'
                                    : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                                }`}
                              >
                                +{c.earnedPts} 分 {c.isCrit && '💥 爆擊!'}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-[11px]">—</span>
                            )}
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
                    ));
                  })()
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
                    <th className="p-3">所屬隊伍</th>
                    <th className="p-3">總積分</th>
                    <th className="p-3">連續天數</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2a4a]">
                  {employees
                    .filter((e) => !memberGroupFilter || e.group === memberGroupFilter)
                    .map((e) => {
                      const empTeam = getEmpTeam(e.empId);
                      const availableTeams = teams.filter(
                        (t) =>
                          !t.disbanded &&
                          ((t.group || employees.find((m) => m.empId === t.members[0])?.group) === e.group)
                      );

                      return (
                        <tr key={e.empId} className="hover:bg-[#20203a]/50">
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
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={empTeam?.id || 'NONE'}
                                onChange={(e) => handleQuickAssignEmp(e.target.value === 'NONE' ? e.empId : e.empId, e.target.value)}
                                className={`text-[11px] px-2 py-1 rounded border outline-none cursor-pointer transition-colors ${
                                  empTeam
                                    ? 'bg-purple-950/60 border-purple-800 text-purple-200 font-bold'
                                    : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                                }`}
                              >
                                <option value="NONE">⚠️ 無組隊 (未分隊)</option>
                                <optgroup label="現有隊伍">
                                  {availableTeams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      🏴 {t.teamName} ({t.members.length}人)
                                    </option>
                                  ))}
                                </optgroup>
                                <option value="NEW">➕ 建立新隊伍...</option>
                              </select>
                              {empTeam && empTeam.leaderId === e.empId && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded border border-amber-500/30">
                                  👑 隊長
                                </span>
                              )}
                            </div>
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
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. InBody 數據管理與 8/27 結算 */}
        {activeTab === 'inbody' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">📐 InBody 前後測數據與 8/27 賽事結算</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  登錄同仁性別、年齡層與體態成果（增肌 kg / 減脂 %），一鍵執行名次與各項競賽獎自動結算
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={inbodyGroupFilter}
                  onChange={(e) => setInbodyGroupFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="">全部組別</option>
                  <option value="fat">🔥 減脂組</option>
                  <option value="muscle">💪 增肌組</option>
                </select>
                <button
                  onClick={exportTournamentCSV}
                  className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1"
                >
                  📥 匯出 8/27 結算總報表 (CSV)
                </button>
                <button
                  onClick={exportInbodyCSV}
                  className="px-3 py-2 bg-[#2a2a4a] hover:bg-[#3a3a5a] text-white font-bold rounded-lg text-xs shadow flex items-center gap-1"
                >
                  📥 匯出原始數據
                </button>
                <button
                  onClick={handleApplyOfficialSettlementToFirestore}
                  disabled={isApplyingOfficial}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold rounded-lg text-xs shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  title="一鍵將 8/27 官方大會校定之 58 位同仁總成績與隊伍名單完整寫入 Firestore 資料庫"
                >
                  {isApplyingOfficial ? '🔄 同步中...' : '💾 一鍵同步 8/27 官方核定數據至後台'}
                </button>
                <button
                  onClick={handleRunTournamentCalculation}
                  disabled={isCalculatingTournament}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-extrabold rounded-lg text-xs shadow-lg flex items-center gap-1.5 transition-all"
                >
                  {isCalculatingTournament ? '⚡ 結算計算中...' : '⚡ 執行 8/27 賽事自動結算與名次計算'}
                </button>
              </div>
            </div>

            {/* 規則說明卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-[#1a1a2e] border border-purple-500/30 rounded-xl p-3 text-xs space-y-1">
                <div className="font-bold text-purple-300">🏆 體態成果名次加分</div>
                <div className="text-[#a0a0c0] text-[11px] leading-relaxed">
                  🥇 第 1 名：<b className="text-[#ffd700]">+40 分</b><br />
                  🥈 第 2 名：<b className="text-gray-300">+35 分</b><br />
                  🥉 第 3 名：<b className="text-amber-600">+30 分</b><br />
                  <span className="text-[10px] text-amber-400/80">※ 增肌組若未達 15 人則僅取前 2 名加分</span>
                </div>
              </div>

              <div className="bg-[#1a1a2e] border border-blue-500/30 rounded-xl p-3 text-xs space-y-1">
                <div className="font-bold text-blue-300">📊 非前三名體態成果 (級距計分)</div>
                <div className="text-[#a0a0c0] text-[11px] leading-relaxed">
                  💪 <b>增肌組 (kg)</b>：≥1.0kg (+20分)｜≥0.6kg (+15分)｜≥0.2kg (+10分)<br />
                  🔥 <b>減脂組 (%)</b>：≥3.5% (+20分)｜≥2.5% (+15分)｜≥1.5% (+10分)<br />
                  未達最低級距門檻者為 +0 分
                </div>
              </div>

              <div className="bg-[#1a1a2e] border border-emerald-500/30 rounded-xl p-3 text-xs space-y-1">
                <div className="font-bold text-emerald-300">🎯 P22 活動個人達標標準 ($2,000)</div>
                <div className="text-[#a0a0c0] text-[11px] leading-relaxed">
                  • <b>40歲以下</b>：女 0.8kg / 3.0%｜男 1.0kg / 3.3%<br />
                  • <b>40歲以上</b>：女 0.6kg / 2.7%｜男 0.8kg / 3.0%<br />
                  • <b>50歲以上</b>：女 0.4kg / 2.4%｜男 0.6kg / 2.7%<br />
                  <span className="text-[10px] text-emerald-400/80">※ 需達標且個人總積分滿 45 分</span>
                </div>
              </div>
            </div>

            {/* InBody 成果登記表格 */}
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden shadow">
              <div className="p-3 bg-[#24243e] border-b border-[#2a2a4a] flex justify-between items-center">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>📋 參賽同仁前後測體態數據登記表</span>
                  <span className="text-[10px] text-[#8888aa]">
                    (共 {employees.filter((e) => e.group && (!inbodyGroupFilter || e.group === inbodyGroupFilter)).length} 人)
                  </span>
                </div>
                <div className="text-[11px] text-[#ffd700]">
                  💡 調整後請點擊各行「💾 儲存」，完成後點上方「⚡ 執行 8/27 結算」即可
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#2a2a4a] text-[#8888aa]">
                      <th className="p-3 whitespace-nowrap">員工</th>
                      <th className="p-3 whitespace-nowrap">組別</th>
                      <th className="p-3 whitespace-nowrap">性別</th>
                      <th className="p-3 whitespace-nowrap">年齡層 (以8/26認定)</th>
                      <th className="p-3 whitespace-nowrap">P22達標標準</th>
                      <th className="p-3 whitespace-nowrap">體態成果 (增肌kg / 減脂%)</th>
                      <th className="p-3 whitespace-nowrap">體態達標</th>
                      <th className="p-3 whitespace-nowrap">體態加分</th>
                      <th className="p-3 whitespace-nowrap">目前總積分</th>
                      <th className="p-3 whitespace-nowrap text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a4a]">
                    {employees
                      .filter((e) => e.group && (!inbodyGroupFilter || e.group === inbodyGroupFilter))
                      .sort((a, b) => {
                        const resA = a.bodyResult ?? (a.targetVal > 0 && a.currentGap !== undefined ? a.targetVal - a.currentGap : 0);
                        const resB = b.bodyResult ?? (b.targetVal > 0 && b.currentGap !== undefined ? b.targetVal - b.currentGap : 0);
                        return resB - resA;
                      })
                      .map((e) => {
                        const unit = e.group === 'fat' ? '%' : 'kg';
                        const currentBodyRes =
                          e.bodyResult !== undefined
                            ? e.bodyResult
                            : e.targetVal > 0 && e.currentGap !== undefined
                            ? Math.max(0, parseFloat((e.targetVal - e.currentGap).toFixed(2)))
                            : 0;

                        const targetStandard = getP22Target(e.group, e.gender, e.ageGroup);
                        const isMet = currentBodyRes >= targetStandard;
                        const inbodyScore = (e.rankPts || 0) + (e.inbodyPts || 0);

                        return (
                          <tr key={e.empId} className="hover:bg-[#22223a]/50">
                            <td className="p-3 font-bold whitespace-nowrap">
                              <div>{e.name}</div>
                              <div className="text-[10px] text-[#8888aa]">{e.empId} {e.nickname ? `(${e.nickname})` : ''}</div>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  e.group === 'fat' ? 'bg-orange-950 text-orange-400 border border-orange-800/40' : 'bg-blue-950 text-blue-400 border border-blue-800/40'
                                }`}
                              >
                                {e.group === 'fat' ? '🔥 減脂組' : '💪 增肌組'}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <select
                                id={`gender-${e.empId}`}
                                defaultValue={e.gender || 'female'}
                                className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-2 py-1 text-xs text-white outline-none"
                              >
                                <option value="female">👩 女性</option>
                                <option value="male">👨 男性</option>
                              </select>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <select
                                id={`age-${e.empId}`}
                                defaultValue={e.ageGroup || 'under40'}
                                className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-2 py-1 text-xs text-white outline-none"
                              >
                                <option value="under40">40 歲以下</option>
                                <option value="age40to49">40 歲以上</option>
                                <option value="age50plus">50 歲以上</option>
                              </select>
                            </td>
                            <td className="p-3 whitespace-nowrap text-cyan-300 font-semibold">
                              {targetStandard} {unit}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="0.1"
                                  id={`result-${e.empId}`}
                                  defaultValue={currentBodyRes}
                                  className="w-20 bg-[#0d0d1a] border border-[#2a2a4a] focus:border-[#ffd700] rounded px-2 py-1 text-xs text-[#ffd700] font-bold outline-none"
                                />
                                <span className="text-[11px] text-[#8888aa]">{unit}</span>
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {isMet ? (
                                <span className="px-2 py-0.5 bg-emerald-950 border border-emerald-700/60 text-emerald-300 rounded text-[10px] font-bold">
                                  ✅ 達標
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-gray-900 border border-gray-700 text-gray-400 rounded text-[10px]">
                                  差 {(targetStandard - currentBodyRes).toFixed(1)} {unit}
                                </span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {e.rankPts ? (
                                <span className="text-amber-400 font-bold">🥇🥈🥉 +{e.rankPts} 分 (名次)</span>
                              ) : e.inbodyPts ? (
                                <span className="text-blue-300 font-bold">+{e.inbodyPts} 分 (級距)</span>
                              ) : (
                                <span className="text-gray-500">+0 分</span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap font-bold text-[#ffd700]">
                              {e.totalPts || 0} 分
                            </td>
                            <td className="p-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => {
                                  const gEl = document.getElementById(`gender-${e.empId}`) as HTMLSelectElement;
                                  const aEl = document.getElementById(`age-${e.empId}`) as HTMLSelectElement;
                                  const rEl = document.getElementById(`result-${e.empId}`) as HTMLInputElement;

                                  const gender = (gEl?.value || 'female') as GenderType;
                                  const ageGroup = (aEl?.value || 'under40') as AgeGroupType;
                                  const bodyResult = parseFloat(rEl?.value || '0');

                                  handleSaveSingleEmpInbody(e.empId, gender, ageGroup, bodyResult);
                                }}
                                className="px-2.5 py-1 bg-[#3a3a6a] hover:bg-[#4a4a8a] text-white rounded text-[11px] font-bold transition-all shadow"
                              >
                                💾 儲存
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 5. 排行榜與 8/27 競賽獎專區 Ranking */}
        {activeTab === 'ranking' && (
          <div className="space-y-6">
            {/* 頁面標題區 */}
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">🏆 全員即時積分排行榜與 8/27 賽事獎項</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  自動計算個人競賽獎（同分比序體態成果）、個人達標獎（$2,000）與團體競賽獎
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={rankGroupFilter}
                  onChange={(e) => setRankGroupFilter(e.target.value)}
                  className="bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="">全部組別</option>
                  <option value="fat">🔥 減脂組</option>
                  <option value="muscle">💪 增肌組</option>
                </select>
                <button
                  onClick={() => {
                    const csv = generateFullSettlementCSV(employees, teams, settings);
                    downloadCSVFile(csv, '夏日挑戰賽_8月27日官方全員結算總報表.csv');
                  }}
                  className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 cursor-pointer transition-all"
                  title="匯出符合官方檔案2格式的全員完整結算報表"
                >
                  📥 下載 8/27 全員結算總表 (CSV)
                </button>
                <button
                  onClick={() => {
                    const csv = generateOfficialAwardsCSV();
                    downloadCSVFile(csv, '夏日挑戰賽_8月27日官方獲獎名冊與獎金清冊.csv');
                  }}
                  className="px-3 py-2 bg-purple-700 hover:bg-purple-600 active:scale-95 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 cursor-pointer transition-all"
                  title="匯出符合官方檔案1格式的獲獎名單與獎金發放總表"
                >
                  🏆 下載 8/27 官方獲獎名冊 (CSV)
                </button>
                <button
                  onClick={() => {
                    const csv = generatePrizeReportCSV(employees, teams, settings);
                    downloadCSVFile(csv, '夏日挑戰賽_即時得獎與獎金總表.csv');
                  }}
                  className="px-2.5 py-2 bg-[#2a2a50] hover:bg-[#3a3a70] active:scale-95 text-gray-200 font-bold rounded-lg text-xs shadow flex items-center gap-1 cursor-pointer transition-all"
                  title="依當前即時團隊與同仁動態計算之得獎表"
                >
                  📊 下載即時計算表 (CSV)
                </button>
                <button
                  onClick={handleApplyOfficialSettlementToFirestore}
                  disabled={isApplyingOfficial}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold rounded-lg text-xs shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
                  title="一鍵將 8/27 官方大會校定之 58 位同仁總成績與隊伍名單完整寫入 Firestore 資料庫"
                >
                  {isApplyingOfficial ? '🔄 同步中...' : '💾 一鍵同步 8/27 官方核定數據至後台'}
                </button>
                <button
                  onClick={handleRunTournamentCalculation}
                  disabled={isCalculatingTournament}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-black font-extrabold rounded-lg text-xs shadow-lg flex items-center gap-1.5 transition-all"
                >
                  {isCalculatingTournament ? '⚡ 結算中...' : '⚡ 執行 8/27 自動結算'}
                </button>
              </div>
            </div>

            {/* 即時/結算得獎總覽看板 */}
            {(() => {
              const calc = calculateTournamentResults(employees, teams, settings);
              return (
                <div className="space-y-4">
                  {/* 獎項摘要卡片 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[#1a1a2e] border border-amber-500/40 p-4 rounded-xl text-center shadow">
                      <div className="text-2xl font-black text-amber-400">{calc.achievementWinners.length} <span className="text-xs">人</span></div>
                      <div className="text-xs text-[#8888aa] mt-1 font-bold">🎯 個人達標獎獲獎</div>
                      <div className="text-[10px] text-amber-300/80 mt-0.5">每人 $2,000 (總額 ${(calc.achievementWinners.length * 2000).toLocaleString()})</div>
                    </div>
                    <div className="bg-[#1a1a2e] border border-purple-500/40 p-4 rounded-xl text-center shadow">
                      <div className="text-2xl font-black text-purple-300">
                        {calc.individualFatWinners.length + calc.individualMuscleWinners.length} <span className="text-xs">人</span>
                      </div>
                      <div className="text-xs text-[#8888aa] mt-1 font-bold">🥇 個人競賽獎</div>
                      <div className="text-[10px] text-purple-300/80 mt-0.5">減脂 {calc.individualFatWinners.length} 人、增肌 {calc.individualMuscleWinners.length} 人</div>
                    </div>
                    <div className="bg-[#1a1a2e] border border-blue-500/40 p-4 rounded-xl text-center shadow">
                      <div className="text-2xl font-black text-blue-300">
                        {calc.fatTeamWinners.length + calc.muscleTeamWinners.length} <span className="text-xs">隊</span>
                      </div>
                      <div className="text-xs text-[#8888aa] mt-1 font-bold">👥 團體競賽獎</div>
                      <div className="text-[10px] text-blue-300/80 mt-0.5">冠亞軍 (每人 $3,000 / $2,000)</div>
                    </div>
                    <div className="bg-[#1a1a2e] border border-emerald-500/40 p-4 rounded-xl text-center shadow">
                      <div className="text-2xl font-black text-emerald-400">
                        ${calc.stats.totalPrizePool.toLocaleString()}
                      </div>
                      <div className="text-xs text-[#8888aa] mt-1 font-bold">💰 預計頒發總獎金</div>
                      <div className="text-[10px] text-emerald-300/80 mt-0.5">個人達標 + 個人競賽 + 團體賽</div>
                    </div>
                  </div>

                  {/* 1. 個人競賽獎頒獎台 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 減脂組個人競賽獎 */}
                    <div className="bg-[#1a1a2e] border border-orange-500/30 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center border-b border-[#2a2a4a] pb-2">
                        <div className="font-bold text-orange-400 flex items-center gap-1.5 text-sm">
                          <span>🔥 減脂組 個人競賽獎</span>
                        </div>
                        <span className="text-[11px] text-[#8888aa]">依個人總積分排序 (同分比序減脂%)</span>
                      </div>

                      <div className="space-y-2">
                        {calc.individualFatWinners.length > 0 ? (
                          calc.individualFatWinners.map((w, idx) => (
                            <div
                              key={w.empId}
                              className="flex items-center justify-between p-2.5 bg-[#252035] border border-orange-500/20 rounded-lg text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                </span>
                                <div>
                                  <div className="font-bold text-white">
                                    {w.name} <span className="text-[#8888aa] text-[11px]">({w.empId})</span>
                                  </div>
                                  <div className="text-[10px] text-orange-300">
                                    減脂成果：<b className="text-white">{w.bodyResult ?? 0}%</b> (P22標準: {w.p22Target}%)
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-extrabold text-[#ffd700] text-sm">
                                  總分 {w.totalPts || 0} 分
                                </div>
                                <div className="text-[10px] text-emerald-400 font-bold">
                                  獎金 ${w.individualAwardPrize?.toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-[#8888aa] py-3 text-center">
                            尚無符合個人達標且滿 45 分之獲獎同仁
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 增肌組個人競賽獎 */}
                    <div className="bg-[#1a1a2e] border border-blue-500/30 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-center border-b border-[#2a2a4a] pb-2">
                        <div className="font-bold text-blue-400 flex items-center gap-1.5 text-sm">
                          <span>💪 增肌組 個人競賽獎</span>
                        </div>
                        <span className="text-[11px] text-[#8888aa]">
                          {calc.muscleRankings.length < 15 ? '※ 未滿15人僅取前2名' : '取前 3 名'}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {calc.individualMuscleWinners.length > 0 ? (
                          calc.individualMuscleWinners.map((w, idx) => (
                            <div
                              key={w.empId}
                              className="flex items-center justify-between p-2.5 bg-[#1e2538] border border-blue-500/20 rounded-lg text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-base">
                                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                </span>
                                <div>
                                  <div className="font-bold text-white">
                                    {w.name} <span className="text-[#8888aa] text-[11px]">({w.empId})</span>
                                  </div>
                                  <div className="text-[10px] text-blue-300">
                                    增肌成果：<b className="text-white">{w.bodyResult ?? 0} kg</b> (P22標準: {w.p22Target}kg)
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-extrabold text-[#ffd700] text-sm">
                                  總分 {w.totalPts || 0} 分
                                </div>
                                <div className="text-[10px] text-emerald-400 font-bold">
                                  獎金 ${w.individualAwardPrize?.toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-[#8888aa] py-3 text-center">
                            尚無符合個人達標且滿 45 分之獲獎同仁
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. 團體競賽獎名冊與後台調整面板 */}
                  <div className="space-y-4">
                    {/* 隊伍自訂調整與未組隊分配控制面板 */}
                    <div className="bg-[#1e1e38] border border-purple-500/40 rounded-xl p-4 space-y-3 shadow-md">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">⚙️</span>
                          <div>
                            <div className="font-bold text-white text-xs flex items-center gap-2">
                              <span>隊伍調整與未組隊同仁管理 (後台統計調整)</span>
                              <span className="text-[10px] bg-purple-900/70 text-purple-200 px-2 py-0.5 rounded border border-purple-700">
                                即時連動團體賽名次
                              </span>
                            </div>
                            <div className="text-[11px] text-[#aaaacc] mt-0.5">
                              若有同仁未在系統上組隊，可直接於下方一鍵分隊、建立隊伍或指派入隊，系統將即時重算團體總分與獎項。
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleOpenCreateTeam('fat')}
                            className="px-2.5 py-1.5 bg-orange-700 hover:bg-orange-600 active:scale-95 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                          >
                            ➕ 建立減脂隊伍
                          </button>
                          <button
                            onClick={() => handleOpenCreateTeam('muscle')}
                            className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                          >
                            ➕ 建立增肌隊伍
                          </button>
                          <button
                            onClick={() => handleAutoGroupUnassigned('fat', 3)}
                            className="px-2.5 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-110 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                          >
                            ⚡ 減脂組未組隊一鍵分隊
                          </button>
                          <button
                            onClick={() => handleAutoGroupUnassigned('muscle', 3)}
                            className="px-2.5 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:brightness-110 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                          >
                            ⚡ 增肌組未組隊一鍵分隊
                          </button>
                        </div>
                      </div>

                      {/* 未組隊同仁狀態列 */}
                      {(() => {
                        const fatUnassigned = getUnassignedEmployees('fat');
                        const muscleUnassigned = getUnassignedEmployees('muscle');
                        const totalUnassigned = fatUnassigned.length + muscleUnassigned.length;

                        return (
                          <div className="space-y-3 pt-2 border-t border-[#333366]">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-4">
                                <span className="font-bold text-amber-300">
                                  ⚠️ 目前未組隊同仁：共 {totalUnassigned} 人
                                </span>
                                <span className="text-orange-300 bg-orange-950/60 px-2 py-0.5 rounded border border-orange-800/60">
                                  減脂組未組隊: {fatUnassigned.length} 人
                                </span>
                                <span className="text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/60">
                                  增肌組未組隊: {muscleUnassigned.length} 人
                                </span>
                              </div>
                              <button
                                onClick={() => setShowTeamAdjustPanelInRankings(!showTeamAdjustPanelInRankings)}
                                className="text-[11px] text-purple-300 hover:text-white underline cursor-pointer"
                              >
                                {showTeamAdjustPanelInRankings ? '▲ 收合未組隊名冊' : '▼ 展開未組隊同仁名單與快速指派'}
                              </button>
                            </div>

                            {showTeamAdjustPanelInRankings && totalUnassigned > 0 && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-[#121226] rounded-lg border border-[#2a2a50]">
                                {[...fatUnassigned, ...muscleUnassigned].map((u) => {
                                  const groupLabel = u.group === 'fat' ? '減脂' : '增肌';
                                  const availableTeams = teams.filter(
                                    (t) =>
                                      !t.disbanded &&
                                      ((t.group || employees.find((m) => m.empId === t.members[0])?.group) === u.group)
                                  );

                                  return (
                                    <div
                                      key={u.empId}
                                      className="flex items-center justify-between p-2 bg-[#1c1c36] rounded border border-[#2c2c54] text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            u.group === 'fat'
                                              ? 'bg-orange-950 text-orange-400 border border-orange-800'
                                              : 'bg-blue-950 text-blue-400 border border-blue-800'
                                          }`}
                                        >
                                          {groupLabel}
                                        </span>
                                        <span className="font-bold text-white">{u.name}</span>
                                        <span className="text-[10px] text-[#8888aa]">({u.empId})</span>
                                        <span className="text-[#ffd700] text-[11px] font-bold">
                                          {u.totalPts || 0}分
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <select
                                          defaultValue=""
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              handleQuickAssignEmp(u.empId, e.target.value);
                                            }
                                          }}
                                          className="text-[11px] bg-[#0d0d1a] border border-purple-700/70 text-purple-200 rounded px-2 py-1 outline-none cursor-pointer"
                                        >
                                          <option value="">指派至隊伍...</option>
                                          <optgroup label="現有隊伍">
                                            {availableTeams.map((t) => (
                                              <option key={t.id} value={t.id}>
                                                🏴 {t.teamName} ({t.members.length}人)
                                              </option>
                                            ))}
                                          </optgroup>
                                          <option value="NEW">➕ 建立新隊伍...</option>
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* 團體競賽得獎隊伍名冊 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 減脂組團體獎 */}
                      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4 space-y-3">
                        <div className="font-bold text-orange-300 flex justify-between items-center text-xs border-b border-[#2a2a4a] pb-2">
                          <span>👥 減脂組 團體競賽獎 (前 2 組)</span>
                          <span className="text-[10px] text-[#8888aa]">平均積分高者勝 (同分比序平均減脂%)</span>
                        </div>
                        <div className="space-y-2">
                          {calc.fatTeamWinners.length > 0 ? (
                            calc.fatTeamWinners.map((tw, idx) => {
                              const originalTeam = teams.find((t) => t.id === tw.teamId);
                              return (
                                <div key={tw.teamId} className="p-3 bg-[#242034] rounded-lg text-xs space-y-2 border border-orange-500/20">
                                  <div className="flex justify-between items-center">
                                    <div className="font-bold text-white flex items-center gap-1.5">
                                      <span>{idx === 0 ? '🥇 冠軍隊伍' : '🥈 亞軍隊伍'}：{tw.teamName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-emerald-400 font-bold">每人 ${tw.prizePerMember?.toLocaleString()}</span>
                                      {originalTeam && (
                                        <button
                                          onClick={() => handleOpenEditTeam(originalTeam)}
                                          className="px-2 py-0.5 bg-[#3a2a6a] hover:bg-[#4a3a7a] text-purple-200 rounded text-[10px] font-bold border border-purple-600 transition-all"
                                        >
                                          ✏️ 調整隊員
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-[#a0a0c0] flex justify-between">
                                    <span>成員 ({tw.members.length}人)：{tw.members.map((m) => m.name).join('、')}</span>
                                    <span className="text-[#ffd700] font-bold">平均：{tw.avgTotalPts} 分 ({tw.avgBodyResult}%)</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-[#8888aa] py-2 text-center">尚無符合資格之減脂隊伍</div>
                          )}
                        </div>
                      </div>

                      {/* 增肌組團體獎 */}
                      <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-4 space-y-3">
                        <div className="font-bold text-blue-300 flex justify-between items-center text-xs border-b border-[#2a2a4a] pb-2">
                          <span>👥 增肌組 團體競賽獎 (前 2 組)</span>
                          <span className="text-[10px] text-[#8888aa]">平均積分高者勝 (同分比序平均增肌kg)</span>
                        </div>
                        <div className="space-y-2">
                          {calc.muscleTeamWinners.length > 0 ? (
                            calc.muscleTeamWinners.map((tw, idx) => {
                              const originalTeam = teams.find((t) => t.id === tw.teamId);
                              return (
                                <div key={tw.teamId} className="p-3 bg-[#1e2438] rounded-lg text-xs space-y-2 border border-blue-500/20">
                                  <div className="flex justify-between items-center">
                                    <div className="font-bold text-white flex items-center gap-1.5">
                                      <span>{idx === 0 ? '🥇 冠軍隊伍' : '🥈 亞軍隊伍'}：{tw.teamName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-emerald-400 font-bold">每人 ${tw.prizePerMember?.toLocaleString()}</span>
                                      {originalTeam && (
                                        <button
                                          onClick={() => handleOpenEditTeam(originalTeam)}
                                          className="px-2 py-0.5 bg-[#2a3a6a] hover:bg-[#3a4a7a] text-blue-200 rounded text-[10px] font-bold border border-blue-600 transition-all"
                                        >
                                          ✏️ 調整隊員
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-[#a0a0c0] flex justify-between">
                                    <span>成員 ({tw.members.length}人)：{tw.members.map((m) => m.name).join('、')}</span>
                                    <span className="text-[#ffd700] font-bold">平均：{tw.avgTotalPts} 分 ({tw.avgBodyResult}kg)</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-[#8888aa] py-2 text-center">尚無符合資格之增肌隊伍</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 全體隊伍賽事統計總覽表格 */}
                    <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden shadow">
                      <div className="p-3 bg-[#24243e] border-b border-[#2a2a4a] flex justify-between items-center">
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>🏴 全體參賽隊伍積分結算總清單 ({[...calc.fatTeamResults, ...calc.muscleTeamResults].length} 隊)</span>
                        </div>
                        <div className="text-[11px] text-[#8888aa]">
                          💡 參賽標準：隊伍需滿 2-5 人、全員滿 45 分且平均體態達標
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-[#2a2a4a] text-[#8888aa]">
                              <th className="p-3 whitespace-nowrap">組別</th>
                              <th className="p-3 whitespace-nowrap">隊伍名稱</th>
                              <th className="p-3 whitespace-nowrap">成員名單 (人數)</th>
                              <th className="p-3 whitespace-nowrap">平均總分</th>
                              <th className="p-3 whitespace-nowrap">平均體態成果</th>
                              <th className="p-3 whitespace-nowrap">資格與得獎判定</th>
                              <th className="p-3 whitespace-nowrap text-right">隊伍管理操作</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2a2a4a]">
                            {[...calc.fatTeamResults, ...calc.muscleTeamResults].map((tr) => {
                              const originalTeam = teams.find((t) => t.id === tr.teamId);
                              const unit = tr.group === 'fat' ? '%' : 'kg';
                              return (
                                <tr key={tr.teamId} className="hover:bg-[#20203a]/50">
                                  <td className="p-3 whitespace-nowrap">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        tr.group === 'fat'
                                          ? 'bg-orange-950 text-orange-400 border border-orange-800'
                                          : 'bg-blue-950 text-blue-400 border border-blue-800'
                                      }`}
                                    >
                                      {tr.group === 'fat' ? '減脂組' : '增肌組'}
                                    </span>
                                  </td>
                                  <td className="p-3 font-bold text-white whitespace-nowrap">
                                    {tr.teamName}
                                  </td>
                                  <td className="p-3">
                                    <div className="flex flex-wrap gap-1.5 items-center max-w-md">
                                      {tr.members.map((m) => (
                                        <span
                                          key={m.empId}
                                          className="px-2 py-0.5 bg-[#252545] text-purple-200 rounded text-[11px] border border-[#3a3a6a]"
                                        >
                                          {m.name} ({m.totalPts || 0}分)
                                        </span>
                                      ))}
                                      <span className="text-[10px] text-gray-400">({tr.members.length}人)</span>
                                    </div>
                                  </td>
                                  <td className="p-3 font-bold text-[#ffd700] whitespace-nowrap">
                                    {tr.avgTotalPts} 分
                                  </td>
                                  <td className="p-3 whitespace-nowrap">
                                    <span className="font-bold text-white">
                                      {tr.avgBodyResult} {unit}
                                    </span>
                                  </td>
                                  <td className="p-3 whitespace-nowrap">
                                    {tr.awardName ? (
                                      <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded font-bold border border-emerald-800 text-[11px]">
                                        🏆 {tr.awardName}
                                      </span>
                                    ) : tr.isQualified ? (
                                      <span className="px-2 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-800 text-[10px]">
                                        ✅ 符合參賽資格
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 bg-amber-950/60 text-amber-400 rounded border border-amber-800/60 text-[10px]">
                                        {tr.members.length < 2
                                          ? '⚠️ 人數未滿2人'
                                          : !tr.isAllMembersMinPtsMet
                                          ? '⚠️ 全員未滿45分'
                                          : !tr.isAvgGoalMet
                                          ? '⚠️ 平均體態未達標'
                                          : '⚠️ 未符資格'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right whitespace-nowrap space-x-1.5">
                                    {originalTeam && (
                                      <button
                                        onClick={() => handleOpenEditTeam(originalTeam)}
                                        className="px-2.5 py-1 bg-purple-800 hover:bg-purple-700 text-white rounded text-[11px] font-bold shadow"
                                      >
                                        ✏️ 調整隊員
                                      </button>
                                    )}
                                    {originalTeam && (
                                      <button
                                        onClick={() => handleDisbandTeam(originalTeam.id, originalTeam.teamName)}
                                        className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 rounded text-[10px] border border-red-800"
                                      >
                                        解散
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 全員總排行榜清單 */}
            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden shadow">
              <div className="p-3 bg-[#24243e] border-b border-[#2a2a4a] flex justify-between items-center">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>📊 全體同仁總積分排行榜與得獎狀態明細</span>
                </div>
                <div className="text-[11px] text-[#8888aa]">
                  💡 同分時：依增肌公斤數或減脂百分比高者列為優先
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#2a2a4a] text-[#8888aa]">
                      <th className="p-3 whitespace-nowrap">名次</th>
                      <th className="p-3 whitespace-nowrap">員工</th>
                      <th className="p-3 whitespace-nowrap">組別</th>
                      <th className="p-3 whitespace-nowrap">任務打卡分</th>
                      <th className="p-3 whitespace-nowrap">體態名次分</th>
                      <th className="p-3 whitespace-nowrap">體態級距分</th>
                      <th className="p-3 whitespace-nowrap">總積分</th>
                      <th className="p-3 whitespace-nowrap">體態成果 (同分比序)</th>
                      <th className="p-3 whitespace-nowrap">P22 達標狀態</th>
                      <th className="p-3 whitespace-nowrap">獲得獎項</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a4a]">
                    {[...employees]
                      .filter((e) => e.group && (!rankGroupFilter || e.group === rankGroupFilter))
                      .sort((a, b) => {
                        if ((b.totalPts || 0) !== (a.totalPts || 0)) {
                          return (b.totalPts || 0) - (a.totalPts || 0);
                        }
                        const resA = a.bodyResult ?? 0;
                        const resB = b.bodyResult ?? 0;
                        return resB - resA;
                      })
                      .map((e, idx) => {
                        const unit = e.group === 'fat' ? '%' : 'kg';
                        const bodyRes = e.bodyResult ?? (e.targetVal > 0 && e.currentGap !== undefined ? Math.max(0, e.targetVal - e.currentGap) : 0);
                        const targetStandard = getP22Target(e.group, e.gender, e.ageGroup);
                        const isMet = bodyRes >= targetStandard;
                        const isMinMet = (e.totalPts || 0) >= 45;

                        return (
                          <tr key={e.empId} className="hover:bg-[#22223a]/50">
                            <td className="p-3 font-bold text-[#ffd700] whitespace-nowrap">
                              {idx === 0 ? '🥇 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`}
                            </td>
                            <td className="p-3 font-bold whitespace-nowrap">
                              <div>{e.name}</div>
                              <div className="text-[10px] text-[#8888aa]">{e.empId} {e.nickname ? `(${e.nickname})` : ''}</div>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  e.group === 'fat' ? 'bg-orange-950 text-orange-400' : 'bg-blue-950 text-blue-400'
                                }`}
                              >
                                {e.group === 'fat' ? '減脂' : '增肌'}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">{e.taskPts || 0}</td>
                            <td className="p-3 whitespace-nowrap text-amber-400">{e.rankPts || 0}</td>
                            <td className="p-3 whitespace-nowrap text-blue-300">{e.inbodyPts || 0}</td>
                            <td className="p-3 whitespace-nowrap text-base font-extrabold text-[#ffd700]">
                              {e.totalPts || 0} 分
                            </td>
                            <td className="p-3 whitespace-nowrap text-cyan-300 font-bold">
                              {bodyRes} {unit}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {isMet ? (
                                <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800/50 rounded text-[10px] font-bold">
                                  達標 (≥{targetStandard}{unit})
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-gray-900 text-gray-400 rounded text-[10px]">
                                  未達標 (標:{targetStandard}{unit})
                                </span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap space-x-1">
                              {e.individualAward && (
                                <span className="px-2 py-0.5 bg-purple-900 text-purple-200 border border-purple-600/50 rounded text-[10px] font-bold">
                                  🏆 {e.individualAward}
                                </span>
                              )}
                              {isMet && isMinMet && (
                                <span className="px-2 py-0.5 bg-amber-900 text-amber-200 border border-amber-600/50 rounded text-[10px] font-bold">
                                  🎯 達標獎 $2,000
                                </span>
                              )}
                              {!e.individualAward && (!isMet || !isMinMet) && (
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
        {activeTab === 'completion' && (() => {
          const compEligibleList = employees.filter((e) => (e.totalPts || 0) >= 45 || e.completionReward);

          const itemCounts: Record<string, { total: number; pending: number; delivered: number }> = {
            'm2-超能水光凍*10入': { total: 0, pending: 0, delivered: 0 },
            'm2-超能膠原凍*10入': { total: 0, pending: 0, delivered: 0 },
            '新普利夜酵凍*10入': { total: 0, pending: 0, delivered: 0 },
          };
          let unselectedCount = 0;

          compEligibleList.forEach((e) => {
            if (!e.completionReward) {
              unselectedCount++;
            } else if (itemCounts[e.completionReward]) {
              itemCounts[e.completionReward].total++;
              if (e.completionDelivered) {
                itemCounts[e.completionReward].delivered++;
              } else {
                itemCounts[e.completionReward].pending++;
              }
            } else {
              itemCounts[e.completionReward] = itemCounts[e.completionReward] || { total: 0, pending: 0, delivered: 0 };
              itemCounts[e.completionReward].total++;
              if (e.completionDelivered) itemCounts[e.completionReward].delivered++;
              else itemCounts[e.completionReward].pending++;
            }
          });

          const filteredList = compEligibleList.filter((e) => {
            // Item filter
            if (completionItemFilter === 'unselected') {
              if (e.completionReward) return false;
            } else if (completionItemFilter) {
              if (e.completionReward !== completionItemFilter) return false;
            }

            // Delivery filter
            if (completionDeliveryFilter === 'pending') {
              if (!e.completionReward || e.completionDelivered) return false;
            } else if (completionDeliveryFilter === 'delivered') {
              if (!e.completionDelivered) return false;
            } else if (completionDeliveryFilter === 'unselected') {
              if (e.completionReward) return false;
            }

            // Keyword search
            if (searchEmp) {
              const kw = searchEmp.toLowerCase();
              if (!e.name.toLowerCase().includes(kw) && !e.empId.toLowerCase().includes(kw)) return false;
            }

            return true;
          });

          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-bold text-[#ffd700]">🎁 完賽禮選擇名單 (門檻 ≥ 45 分 + 照片心得)</h2>
                  <p className="text-xs text-[#8888aa] mt-0.5">顯示各完賽禮品項總統計數量與同仁領取發放狀態</p>
                </div>
                <button
                  onClick={() => {
                    const rows = [['員工編號', '姓名', '組別', '積分', '選擇完賽禮品項', '發放狀態']];
                    filteredList.forEach((e) => {
                      rows.push([
                        e.empId,
                        e.name,
                        e.group,
                        String(e.totalPts || 0),
                        e.completionReward || '未選擇',
                        e.completionDelivered ? '已發放' : e.completionReward ? '待發放' : '未選擇',
                      ]);
                    });
                    downloadCSV(rows, '完賽禮領取與品項統計名單');
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-all shadow"
                >
                  📥 匯出當前篩選 CSV 報表
                </button>
              </div>

              {/* 個別品項統計數量卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: 'm2-超能水光凍*10入', icon: '💧', label: 'm2-超能水光凍*10入', color: 'border-cyan-800 bg-cyan-950/40 text-cyan-200' },
                  { key: 'm2-超能膠原凍*10入', icon: '✨', label: 'm2-超能膠原凍*10入', color: 'border-pink-800 bg-pink-950/40 text-pink-200' },
                  { key: '新普利夜酵凍*10入', icon: '🌙', label: '新普利夜酵凍*10入', color: 'border-indigo-800 bg-indigo-950/40 text-indigo-200' },
                ].map((item) => {
                  const stat = itemCounts[item.key] || { total: 0, pending: 0, delivered: 0 };
                  const isSelectedFilter = completionItemFilter === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => setCompletionItemFilter(isSelectedFilter ? '' : item.key)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${item.color} ${
                        isSelectedFilter ? 'ring-2 ring-amber-400 scale-[1.02]' : 'hover:border-amber-500/50'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span>{item.icon} {item.label}</span>
                        {isSelectedFilter && <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-extrabold">篩選中</span>}
                      </div>
                      <div className="text-2xl font-black text-white my-1">
                        {stat.total} <span className="text-xs text-gray-400 font-normal">份</span>
                      </div>
                      <div className="flex gap-2 text-[11px] font-bold mt-1">
                        <span className="text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                          待發放: {stat.pending}
                        </span>
                        <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                          已發放: {stat.delivered}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div
                  onClick={() => setCompletionItemFilter(completionItemFilter === 'unselected' ? '' : 'unselected')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer border-gray-700 bg-gray-900/60 text-gray-300 ${
                    completionItemFilter === 'unselected' ? 'ring-2 ring-amber-400 scale-[1.02]' : 'hover:border-gray-500'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs font-bold mb-1">
                    <span>⏳ 未選擇品項同仁</span>
                    {completionItemFilter === 'unselected' && <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-extrabold">篩選中</span>}
                  </div>
                  <div className="text-2xl font-black text-gray-200 my-1">
                    {unselectedCount} <span className="text-xs text-gray-400 font-normal">人</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">
                    達完賽門檻但尚未於前台選擇禮物
                  </div>
                </div>
              </div>

              {/* 篩選條件區域 */}
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-3 rounded-xl flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-300">🔍 篩選條件：</span>

                  {/* 品項篩選 */}
                  <select
                    value={completionItemFilter}
                    onChange={(e) => setCompletionItemFilter(e.target.value)}
                    className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500"
                  >
                    <option value="">全部品項 (三選一)</option>
                    <option value="m2-超能水光凍*10入">💧 m2-超能水光凍*10入</option>
                    <option value="m2-超能膠原凍*10入">✨ m2-超能膠原凍*10入</option>
                    <option value="新普利夜酵凍*10入">🌙 新普利夜酵凍*10入</option>
                    <option value="unselected">⏳ 尚未選擇品項</option>
                  </select>

                  {/* 發放狀態篩選 */}
                  <select
                    value={completionDeliveryFilter}
                    onChange={(e) => setCompletionDeliveryFilter(e.target.value)}
                    className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">全部發放狀態</option>
                    <option value="pending">待發放 (已選未領)</option>
                    <option value="delivered">已發放 (完成領取)</option>
                    <option value="unselected">未選擇獎勵</option>
                  </select>

                  {/* 搜尋姓名或工號 */}
                  <input
                    type="text"
                    placeholder="搜尋姓名或員工編號..."
                    value={searchEmp}
                    onChange={(e) => setSearchEmp(e.target.value)}
                    className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 w-44"
                  />

                  {(completionItemFilter || completionDeliveryFilter !== 'all' || searchEmp) && (
                    <button
                      onClick={() => {
                        setCompletionItemFilter('');
                        setCompletionDeliveryFilter('all');
                        setSearchEmp('');
                      }}
                      className="text-xs text-amber-400 underline px-1"
                    >
                      清除篩選
                    </button>
                  )}
                </div>

                <div className="text-xs text-gray-400 font-medium">
                  符合筆數：<strong className="text-amber-400">{filteredList.length}</strong> / {compEligibleList.length} 筆
                </div>
              </div>

              {/* 資料表格 */}
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#2a2a4a] text-[#8888aa]">
                      <th className="p-3">員工姓名 (工號)</th>
                      <th className="p-3">組別</th>
                      <th className="p-3">總積分</th>
                      <th className="p-3">選擇之完賽禮品項</th>
                      <th className="p-3">發放狀態</th>
                      <th className="p-3">操作 (可切換狀態)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a4a]">
                    {filteredList.length > 0 ? (
                      filteredList.map((e) => (
                        <tr key={e.empId} className="hover:bg-[#20203a] transition-colors">
                          <td className="p-3 font-bold text-white">
                            {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                          </td>
                          <td className="p-3 text-gray-300">{e.group === 'fat' ? '⚡ 減脂組' : e.group === 'muscle' ? '💪 增肌組' : '未定'}</td>
                          <td className="p-3 font-bold text-[#ffd700]">{e.totalPts || 0} 分</td>
                          <td className="p-3">
                            {e.completionReward ? (
                              <span className="font-bold text-amber-300 bg-amber-950/40 px-2 py-1 rounded border border-amber-800/60 inline-block">
                                {e.completionReward}
                              </span>
                            ) : (
                              <span className="text-gray-500 italic">未選擇</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                e.completionDelivered
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : e.completionReward
                                  ? 'bg-amber-950 text-amber-400 border-amber-800'
                                  : 'bg-gray-800 text-gray-400 border-gray-700'
                              }`}
                            >
                              {e.completionDelivered ? '已發放' : e.completionReward ? '待發放' : '未選擇獎勵'}
                            </span>
                          </td>
                          <td className="p-3">
                            {e.completionReward ? (
                              <button
                                onClick={() => handleToggleDeliverCompletion(e.empId, e.completionDelivered)}
                                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all shadow ${
                                  e.completionDelivered
                                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                }`}
                              >
                                {e.completionDelivered ? '↩️ 切換為待發放' : '✅ 標記已發放'}
                              </button>
                            ) : (
                              <span className="text-gray-500 text-[10px]">待同仁選擇</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-500">
                          查無符合條件之同仁紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* 8. 拼字獎勵 Spell */}
        {activeTab === 'spell' && (() => {
          const spellEligibleList = employees.filter((e) => (e.letters || []).length >= 11 || e.spellReward);

          const spellItemCounts: Record<string, { total: number; pending: number; delivered: number }> = {
            '【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)': { total: 0, pending: 0, delivered: 0 },
            '【新普利】日本專利益生菌DX 30入': { total: 0, pending: 0, delivered: 0 },
          };
          let spellUnselectedCount = 0;

          spellEligibleList.forEach((e) => {
            if (!e.spellReward) {
              spellUnselectedCount++;
            } else if (spellItemCounts[e.spellReward]) {
              spellItemCounts[e.spellReward].total++;
              if (e.spellDelivered) {
                spellItemCounts[e.spellReward].delivered++;
              } else {
                spellItemCounts[e.spellReward].pending++;
              }
            } else {
              spellItemCounts[e.spellReward] = spellItemCounts[e.spellReward] || { total: 0, pending: 0, delivered: 0 };
              spellItemCounts[e.spellReward].total++;
              if (e.spellDelivered) spellItemCounts[e.spellReward].delivered++;
              else spellItemCounts[e.spellReward].pending++;
            }
          });

          const filteredSpellList = spellEligibleList.filter((e) => {
            // Item filter
            if (spellItemFilter === 'unselected') {
              if (e.spellReward) return false;
            } else if (spellItemFilter) {
              if (e.spellReward !== spellItemFilter) return false;
            }

            // Status filter
            if (spellDeliveryFilter === 'pending') {
              if (!e.spellReward || e.spellDelivered) return false;
            } else if (spellDeliveryFilter === 'delivered') {
              if (!e.spellDelivered) return false;
            } else if (spellDeliveryFilter === 'unselected') {
              if (e.spellReward) return false;
            }

            // Keyword search
            if (searchEmp) {
              const kw = searchEmp.toLowerCase();
              if (!e.name.toLowerCase().includes(kw) && !e.empId.toLowerCase().includes(kw)) return false;
            }

            return true;
          });

          return (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-bold text-[#ffd700]">🎉 拼字挑戰 Bonus 獎勵名單</h2>
                  <p className="text-xs text-[#8888aa] mt-0.5">即時追蹤同仁收集字母進度、個別選擇 Bonus 品項數量與發放狀態</p>
                </div>
                <button
                  onClick={() => {
                    const rows = [['員工編號', '姓名', '字母進度', '選擇 Bonus 品項', '發放狀態']];
                    filteredSpellList.forEach((e) => {
                      rows.push([
                        e.empId,
                        e.name,
                        `${(e.letters || []).length}/11`,
                        e.spellReward || '未選擇',
                        e.spellDelivered ? '已發放' : e.spellReward ? '待發放' : '未選擇',
                      ]);
                    });
                    downloadCSV(rows, '拼字Bonus禮領取與品項統計名單');
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold transition-all shadow"
                >
                  📥 匯出當前篩選 CSV 報表
                </button>
              </div>

              <div className="bg-[#1a1a3e] border border-[#2a2a6a] p-3 rounded-xl text-xs text-purple-200 flex justify-between items-center flex-wrap gap-2">
                <div>
                  <span className="font-bold text-[#ffd700]">🔤 拼字字母獲得機制：</span>
                  <span>每累積獲得 <strong>8 分</strong> 系統隨機抽取解鎖 1 字母（SHINYBRANDS 共 11 個字母）。集滿可選領大獎！</span>
                </div>
              </div>

              {/* 個別品項統計數量卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    key: '【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)',
                    icon: '🌸',
                    label: '【m2 美度】超能膠原C粉套組',
                    color: 'border-purple-800 bg-purple-950/40 text-purple-200',
                  },
                  {
                    key: '【新普利】日本專利益生菌DX 30入',
                    icon: '🌿',
                    label: '【新普利】日本專利益生菌DX 30入',
                    color: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
                  },
                ].map((item) => {
                  const stat = spellItemCounts[item.key] || { total: 0, pending: 0, delivered: 0 };
                  const isSelectedFilter = spellItemFilter === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => setSpellItemFilter(isSelectedFilter ? '' : item.key)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer ${item.color} ${
                        isSelectedFilter ? 'ring-2 ring-amber-400 scale-[1.02]' : 'hover:border-amber-500/50'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-bold mb-1">
                        <span className="truncate max-w-[200px]">{item.icon} {item.label}</span>
                        {isSelectedFilter && <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-extrabold flex-shrink-0">篩選中</span>}
                      </div>
                      <div className="text-2xl font-black text-white my-1">
                        {stat.total} <span className="text-xs text-gray-400 font-normal">份</span>
                      </div>
                      <div className="flex gap-2 text-[11px] font-bold mt-1">
                        <span className="text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                          待發放: {stat.pending}
                        </span>
                        <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                          已發放: {stat.delivered}
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div
                  onClick={() => setSpellItemFilter(spellItemFilter === 'unselected' ? '' : 'unselected')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer border-gray-700 bg-gray-900/60 text-gray-300 ${
                    spellItemFilter === 'unselected' ? 'ring-2 ring-amber-400 scale-[1.02]' : 'hover:border-gray-500'
                  }`}
                >
                  <div className="flex justify-between items-center text-xs font-bold mb-1">
                    <span>⏳ 未選擇 Bonus 禮同仁</span>
                    {spellItemFilter === 'unselected' && <span className="text-[10px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-extrabold">篩選中</span>}
                  </div>
                  <div className="text-2xl font-black text-gray-200 my-1">
                    {spellUnselectedCount} <span className="text-xs text-gray-400 font-normal">人</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">
                    集滿 11 字母但尚未選擇 Bonus 禮
                  </div>
                </div>
              </div>

              {/* 篩選條件區 */}
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] p-3 rounded-xl flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-300">🔍 篩選條件：</span>

                  {/* 品項篩選 */}
                  <select
                    value={spellItemFilter}
                    onChange={(e) => setSpellItemFilter(e.target.value)}
                    className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500 max-w-xs truncate"
                  >
                    <option value="">全部 Bonus 品項 (二選一)</option>
                    <option value="【m2 美度】超能膠原C粉套組(膠原C粉30入/盒x1+粉紅杯1入x1/組)">🌸 【m2 美度】超能膠原C粉套組</option>
                    <option value="【新普利】日本專利益生菌DX 30入">🌿 【新普利】日本專利益生菌DX 30入</option>
                    <option value="unselected">⏳ 尚未選擇品項</option>
                  </select>

                  {/* 發放狀態篩選 */}
                  <select
                    value={spellDeliveryFilter}
                    onChange={(e) => setSpellDeliveryFilter(e.target.value)}
                    className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="all">全部發放狀態</option>
                    <option value="pending">待發放 (已選未領)</option>
                    <option value="delivered">已發放 (完成領取)</option>
                    <option value="unselected">未選擇獎勵</option>
                  </select>

                  {/* 搜尋姓名或工號 */}
                  <input
                    type="text"
                    placeholder="搜尋姓名或員工編號..."
                    value={searchEmp}
                    onChange={(e) => setSearchEmp(e.target.value)}
                    className="bg-[#0d0d1a] border border-[#2a2a4a] rounded px-3 py-1.5 text-xs text-white placeholder-gray-500 w-44"
                  />

                  {(spellItemFilter || spellDeliveryFilter !== 'all' || searchEmp) && (
                    <button
                      onClick={() => {
                        setSpellItemFilter('');
                        setSpellDeliveryFilter('all');
                        setSearchEmp('');
                      }}
                      className="text-xs text-amber-400 underline px-1"
                    >
                      清除篩選
                    </button>
                  )}
                </div>

                <div className="text-xs text-gray-400 font-medium">
                  符合筆數：<strong className="text-amber-400">{filteredSpellList.length}</strong> / {spellEligibleList.length} 筆
                </div>
              </div>

              {/* 資料表格 */}
              <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#2a2a4a] text-[#8888aa]">
                      <th className="p-3">員工</th>
                      <th className="p-3">收集字母進度</th>
                      <th className="p-3">已解鎖字母明細</th>
                      <th className="p-3">選擇之 Bonus 獎勵</th>
                      <th className="p-3">發放狀態</th>
                      <th className="p-3">操作 (可切換狀態)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2a4a]">
                    {filteredSpellList.length > 0 ? (
                      filteredSpellList.map((e) => {
                        const letters = e.letters || [];
                        const isFull = letters.length >= 11;
                        return (
                          <tr key={e.empId} className="hover:bg-[#20203a] transition-colors">
                            <td className="p-3 font-bold text-white">
                              {e.name} <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                            </td>
                            <td className="p-3 font-bold">
                              <span className={isFull ? 'text-amber-400' : 'text-purple-300'}>
                                {letters.length} / 11 {isFull && '🎉 (已集滿)'}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1 max-w-xs">
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
                            <td className="p-3">
                              {e.spellReward ? (
                                <span className="font-bold text-purple-200 bg-purple-950/60 px-2 py-1 rounded border border-purple-800/80 inline-block leading-relaxed">
                                  {e.spellReward}
                                </span>
                              ) : (
                                <span className="text-gray-500 italic">未選擇</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                  e.spellDelivered
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                    : e.spellReward
                                    ? 'bg-amber-950 text-amber-400 border-amber-800'
                                    : 'bg-gray-800 text-gray-400 border-gray-700'
                                }`}
                              >
                                {e.spellDelivered ? '已發放' : e.spellReward ? '待發放' : '未選擇獎勵'}
                              </span>
                            </td>
                            <td className="p-3">
                              {e.spellReward ? (
                                <button
                                  onClick={() => handleToggleDeliverSpell(e.empId, e.spellDelivered)}
                                  className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all shadow ${
                                    e.spellDelivered
                                      ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600'
                                      : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                                  }`}
                                >
                                  {e.spellDelivered ? '↩️ 切換為待發放' : '✅ 標記已發放'}
                                </button>
                              ) : (
                                <span className="text-gray-500 text-[10px]">待同仁選擇</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-gray-500">
                          查無符合條件之同仁紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* 9. 隊伍管理 Teams */}
        {activeTab === 'teams' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-[#ffd700]">👥 隊伍管理與自訂分隊中心</h2>
                <p className="text-xs text-[#8888aa] mt-0.5">
                  可新增、編輯隊伍成員、手動調配未組隊同仁，或一鍵自動為未組隊同仁分配組隊
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setTeamTabGroupFilter('all')}
                    className={`px-3 py-1 rounded ${
                      teamTabGroupFilter === 'all' ? 'bg-[#4a3a9a] text-white font-bold' : 'text-[#8888aa]'
                    }`}
                  >
                    全部 ({teams.filter((t) => !t.disbanded).length} 隊)
                  </button>
                  <button
                    onClick={() => setTeamTabGroupFilter('fat')}
                    className={`px-3 py-1 rounded ${
                      teamTabGroupFilter === 'fat' ? 'bg-orange-600 text-white font-bold' : 'text-[#8888aa]'
                    }`}
                  >
                    減脂組
                  </button>
                  <button
                    onClick={() => setTeamTabGroupFilter('muscle')}
                    className={`px-3 py-1 rounded ${
                      teamTabGroupFilter === 'muscle' ? 'bg-blue-600 text-white font-bold' : 'text-[#8888aa]'
                    }`}
                  >
                    增肌組
                  </button>
                </div>
                <button
                  onClick={() => handleOpenCreateTeam('fat')}
                  className="px-3 py-1.5 bg-orange-700 hover:bg-orange-600 active:scale-95 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                >
                  ➕ 建立減脂隊伍
                </button>
                <button
                  onClick={() => handleOpenCreateTeam('muscle')}
                  className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                >
                  ➕ 建立增肌隊伍
                </button>
                <button
                  onClick={() => handleAutoGroupUnassigned('fat', 3)}
                  className="px-3 py-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:brightness-110 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                >
                  ⚡ 減脂一鍵分隊
                </button>
                <button
                  onClick={() => handleAutoGroupUnassigned('muscle', 3)}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:brightness-110 text-white font-bold rounded-lg text-xs shadow flex items-center gap-1 transition-all"
                >
                  ⚡ 增肌一鍵分隊
                </button>
              </div>
            </div>

            {/* 未組隊同仁特別專區 */}
            {(() => {
              const unassignedList = getUnassignedEmployees(
                teamTabGroupFilter === 'all' ? undefined : teamTabGroupFilter
              );
              if (unassignedList.length === 0) return null;

              return (
                <div className="bg-[#1e1a2e] border border-amber-500/40 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold text-sm">
                        ⚠️ 尚未組隊同仁名單 ({unassignedList.length} 人)
                      </span>
                      <span className="text-[11px] text-[#aaaacc]">
                        可直接於右側下拉選單將同仁指派至現有隊伍，或點擊上方一鍵自動分隊
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {unassignedList.map((u) => {
                      const groupLabel = u.group === 'fat' ? '減脂' : '增肌';
                      const availableTeams = teams.filter(
                        (t) =>
                          !t.disbanded &&
                          ((t.group || employees.find((m) => m.empId === t.members[0])?.group) === u.group)
                      );

                      return (
                        <div
                          key={u.empId}
                          className="bg-[#111124] p-2.5 rounded-lg border border-[#2a2a4e] flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              <span className="text-[10px] text-[#8888aa]">({u.empId})</span>
                            </div>
                            <div className="text-[10px] text-[#aaaacc] flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`px-1 py-0.2 rounded font-bold ${
                                  u.group === 'fat' ? 'text-orange-400' : 'text-blue-400'
                                }`}
                              >
                                {groupLabel}
                              </span>
                              <span>•</span>
                              <span className="text-[#ffd700] font-bold">{u.totalPts || 0}分</span>
                            </div>
                          </div>
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleQuickAssignEmp(u.empId, e.target.value);
                              }
                            }}
                            className="text-[11px] bg-[#1a1a36] border border-purple-700/80 text-purple-200 rounded px-2 py-1 outline-none cursor-pointer"
                          >
                            <option value="">加入隊伍...</option>
                            <optgroup label="現有隊伍">
                              {availableTeams.map((t) => (
                                <option key={t.id} value={t.id}>
                                  🏴 {t.teamName} ({t.members.length}人)
                                </option>
                              ))}
                            </optgroup>
                            <option value="NEW">➕ 建立新隊伍...</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 隊伍卡片列表 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams
                .filter((t) => !t.disbanded)
                .filter((t) => {
                  if (teamTabGroupFilter === 'all') return true;
                  const inferred = t.group || employees.find((e) => e.empId === t.members[0])?.group;
                  return inferred === teamTabGroupFilter;
                })
                .map((t) => {
                  const inferredGroup = t.group || employees.find((e) => e.empId === t.members[0])?.group || 'fat';
                  const isFat = inferredGroup === 'fat';
                  const memberObjs = t.members.map((id) => employees.find((e) => e.empId === id)).filter(Boolean) as Employee[];
                  const avgPts = memberObjs.length > 0 ? Math.round(memberObjs.reduce((sum, m) => sum + (m.totalPts || 0), 0) / memberObjs.length) : 0;

                  return (
                    <div
                      key={t.id}
                      className={`bg-[#1a1a2e] border ${
                        isFat ? 'border-orange-500/30' : 'border-blue-500/30'
                      } p-4 rounded-xl space-y-3 shadow-md flex flex-col justify-between`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start border-b border-[#2a2a4a] pb-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-sm text-white">🏴 {t.teamName}</div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isFat ? 'bg-orange-950 text-orange-400 border border-orange-800' : 'bg-blue-950 text-blue-400 border border-blue-800'
                                }`}
                              >
                                {isFat ? '減脂組' : '增肌組'}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-2">
                              <span>邀請碼：<b className="text-gray-300">{t.inviteCode}</b></span>
                              <span>•</span>
                              <span className="text-[#ffd700] font-bold">平均總分：{avgPts} 分</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditTeam(t)}
                              className="px-2 py-1 bg-purple-800 hover:bg-purple-700 text-white rounded text-[10px] font-bold shadow"
                            >
                              ✏️ 編輯隊伍
                            </button>
                            <button
                              onClick={() => handleDisbandTeam(t.id, t.teamName)}
                              className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 rounded text-[10px] border border-red-800"
                            >
                              🗑️ 解散
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-xs text-[#8888aa] flex justify-between items-center">
                            <span>隊伍成員 ({t.members.length} 人):</span>
                            {t.members.length < 2 && (
                              <span className="text-[10px] text-amber-400">⚠️ 未滿2人無法獲獎</span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {t.members.map((mId) => {
                              const mEmp = employees.find((e) => e.empId === mId);
                              const isLeader = t.leaderId === mId;
                              return (
                                <div
                                  key={mId}
                                  className="flex justify-between items-center bg-[#0d0d1a] px-2.5 py-1.5 rounded border border-[#23233c] text-xs"
                                >
                                  <div className="flex items-center gap-1.5">
                                    {isLeader && (
                                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30">
                                        👑 隊長
                                      </span>
                                    )}
                                    <span className="font-bold text-white">
                                      {mEmp ? mEmp.name : mId}
                                    </span>
                                    <span className="text-[10px] text-[#8888aa]">({mId})</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[#ffd700] font-bold">
                                      {mEmp?.totalPts || 0} 分
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

      {/* 建立隊伍 Modal */}
      {isCreateTeamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-purple-500/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-[#2a2a4a] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">➕</span>
                <div>
                  <h3 className="font-bold text-white text-base">建立新隊伍與成員分組</h3>
                  <p className="text-[11px] text-[#8888aa]">為未組隊同仁建立隊伍，即時計算團體積分</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateTeamOpen(false)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-gray-300 font-bold mb-1">參賽組別</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTeamFormGroup('fat');
                      setTeamFormMembers([]);
                      setTeamFormLeaderId('');
                    }}
                    className={`py-2 rounded-lg font-bold border transition-all ${
                      teamFormGroup === 'fat'
                        ? 'bg-orange-600 border-orange-400 text-white shadow'
                        : 'bg-[#111122] border-[#2a2a4a] text-gray-400 hover:text-white'
                    }`}
                  >
                    🔥 減脂組
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTeamFormGroup('muscle');
                      setTeamFormMembers([]);
                      setTeamFormLeaderId('');
                    }}
                    className={`py-2 rounded-lg font-bold border transition-all ${
                      teamFormGroup === 'muscle'
                        ? 'bg-blue-600 border-blue-400 text-white shadow'
                        : 'bg-[#111122] border-[#2a2a4a] text-gray-400 hover:text-white'
                    }`}
                  >
                    💪 增肌組
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-bold mb-1">隊伍名稱</label>
                <input
                  type="text"
                  value={teamFormName}
                  onChange={(e) => setTeamFormName(e.target.value)}
                  placeholder="例如：減脂活力A隊"
                  className="w-full bg-[#0d0d1a] border border-[#3a3a6a] rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-gray-300 font-bold">
                    選擇隊員成員 ({teamFormMembers.length} 人已選，建議 2~5 人)
                  </label>
                  <span className="text-[10px] text-amber-300">※ 同仁若已在其他隊伍會自動移轉</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg">
                  {employees
                    .filter((e) => e.group === teamFormGroup)
                    .sort((a, b) => {
                      const aAssigned = getEmpTeam(a.empId);
                      const bAssigned = getEmpTeam(b.empId);
                      if (!aAssigned && bAssigned) return -1;
                      if (aAssigned && !bAssigned) return 1;
                      return (b.totalPts || 0) - (a.totalPts || 0);
                    })
                    .map((e) => {
                      const isSelected = teamFormMembers.includes(e.empId);
                      const existingTeam = getEmpTeam(e.empId);

                      return (
                        <label
                          key={e.empId}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-purple-950/70 border border-purple-600 text-white'
                              : 'bg-[#18182e] border border-transparent text-gray-300 hover:bg-[#222240]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(ev) => {
                                if (ev.target.checked) {
                                  setTeamFormMembers([...teamFormMembers, e.empId]);
                                  if (!teamFormLeaderId) setTeamFormLeaderId(e.empId);
                                } else {
                                  const updated = teamFormMembers.filter((id) => id !== e.empId);
                                  setTeamFormMembers(updated);
                                  if (teamFormLeaderId === e.empId) {
                                    setTeamFormLeaderId(updated[0] || '');
                                  }
                                }
                              }}
                              className="accent-purple-500 rounded cursor-pointer"
                            />
                            <span className="font-bold">{e.name}</span>
                            <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                            <span className="text-[#ffd700] text-[11px] font-bold">
                              {e.totalPts || 0}分
                            </span>
                          </div>
                          <div>
                            {existingTeam ? (
                              <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                現屬：{existingTeam.teamName}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
                                ⚠️ 未組隊
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {teamFormMembers.length > 0 && (
                <div>
                  <label className="block text-gray-300 font-bold mb-1">指定隊長</label>
                  <select
                    value={teamFormLeaderId}
                    onChange={(e) => setTeamFormLeaderId(e.target.value)}
                    className="w-full bg-[#0d0d1a] border border-[#3a3a6a] rounded-lg px-3 py-2 text-white outline-none"
                  >
                    {teamFormMembers.map((mId) => {
                      const emp = employees.find((e) => e.empId === mId);
                      return (
                        <option key={mId} value={mId}>
                          👑 {emp ? emp.name : mId} ({mId})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2a2a4a] pt-3">
              <button
                type="button"
                onClick={() => setIsCreateTeamOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-lg text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateTeamSubmit}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg text-xs shadow-md"
              >
                確定建立隊伍
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯隊伍 Modal */}
      {isEditTeamOpen && editingTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-purple-500/50 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-5 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center border-b border-[#2a2a4a] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <div>
                  <h3 className="font-bold text-white text-base">編輯隊伍與調配成員</h3>
                  <p className="text-[11px] text-[#8888aa]">調整「{editingTeam.teamName}」隊伍名稱、隊長與隊員清單</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsEditTeamOpen(false);
                  setEditingTeam(null);
                }}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 font-bold mb-1">參賽組別</label>
                  <select
                    value={teamFormGroup}
                    onChange={(e) => setTeamFormGroup(e.target.value as any)}
                    className="w-full bg-[#0d0d1a] border border-[#3a3a6a] rounded-lg px-3 py-2 text-white outline-none"
                  >
                    <option value="fat">🔥 減脂組</option>
                    <option value="muscle">💪 增肌組</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-bold mb-1">隊伍名稱</label>
                  <input
                    type="text"
                    value={teamFormName}
                    onChange={(e) => setTeamFormName(e.target.value)}
                    className="w-full bg-[#0d0d1a] border border-[#3a3a6a] rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-gray-300 font-bold">
                    隊伍成員名冊 ({teamFormMembers.length} 人，勾選可新增同仁，取消勾選可移出)
                  </label>
                  <span className="text-[10px] text-purple-300">
                    目前平均：
                    {teamFormMembers.length > 0
                      ? Math.round(
                          teamFormMembers.reduce(
                            (sum, id) => sum + (employees.find((e) => e.empId === id)?.totalPts || 0),
                            0
                          ) / teamFormMembers.length
                        )
                      : 0}{' '}
                    分
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 p-2 bg-[#0d0d1a] border border-[#2a2a4a] rounded-lg">
                  {employees
                    .filter((e) => e.group === teamFormGroup)
                    .sort((a, b) => {
                      const aInTeam = teamFormMembers.includes(a.empId);
                      const bInTeam = teamFormMembers.includes(b.empId);
                      if (aInTeam && !bInTeam) return -1;
                      if (!aInTeam && bInTeam) return 1;
                      return (b.totalPts || 0) - (a.totalPts || 0);
                    })
                    .map((e) => {
                      const isSelected = teamFormMembers.includes(e.empId);
                      const otherTeam = teams.find(
                        (t) => !t.disbanded && t.id !== editingTeam.id && (t.members || []).includes(e.empId)
                      );

                      return (
                        <label
                          key={e.empId}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-purple-950/80 border border-purple-500 text-white'
                              : 'bg-[#18182e] border border-transparent text-gray-300 hover:bg-[#222240]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(ev) => {
                                if (ev.target.checked) {
                                  setTeamFormMembers([...teamFormMembers, e.empId]);
                                  if (!teamFormLeaderId) setTeamFormLeaderId(e.empId);
                                } else {
                                  const updated = teamFormMembers.filter((id) => id !== e.empId);
                                  setTeamFormMembers(updated);
                                  if (teamFormLeaderId === e.empId) {
                                    setTeamFormLeaderId(updated[0] || '');
                                  }
                                }
                              }}
                              className="accent-purple-500 rounded cursor-pointer"
                            />
                            <span className="font-bold">{e.name}</span>
                            <span className="text-[10px] text-[#8888aa]">({e.empId})</span>
                            <span className="text-[#ffd700] text-[11px] font-bold">
                              {e.totalPts || 0}分
                            </span>
                          </div>
                          <div>
                            {isSelected ? (
                              <span className="text-[10px] text-emerald-300 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                                本隊隊員
                              </span>
                            ) : otherTeam ? (
                              <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">
                                現屬：{otherTeam.teamName}
                              </span>
                            ) : (
                              <span className="text-[10px] text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60">
                                ⚠️ 未組隊
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {teamFormMembers.length > 0 && (
                <div>
                  <label className="block text-gray-300 font-bold mb-1">指定隊長</label>
                  <select
                    value={teamFormLeaderId}
                    onChange={(e) => setTeamFormLeaderId(e.target.value)}
                    className="w-full bg-[#0d0d1a] border border-[#3a3a6a] rounded-lg px-3 py-2 text-white outline-none"
                  >
                    {teamFormMembers.map((mId) => {
                      const emp = employees.find((e) => e.empId === mId);
                      return (
                        <option key={mId} value={mId}>
                          👑 {emp ? emp.name : mId} ({mId})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2a2a4a] pt-3">
              <button
                type="button"
                onClick={() => {
                  setIsEditTeamOpen(false);
                  setEditingTeam(null);
                }}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded-lg text-xs"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEditTeamSubmit}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg text-xs shadow-md"
              >
                儲存更新隊伍
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

