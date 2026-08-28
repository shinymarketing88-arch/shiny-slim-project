import { Checkin, Employee } from '../types';

export const SPORT_PTS_MAP = [1, 1, 3, 1, 1, 3, 0];
export const PTS_PER_LETTER = 8;
export const TARGET_WORD = 'SHINYBRANDS';

export function getRandomLetter(currentLetters: string[]): string | null {
  const current = [...currentLetters];
  const remaining = TARGET_WORD.split('').filter((l) => {
    const idx = current.indexOf(l);
    if (idx !== -1) {
      current.splice(idx, 1);
      return false;
    }
    return true;
  });
  return remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : null;
}

export interface CalculatedStats {
  taskPts: number;
  totalPts: number;
  weeklyDiet: number;
  weeklySport: number;
  weeklyHealth: number;
  consecutiveDays: number;
  lastDietDate: string;
  jellyCount: number;
  lastWeek: number;
  letters: string[];
}

export interface CalculatedCheckin extends Checkin {
  earnedPts: number;
  isCrit?: boolean;
}

/**
 * 依週次與時間順序計算每筆打卡之實際得分與爆擊狀態
 */
export function attachCalculatedPointsToCheckins(
  checkins: Checkin[],
  startDateStr: string = '2026-07-13'
): CalculatedCheckin[] {
  const activityStart = new Date(startDateStr);

  // 按時間升冪排序進行幾分計算
  const sorted = [...checkins].sort((a, b) => {
    const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
    const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });

  // 依員工分組個別計算每週紀錄
  const empMap: Record<string, Checkin[]> = {};
  sorted.forEach((c) => {
    const key = c.empId || 'unknown';
    if (!empMap[key]) empMap[key] = [];
    empMap[key].push(c);
  });

  const resultMap = new Map<string | Checkin, CalculatedCheckin>();

  Object.values(empMap).forEach((empCheckins) => {
    let weeklySport = 0;
    let weeklyHealthCount = 0;
    let lastWk = -1;

    empCheckins.forEach((c) => {
      const uploadTime = c.createdAt?.seconds
        ? c.createdAt.seconds * 1000
        : new Date(c.createdAt || Date.now()).getTime();
      const uploadDate = new Date(uploadTime);
      const daysSince = Math.floor((uploadDate.getTime() - activityStart.getTime()) / 86400000);
      const wk = daysSince >= 0 ? Math.floor(daysSince / 7) : 0;

      if (wk > lastWk) {
        weeklySport = 0;
        weeklyHealthCount = 0;
        lastWk = wk;
      }

      let earnedPts = 0;
      let isCrit = false;

      const isPassed = c.status === '通過' || c.status === '補登通過';

      if (isPassed) {
        if (c.taskType === '運動打卡') {
          earnedPts = SPORT_PTS_MAP[Math.min(weeklySport, 6)];
          if (earnedPts === 3) isCrit = true;
          weeklySport++;
        } else if (c.taskType === '健康飲食') {
          weeklyHealthCount++;
          if (weeklyHealthCount === 4) {
            earnedPts = 4;
            isCrit = true;
          } else if (weeklyHealthCount > 4 && weeklyHealthCount <= 7) {
            earnedPts = 2;
          } else {
            earnedPts = 0;
          }
        } else if (c.taskType === '飲食打卡') {
          earnedPts = 1;
        } else if (c.taskType === '照片心得') {
          earnedPts = 5;
        } else {
          earnedPts = c.pts || 1;
        }
      } else {
        earnedPts = 0;
      }

      const calculated: CalculatedCheckin = {
        ...c,
        earnedPts,
        isCrit,
      };

      if (c.id) {
        resultMap.set(c.id, calculated);
      } else {
        resultMap.set(c, calculated);
      }
    });
  });

  return checkins.map((c) => (c.id ? resultMap.get(c.id) : resultMap.get(c)) || { ...c, earnedPts: c.pts || 0 });
}

/**
 * 統一精確計算引擎
 * 傳入員工舊資料與該員工所有「通過」或「補登通過」的打卡紀錄
 */
