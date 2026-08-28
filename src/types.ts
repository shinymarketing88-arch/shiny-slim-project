export type GroupType = 'fat' | 'muscle' | '';

export type GenderType = 'male' | 'female';
export type AgeGroupType = 'under40' | 'age40to49' | 'age50plus';

export interface Employee {
  empId: string;
  name: string;
  group: GroupType;
  charId: string;
  nickname: string;
  taskPts: number;
  inbodyPts: number;
  rankPts: number;
  totalPts: number;
  letters: string[];
  target: string;
  targetVal: number;
  currentGap: number;
  consecutiveDays: number;
  jellyCount: number;
  jellyDelivered?: number;
  weeklyDiet: number;
  weeklySport: number;
  weeklyHealth: number;
  lastWeek: number;
  lastDietDate: string;
  gender?: GenderType;
  ageGroup?: AgeGroupType;
  bodyResult?: number;
  bodyRank?: number;
  p22Target?: number;
  isGoalMet?: boolean;
  isMinPtsMet?: boolean;
  achievementAward?: boolean;
  individualAward?: string;
  individualAwardRank?: number;
  individualAwardPrize?: number;
  registeredAt?: any;
  createdAt?: any;
  completionReward?: string;
  completionRewardAt?: any;
  completionDelivered?: boolean;
  completionDeliveredAt?: any;
  spellReward?: string;
  spellRewardAt?: any;
  spellDelivered?: boolean;
  spellDeliveredAt?: any;
  adminLogs?: string[];
  updatedByAdmin?: boolean;
  adminEditAt?: any;
  adminEditBy?: string;
}

export interface Checkin {
  id?: string;
  empId: string;
  empName: string;
  taskType: '飲食打卡' | '健康飲食' | '運動打卡' | '照片心得' | string;
  pts?: number;
  earnedPts?: number;
  fileUrl?: string;
  status: '待審核' | '通過' | '補登通過' | '駁回' | '已刪除' | '已重置';
  createdAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
  isMakeup?: boolean;
  isCrit?: boolean;
  makeupDate?: string;
  makeupReason?: string;
  makeupBy?: string;
  deletedAt?: any;
  deletedBy?: string;
}

export interface Team {
  id: string;
  teamName: string;
  group?: GroupType;
  inviteCode: string;
  leaderId: string;
  members: string[];
  disbanded?: boolean;
  createdAt?: any;
}

export interface TeamResult {
  teamId: string;
  teamName: string;
  group: GroupType;
  memberIds: string[];
  members: Employee[];
  avgTotalPts: number;
  avgBodyResult: number;
  isAllMembersMinPtsMet: boolean;
  isAvgGoalMet: boolean;
  isQualified: boolean;
  rank?: number;
  awardName?: string;
  prizePerMember?: number;
}

export interface SystemSettings {
  activityName?: string;
  startDate?: string;
  endDate?: string;
  totalDays?: number;
  dietPts?: number;
  photoEssayPts?: number;
  ptsPerLetter?: number;
  jellyConsecutiveDays?: number;
  jellyMaxCount?: number;
  muscleT1Kg?: number; muscleT1Pts?: number;
  muscleT2Kg?: number; muscleT2Pts?: number;
  muscleT3Kg?: number; muscleT3Pts?: number;
  fatT1Pct?: number; fatT1Pts?: number;
  fatT2Pct?: number; fatT2Pts?: number;
  fatT3Pct?: number; fatT3Pts?: number;
  rank1Pts?: number; rank2Pts?: number; rank3Pts?: number;
  completionMinPts?: number;
  activityMinPts?: number;
  updatedAt?: any;
}
