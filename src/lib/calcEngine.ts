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