export function calculateEmployeeStats(
  empData: Partial<Employee>,
  approvedCheckins: Checkin[],
  startDateStr: string = '2026-07-13'
): CalculatedStats {
  const activityStart = new Date(startDateStr);
  const now = new Date();

  // 按上傳日期升冪排序
  const sorted = [...approvedCheckins].sort((a, b) => {
    const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
    const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });

  let taskPts = 0;
  let weeklyDiet = 0;
  let weeklySport = 0;
  let weeklyHealthCount = 0;
  let lastWk = -1;
  let consecutiveDays = 0;
  let lastDietDate = '';
  let jellyCount = 0;

  sorted.forEach((c) => {
    const uploadTime = c.createdAt?.seconds
      ? c.createdAt.seconds * 1000
      : new Date(c.createdAt || Date.now()).getTime();
    const uploadDate = new Date(uploadTime);
    const uploadDateStr = uploadDate.toDateString();

    const daysSince = Math.floor((uploadDate.getTime() - activityStart.getTime()) / 86400000);
    const wk = daysSince >= 0 ? Math.floor(daysSince / 7) : 0;

    // 進入新的一週時，重置每週計數
    if (wk > lastWk) {
      weeklyDiet = 0;
      weeklySport = 0;
      weeklyHealthCount = 0;
      lastWk = wk;
    }

    let pts = 0;
    if (c.taskType === '飲食打卡') {
      pts = 1;
      weeklyDiet++;
      const yesterdayStr = new Date(uploadDate.getTime() - 86400000).toDateString();
      if (lastDietDate === yesterdayStr) {
        consecutiveDays++;
      } else if (lastDietDate !== uploadDateStr) {
        consecutiveDays = 1;
      }
      lastDietDate = uploadDateStr;

      if (consecutiveDays > 0 && consecutiveDays % 10 === 0 && jellyCount < 4) {
        jellyCount++;
      }
    } else if (c.taskType === '運動打卡') {
      pts = SPORT_PTS_MAP[Math.min(weeklySport, 6)];
      weeklySport++;
    } else if (c.taskType === '健康飲食') {
      weeklyHealthCount++;
      if (weeklyHealthCount === 4) {
        pts = 4; // 第 4 次達到門檻一次獲得 4 分
      } else if (weeklyHealthCount > 4 && weeklyHealthCount <= 7) {
        pts = 2; // 第 5~7 次每次加 2 分
      } else {
        pts = 0; // 第 1~3 次與 7 次以上皆為 0 分
      }
    } else if (c.taskType === '照片心得') {
      pts = 5;
    } else {
      pts = c.pts || 1;
    }

    taskPts += pts;
  });

  const inbodyPts = empData.inbodyPts || 0;
  const rankPts = empData.rankPts || 0;
  const totalPts = taskPts + inbodyPts + rankPts;

  // 計算應獲得的字母
  const shouldHaveLetters = Math.floor(totalPts / PTS_PER_LETTER);
  let letters = [...(empData.letters || [])];

  if (letters.length > shouldHaveLetters) {
    letters = letters.slice(0, shouldHaveLetters);
  } else {
    while (letters.length < shouldHaveLetters) {
      const l = getRandomLetter([...letters]);
      if (l) {
        letters.push(l);
      } else {
        break;
      }
    }
  }

  // 目前週次
  const nowDaysSince = Math.floor((now.getTime() - activityStart.getTime()) / 86400000);
  const currentWeek = nowDaysSince >= 0 ? Math.floor(nowDaysSince / 7) : 0;

  return {
    taskPts,
    totalPts,
    weeklyDiet,
    weeklySport,
    weeklyHealth: weeklyHealthCount,
    consecutiveDays,
    lastDietDate,
    jellyCount,
    lastWeek: Math.max(0, lastWk, currentWeek),
    letters,
  };
}

/**
 * 取得 P22 年齡與性別對應之目標標準
 */
export function getP22Target(
  group: 'fat' | 'muscle' | string,
  gender?: 'male' | 'female' | string,
  ageGroup?: 'under40' | 'age40to49' | 'age50plus' | string
): number {
  const isMale = gender === 'male';
  const age = ageGroup || 'under40';

  if (group === 'muscle') {
    // 增肌目標 (kg)
    if (age === '50plus') return isMale ? 0.6 : 0.4;
    if (age === 'age40to49') return isMale ? 0.8 : 0.6;
    return isMale ? 1.0 : 0.8; // 40歲以下
  } else {
    // 減脂目標 (%)
    if (age === '50plus') return isMale ? 2.7 : 2.4;
    if (age === 'age40to49') return isMale ? 3.0 : 2.7;
    return isMale ? 3.3 : 3.0; // 40歲以下
  }
}

/**
 * 非前三名體態成果 (依級距計分)
 * 增肌組: >=1.0kg: 20分, >=0.6kg: 15分, >=0.2kg: 10分, <0.2kg: 0分
 * 減脂組: >=3.5%: 20分, >=2.5%: 15分, >=1.5%: 10分, <1.5%: 0分
 */
export function getTierInbodyPoints(group: 'fat' | 'muscle' | string, result: number): number {
  if (group === 'muscle') {
    if (result >= 1.0) return 20;
    if (result >= 0.6) return 15;
    if (result >= 0.2) return 10;
    return 0;
  } else if (group === 'fat') {
    if (result >= 3.5) return 20;
    if (result >= 2.5) return 15;
    if (result >= 1.5) return 10;
    return 0;
  }
  return 0;
}

export interface TournamentCalculationOutput {
  updatedEmployees: Employee[];
  fatRankings: Employee[];
  muscleRankings: Employee[];
  achievementWinners: Employee[];
  individualFatWinners: Employee[];
  individualMuscleWinners: Employee[];
  fatTeamResults: import('../types').TeamResult[];
  muscleTeamResults: import('../types').TeamResult[];
  fatTeamWinners: import('../types').TeamResult[];
  muscleTeamWinners: import('../types').TeamResult[];
  stats: {
    totalParticipants: number;
    fatCount: number;
    muscleCount: number;
    achievementCount: number;
    totalPrizePool: number;
  };
}

/**
 * 8/27 賽事結算：名次自動計算模組
 * 包含體態成果名次分/級距分、個人總分排名 (同分比序體態成果)、達標檢核、競賽獎與團體獎
 */
export function calculateTournamentResults(
  employees: Employee[],
  teams: import('../types').Team[] = [],
  settings?: import('../types').SystemSettings
): TournamentCalculationOutput {
  const minPtsRequired = settings?.activityMinPts || settings?.completionMinPts || 45;

  // 1. 預處理每位同仁的體態成果 bodyResult、P22標準與達標狀態
  const participants = employees
    .filter((e) => e.group === 'fat' || e.group === 'muscle')
    .map((e) => {
      // 成果值：若有手動填寫 bodyResult 優先；否則由 targetVal 與 currentGap 計算
      let bodyResult = e.bodyResult;
      if (bodyResult === undefined || bodyResult === null) {
        if (e.targetVal > 0 && e.currentGap !== undefined) {
          bodyResult = Math.max(0, parseFloat((e.targetVal - e.currentGap).toFixed(2)));
        } else {
          bodyResult = 0;
        }
      }

      const p22Target = getP22Target(e.group, e.gender, e.ageGroup);
      const isGoalMet = bodyResult >= p22Target;

      return {
        ...e,
        bodyResult,
        p22Target,
        isGoalMet,
      };
    });

  // 2. 分組計算體態成果名次分 (Top 3 或 Top 2) 與非前三名級距分
  const fatGroupList = participants
    .filter((e) => e.group === 'fat')
    .sort((a, b) => (b.bodyResult || 0) - (a.bodyResult || 0));

  const muscleGroupList = participants
    .filter((e) => e.group === 'muscle')
    .sort((a, b) => (b.bodyResult || 0) - (a.bodyResult || 0));

  // 減脂組體態名次加分 (前三名 40/35/30，其餘級距 20/15/10/0)
  const rankScores = [settings?.rank1Pts || 40, settings?.rank2Pts || 35, settings?.rank3Pts || 30];

  fatGroupList.forEach((e, idx) => {
    e.bodyRank = idx + 1;
    if (idx < 3) {
      e.rankPts = rankScores[idx];
      e.inbodyPts = 0;
    } else {
      e.rankPts = 0;
      e.inbodyPts = getTierInbodyPoints('fat', e.bodyResult || 0);
    }
    e.totalPts = (e.taskPts || 0) + (e.rankPts || 0) + (e.inbodyPts || 0);
    e.isMinPtsMet = e.totalPts >= minPtsRequired;
    e.achievementAward = e.isGoalMet && e.isMinPtsMet;
  });

  // 增肌組體態名次加分 (若未滿 15 人則僅取前 2 名，其餘級距 20/15/10/0)
  const muscleRankCap = muscleGroupList.length < 15 ? 2 : 3;

  muscleGroupList.forEach((e, idx) => {
    e.bodyRank = idx + 1;
    if (idx < muscleRankCap) {
      e.rankPts = rankScores[idx];
      e.inbodyPts = 0;
    } else {
      e.rankPts = 0;
      e.inbodyPts = getTierInbodyPoints('muscle', e.bodyResult || 0);
    }
    e.totalPts = (e.taskPts || 0) + (e.rankPts || 0) + (e.inbodyPts || 0);
    e.isMinPtsMet = e.totalPts >= minPtsRequired;
    e.achievementAward = e.isGoalMet && e.isMinPtsMet;
  });

  // 3. 個人競賽獎排序與得獎判定 (總積分最高者，同分比序最終增肌/減脂具體數值)
  // 必須符合：體態達標 (isGoalMet) 且 達到活動最低積分要求 45分 (isMinPtsMet)
  const sortForIndividualCompetition = (a: Employee, b: Employee) => {
    // 1. 總積分降冪
    if ((b.totalPts || 0) !== (a.totalPts || 0)) {
      return (b.totalPts || 0) - (a.totalPts || 0);
    }
    // 2. 同分時：比序最終增肌/減脂具體數值降冪
    return (b.bodyResult || 0) - (a.bodyResult || 0);
  };

  const sortedFatForIndividual = [...fatGroupList].sort(sortForIndividualCompetition);
  const sortedMuscleForIndividual = [...muscleGroupList].sort(sortForIndividualCompetition);

  // 分配減脂組個人競賽獎
  const individualFatWinners: Employee[] = [];
  const fatPrizes = [10000, 6000, 3000];
  const fatPrizeNames = ['減脂組 冠軍 ($10,000)', '減脂組 亞軍 ($6,000)', '減脂組 季軍 ($3,000)'];

  let fatAwardIndex = 0;
  for (const emp of sortedFatForIndividual) {
    if (emp.isGoalMet && emp.isMinPtsMet && fatAwardIndex < 3) {
      emp.individualAwardRank = fatAwardIndex + 1;
      emp.individualAwardPrize = fatPrizes[fatAwardIndex];
      emp.individualAward = fatPrizeNames[fatAwardIndex];
      individualFatWinners.push(emp);
      fatAwardIndex++;
    } else {
      emp.individualAwardRank = undefined;
      emp.individualAwardPrize = undefined;
      emp.individualAward = undefined;
    }
  }

  // 分配增肌組個人競賽獎 (若未達15人則僅取前 2 名)
  const individualMuscleWinners: Employee[] = [];
  const musclePrizes = muscleGroupList.length < 15 ? [10000, 6000] : [10000, 6000, 3000];
  const musclePrizeNames =
    muscleGroupList.length < 15
      ? ['增肌組 冠軍 ($10,000)', '增肌組 亞軍 ($6,000)']
      : ['增肌組 冠軍 ($10,000)', '增肌組 亞軍 ($6,000)', '增肌組 季軍 ($3,000)'];

  let muscleAwardIndex = 0;
  for (const emp of sortedMuscleForIndividual) {
    if (emp.isGoalMet && emp.isMinPtsMet && muscleAwardIndex < musclePrizes.length) {
      emp.individualAwardRank = muscleAwardIndex + 1;
      emp.individualAwardPrize = musclePrizes[muscleAwardIndex];
      emp.individualAward = musclePrizeNames[muscleAwardIndex];
      individualMuscleWinners.push(emp);
      muscleAwardIndex++;
    } else {
      emp.individualAwardRank = undefined;
      emp.individualAwardPrize = undefined;
      emp.individualAward = undefined;
    }
  }

  // 4. 達標獎名單 (P22 達標且 >= 45 分)
  const allUpdated = [...fatGroupList, ...muscleGroupList];
  const achievementWinners = allUpdated.filter((e) => e.achievementAward);

  // 建立員工快速查找表以利隊伍計算
  const empLookup = new Map<string, Employee>();
  allUpdated.forEach((e) => empLookup.set(e.empId, e));

  // 5. 團體競賽獎結算 (2-5人隊伍，平均積分最高前2組，同分比序平均增肌/減脂數值)
  const activeTeams = (teams || []).filter((t) => !t.disbanded && (t.members?.length || 0) >= 1);

  const teamResults: import('../types').TeamResult[] = activeTeams.map((t) => {
    const memberObjs = (t.members || []).map((id) => empLookup.get(id)).filter(Boolean) as Employee[];
    const group = (t.group || memberObjs[0]?.group || 'fat') as import('../types').GroupType;
    const totalPtsSum = memberObjs.reduce((sum, m) => sum + (m.totalPts || 0), 0);
    const bodyResultSum = memberObjs.reduce((sum, m) => sum + (m.bodyResult || 0), 0);
    const targetSum = memberObjs.reduce((sum, m) => sum + (m.p22Target || 0), 0);

    const count = memberObjs.length || 1;
    const avgTotalPts = parseFloat((totalPtsSum / count).toFixed(2));
    const avgBodyResult = parseFloat((bodyResultSum / count).toFixed(2));
    const avgTarget = parseFloat((targetSum / count).toFixed(2));

    const isAllMembersMinPtsMet = memberObjs.length > 0 && memberObjs.every((m) => (m.totalPts || 0) >= minPtsRequired);
    const isAvgGoalMet = avgBodyResult >= avgTarget;
    // 競賽標準：全員滿 45 分 + 平均達標 + 隊伍人數符合 2-5 人
    const isQualified = isAllMembersMinPtsMet && isAvgGoalMet && memberObjs.length >= 2 && memberObjs.length <= 5;

    return {
      teamId: t.id,
      teamName: t.teamName,
      group,
      memberIds: t.members || [],
      members: memberObjs,
      avgTotalPts,
      avgBodyResult,
      isAllMembersMinPtsMet,
      isAvgGoalMet,
      isQualified,
    };
  });

  const sortTeamResults = (a: import('../types').TeamResult, b: import('../types').TeamResult) => {
    if (b.avgTotalPts !== a.avgTotalPts) {
      return b.avgTotalPts - a.avgTotalPts;
    }
    return b.avgBodyResult - a.avgBodyResult;
  };

  const fatTeamResults = teamResults.filter((t) => t.group === 'fat').sort(sortTeamResults);
  const muscleTeamResults = teamResults.filter((t) => t.group === 'muscle').sort(sortTeamResults);

  // 判定減脂組獲獎隊伍 (取前 2 組符合資格者)
  const fatTeamWinners: import('../types').TeamResult[] = [];
  const teamPrizeAmounts = [3000, 2000];
  const teamPrizeTitles = ['團體賽 冠軍 (每人 $3,000)', '團體賽 亞軍 (每人 $2,000)'];

  let fatTeamRank = 0;
  fatTeamResults.forEach((tr) => {
    if (tr.isQualified && fatTeamRank < 2) {
      tr.rank = fatTeamRank + 1;
      tr.awardName = teamPrizeTitles[fatTeamRank];
      tr.prizePerMember = teamPrizeAmounts[fatTeamRank];
      fatTeamWinners.push(tr);
      fatTeamRank++;
    }
  });

  // 判定增肌組獲獎隊伍 (取前 2 組符合資格者)
  const muscleTeamWinners: import('../types').TeamResult[] = [];
  let muscleTeamRank = 0;
  muscleTeamResults.forEach((tr) => {
    if (tr.isQualified && muscleTeamRank < 2) {
      tr.rank = muscleTeamRank + 1;
      tr.awardName = teamPrizeTitles[muscleTeamRank];
      tr.prizePerMember = teamPrizeAmounts[muscleTeamRank];
      muscleTeamWinners.push(tr);
      muscleTeamRank++;
    }
  });

  // 重新拼裝全體員工清單 (包含未分組者)
  const finalUpdatedEmps = employees.map((e) => {
    const updated = empLookup.get(e.empId);
    return updated || e;
  });

  // 計算總頒發獎金統計
  let totalPrizePool = 0;
  // 達標獎 ($2,000 / 人)
  totalPrizePool += achievementWinners.length * 2000;
  // 個人競賽獎
  individualFatWinners.forEach((w) => (totalPrizePool += w.individualAwardPrize || 0));
  individualMuscleWinners.forEach((w) => (totalPrizePool += w.individualAwardPrize || 0));
  // 團體競賽獎
  fatTeamWinners.forEach((tw) => (totalPrizePool += (tw.prizePerMember || 0) * tw.members.length));
  muscleTeamWinners.forEach((tw) => (totalPrizePool += (tw.prizePerMember || 0) * tw.members.length));

  return {
    updatedEmployees: finalUpdatedEmps,
    fatRankings: sortedFatForIndividual,
    muscleRankings: sortedMuscleForIndividual,
    achievementWinners,
    individualFatWinners,
    individualMuscleWinners,
    fatTeamResults,
    muscleTeamResults,
    fatTeamWinners,
    muscleTeamWinners,
    stats: {
      totalParticipants: participants.length,
      fatCount: fatGroupList.length,
      muscleCount: muscleGroupList.length,
      achievementCount: achievementWinners.length,
      totalPrizePool,
    },
  };
}
