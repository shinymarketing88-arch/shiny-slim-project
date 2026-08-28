import * as fs from 'fs';
import * as path from 'path';

// 1. Task Points Map
const memberDataRaw = `
SM0005,吳偲瑜,🤫,減脂組,56,0,0,56,1,2,2,7
SM0012,李芮綺,RRR,減脂組,169,0,0,169,45,4,4,11
SM0027,張芷婷,珍奶娜🧋,減脂組,158,0,0,158,45,4,4,11
SM0042,李怡慧,Vera,減脂組,10,0,0,10,1,0,0,1
SM0046,呂思佳,阿拉斯加,減脂組,91,0,0,91,2,1,1,11
SM0049,林盈杏,Vk,減脂組,71,0,0,71,1,1,1,8
SM0052,方宓菁,蘇肥,減脂組,157,0,0,157,39,3,3,11
SM0054,柳季雯,Ava,減脂組,155,0,0,155,18,3,3,11
SM0063,李蓓韻,脂肪掰掰,減脂組,36,0,0,36,1,0,0,4
SM0064,陳育萱,脂肪掰掰,減脂組,1,0,0,1,1,0,0,0
VE0005,呂靈慧,請你離開,減脂組,91,0,0,91,1,3,0,11
VE0008,游智盛,強森,減脂組,17,0,0,17,1,0,0,2
VE0016,張曉美,Hidomi,減脂組,155,0,0,155,45,4,4,11
VE0018,林湘慈,Joanna,減脂組,63,0,0,63,1,1,1,7
VE0026,林佳慧,E,減脂組,0,0,0,0,0,0,0,0
VE0028,莫舒涵,Momo,減脂組,30,0,0,30,1,0,0,3
VE0034,張丞萱,阿芙,減脂組,112,0,0,112,36,3,3,11
VE0035,鄭琦霏,阿芙,減脂組,0,0,0,0,0,0,0,0
VE0107,劉冠萱,背光向日葵,減脂組,132,0,0,132,2,4,4,11
VE0128,范紋綾,失控的胖子,減脂組,171,0,0,171,45,4,1,11
VE0166,洪淨珮,Peggy,減脂組,88,0,0,88,4,1,0,11
VE0176,許書銘,豬銘,減脂組,148,0,0,148,10,4,2,11
VE0178,周惠雯,deeeeeee,減脂組,123,0,0,123,3,3,3,11
VE0181,高敏敏,喝酒誤事,減脂組,95,0,0,95,4,1,1,11
VE0183,徐慧玲,Pannie,減脂組,128,0,0,128,1,3,3,11
VE0197,陳緯浩,浩浩,減脂組,20,0,0,20,3,0,0,2
VE0203,簡辰芳,VE0203,減脂組,102,0,0,102,4,3,3,11
VE0212,曾毓萱,Lily,減脂組,74,0,0,74,10,2,2,9
VE0218,戴妤庭,戴油庭,減脂組,173,0,0,173,45,4,4,11
VE0219,林聖傑,蘆洲主委,減脂組,134,0,0,134,2,0,0,11
VE0221,賴若宣,小若,減脂組,140,0,0,140,4,3,3,11
VE0226,古秉翰,咕咕咕,減脂組,121,0,0,121,3,1,1,11
VE0233,于智偉,偉哥,減脂組,37,0,0,37,11,2,2,4
VE0240,王素卿,天使,減脂組,0,0,0,0,0,0,0,0
VE0241,張家獻,Allen,減脂組,89,0,0,89,1,1,1,11
VE0265,張初安,Kelly,減脂組,46,0,0,46,1,0,0,5
VE0266,陳玟育,Mina,減脂組,160,0,0,160,3,3,3,11
VE0287,李季芹,不能喝飲料,減脂組,67,0,0,67,2,1,1,8
VE0288,林姿妤,Joyce,減脂組,107,0,0,107,2,4,4,11
VE0297,陳湘湘,🐻🤓,減脂組,169,0,0,169,45,4,4,11
VE0301,鄭凱中,沒意思,減脂組,175,0,0,175,45,4,4,11
VE0305,黃靖雅,蘿娜比娜,減脂組,52,0,0,52,3,1,1,6
VE0306,顏劭宇,Annie,減脂組,1,0,0,1,1,0,0,0
SM0001,楊博鈞,Jonas,增肌組,72,0,0,72,4,1,1,9
SM0033,黃柔云,~!@#$%^&,增肌組,45,0,0,45,3,1,1,5
SM0062,張健威,肯特,增肌組,167,0,0,167,45,4,4,11
SM0073,陳怡安,AnnChen,增肌組,45,0,0,45,10,1,0,5
VE0142,方妍羽,Julia,增肌組,131,0,0,131,2,2,2,11
VE0171,張翊君,螺絲肌,增肌組,51,0,0,51,2,0,0,6
VE0173,鄭怡芳,嘿九,增肌組,1,0,0,1,0,0,0,0
VE0179,吳冠蓁,jenny,增肌組,57,0,0,57,14,2,2,7
VE0188,廖婉妤,葛蕾,增肌組,82,0,0,82,1,1,1,10
VE0232,蔡曉嵐,肌不擇食,增肌組,53,0,0,53,2,0,0,6
VE0268,徐淑貞,貞,增肌組,76,0,0,76,22,3,3,9
VE0269,鍾利羚,好棒棒,增肌組,146,0,0,146,34,4,4,11
VE0276,王靖惠,拍,增肌組,63,0,0,63,26,2,2,7
VE0278,施惠菁,Brinaaa,增肌組,1,0,0,1,1,0,0,0
VE0296,黃寶螢,Cindy,增肌組,123,0,0,123,2,3,3,11
VE0299,TRAN TRI BAO陳智寶,J,增肌組,6,0,0,6,2,0,0,0
VE0300,NGUYEN THI HONG YEN阮氏紅燕,Sylvia,增肌組,119,0,0,119,1,2,2,11
VE0304,蘇采妍,中年少女,增肌組,9,0,0,9,1,0,0,1
`;

// SurveyCake Raw Lines
const surveyCakeRaw = `
8/25/2026 16:12:10,8/25(G),SM0054,hu,,1,40HU,3,39.3,34.4,16.5,18.2
8/26/2026 8:55:14,8/25(G),Sm0027,i@,,1,40HU,3,27.4,24.3,19.1,19.9
8/26/2026 9:47:59,8/26(T),SM0012,ͺ,,1,40HU,3,30.6,25.7,22.6,23.5
8/27/2026 13:59:52,8/26(T),SM0052,W,,1,40HU,3,28.9,26.4,20.2,21.1
8/26/2026 12:00:50,8/25(G),VE0128,S,,2,40(t)HW,2.7,29,26,25.9,25.8
8/26/2026 20:50:21,8/25(G),VE0181,ӱ,,2,40HU,3,26.9,27.1,21.5,21
8/26/2026 22:55:21,8/25(G),Ve0166,xb\,,3,40HU,3,32.4,28.9,18.5,19.2
8/27/2026 13:59:14,8/25(G),VE0265,iw,,3,40HU,3,31.3,30.3,18.9,18.6
8/27/2026 14:13:11,8/25(G),ve0183,}z,,3,40(t)HW,2.7,32.3,32.1,19.3,19.3
8/27/2026 14:00:16,8/26(T),VE0287,u,,4,40HU,3,33.7,31.6,19.2,19
8/27/2026 20:03:37,8/26(T),SM0036,f,,4,40HU,3,42.4,40.8,20.6,20.2
8/25/2026 15:36:22,8/25(G),VE0266,|,,5,40HU,3,37.8,34.8,23.4,24.2
8/26/2026 9:29:23,8/25(G),ve0297,,,5,40HU,3,41.7,38.3,25.1,25.8
8/26/2026 16:58:08,8/25(G),VE0218,x,,5,40HU,3,34.9,33.7,17.9,18.7
8/28/2026 9:36:32,8/26(T),VE0176,\ѻ,,5,40HU,3,33.3,32.4,18.2,19
8/25/2026 15:33:14,8/25(G),VE0034,iษ,,6,40(t)HW,2.7,31.7,31.2,20.3,20.6
8/26/2026 14:24:11,8/25(G),VE0016,i,,6,40(t)HW,2.7,30,29.6,20.3,19.7
8/26/2026 14:24:41,8/26(T),VE0005,fFz,,6,40(t)HW,2.7,33.7,32.4,21.1,21.3
8/27/2026 10:09:15,8/26(T),VE0226,jÿ,,6,40HU,3.3,36.7,35.8,33.2,33.3
8/27/2026 13:59:50,8/26(T),SM0049,Lէ,,6,40HU,3,30.9,28.9,20.9,21.6
8/26/2026 11:28:18,8/26(T),VE0178,Pf,,7,40HU,3,32,29,24.6,25.8
8/26/2026 13:52:18,8/26(T),VE0219,Lt,,7,40HU,3.3,20.8,15.8,32.2,32.4
8/26/2026 14:09:59,8/26(T),VE0221,Y,,7,40HU,3,30.5,27.3,20.4,20.3
8/27/2026 9:31:25,8/26(T),VE0221,Y,,7,40HU,3,30.5,27.3,20.4,20.3
8/25/2026 15:45:53,8/25(G),VE0212,,,,40HU,3,40.7,36.9,18.4,19.2
8/25/2026 16:58:26,8/25(G),VE0288,L,,,50(t)HW,2.4,28.4,26.7,18.1,19
8/26/2026 10:44:02,8/26(T),VE0241,iam,,,40HU,3.3,18.1,17.4,32.2,32.7
8/26/2026 12:33:17,8/26(T),SM0005,dT,,,40(t)HW,2.7,38.9,37.6,25.2,26.6
8/26/2026 14:22:51,8/26(T),VE0197,nE,,,40(t)HW,3,28.5,28.7,29.9,29.6
8/26/2026 14:25:54,8/25(G),VE0107,Ba,,,40HU,3,40.4,39.3,23,23.7
8/26/2026 15:16:53,8/25(G),VE0203,²,,,40HU,3,44.7,42.1,26.4,27.8
8/26/2026 15:49:28,8/26(T),VE0305,t,,,40HU,3,34.2,28.9,17.2,19.5
8/26/2026 17:09:45,8/26(T),VE0207,¿\,,,40HU,3,49.2,49.4,24.7,24.6
8/26/2026 18:32:14,8/26(T),VE0301,Gͤ,,,40HU,3.3,21.6,18.3,30,31.4
8/27/2026 8:56:55,8/26(T),VEE0028,β[,,,40(t)HW,2.7,35.6,33.2,18,19.1
8/27/2026 14:03:27,8/25(G),VE0233,_,,,50(t)HW,2.7,37,36.4,32.5,33
8/27/2026 14:13:27,8/26(T),VE0306,Cot,,,40HU,3,24.5,26.1,20.9,20.5
8/28/2026 8:58:44,8/26(T),VE0018,LO,,,40(t)HW,3,27,29,22.2,21.4
8/26/2026 15:47:31,8/26(T),VE0232,P,W,1,40(t)HW,0.6,24.9,24.4,19.7,19.9
8/26/2026 14:23:39,8/26(T),VE0296,_,W,1,40HU,0.8,27.7,24.7,16.6,18
8/26/2026 14:27:46,8/25(G),VE0142,觰,W,1,40(t)HW,0.6,38,38.3,17.6,18.7
8/26/2026 18:30:35,8/25(G),VE0269,Q,W,1,40(t)HW,0.6,26.8,26.9,18.1,18.9
8/26/2026 21:40:08,8/25(G),VE0300,P,W,1,40HU,0.8,26.8,27.9,17.8,17.9
8/27/2026 8:50:13,8/26(T),SM0062,i,W,2,40HU,1,18,16.8,26.8,28.2
8/27/2026 14:02:10,8/26(T),VE0188,,W,2,40HU,0.8,23.8,23.1,21.8,22.9
8/25/2026 16:37:37,8/25(G),SM0073,ɦw,W,,40HU,0.8,21.3,21.3,21.3,22.5
8/26/2026 8:57:20,8/26(T),SM0033,X,W,,40HU,0.8,40.9,37.4,22.9,23.9
8/26/2026 14:25:35,8/26(T),VE0278,If,W,,40HU,0.8,42.4,41.4,26,26.7
8/26/2026 14:50:26,8/25(G),VE0268,}Qs,W,,40HU,0.8,33.1,30.2,17.1,18.2
8/26/2026 15:04:56,8/26(T),VE0299,_,W,,40HU,1,20,18,22.4,23.4
8/26/2026 15:16:51,8/25(G),SM0001,նv,W,,40(t)HW,0.8,23.8,21.8,28.1,29
8/26/2026 15:17:33,8/25(G),VE0171,ig,W,,40HU,0.8,35.8,35.5,18,17.8
8/27/2026 14:02:57,8/25(G),VE0179,da,W,,40HU,0.8,37.8,36.4,21.4,20.9
8/27/2026 14:10:35,8/26(T),VE276,tf,W,,40HU,0.8,31.6,32.2,16.9,17.7
8/28/2026 9:02:56,8/26(T),Ve0173,Gɪ,W,,40HU,0.8,28.7,28.6,23.9,24.1
`;

interface EmpInfo {
  empId: string;
  name: string;
  nickname: string;
  group: 'fat' | 'muscle';
  taskPts: number;
  teamNum?: string;
  ageGroupStr?: string;
  targetStandard?: number;
  preFat?: number;
  postFat?: number;
  preMuscle?: number;
  postMuscle?: number;
  bodyResult: number;
  isGoalMet: boolean;
  rankPts: number;
  inbodyPts: number;
  totalPts: number;
  bodyRank?: number;
  isMinPtsMet: boolean;
  achievementAward: boolean;
  individualAward?: string;
  individualAwardPrize?: number;
}

const empMap = new Map<string, EmpInfo>();

memberDataRaw.trim().split('\n').forEach(line => {
  if (!line.trim()) return;
  const parts = line.split(',');
  const empId = parts[0].trim().toUpperCase();
  const name = parts[1].trim();
  const nickname = parts[2].trim();
  const group = parts[3].trim() === '減脂組' ? 'fat' : 'muscle';
  const taskPts = parseInt(parts[4].trim(), 10) || 0;
  empMap.set(empId, {
    empId,
    name,
    nickname,
    group,
    taskPts,
    bodyResult: 0,
    isGoalMet: false,
    rankPts: 0,
    inbodyPts: 0,
    totalPts: taskPts,
    isMinPtsMet: taskPts >= 45,
    achievementAward: false,
  });
});

function normId(raw: string): string {
  let id = raw.trim().toUpperCase();
  if (id === 'VE276') id = 'VE0276';
  if (id === 'VEE0028') id = 'VE0028';
  return id;
}

surveyCakeRaw.trim().split('\n').forEach(line => {
  if (!line.trim()) return;
  const parts = line.split(',');
  if (parts.length < 12) return;
  const rawId = parts[2].trim();
  const empId = normId(rawId);
  const teamNum = parts[5].trim();
  const ageGroupStr = parts[6].trim();
  const targetStandard = parseFloat(parts[7].trim()) || 0;
  const preFat = parseFloat(parts[8].trim());
  const postFat = parseFloat(parts[9].trim());
  const preMuscle = parseFloat(parts[10].trim());
  const postMuscle = parseFloat(parts[11].trim());

  let emp = empMap.get(empId);
  if (!emp) return;

  emp.teamNum = teamNum;
  emp.ageGroupStr = ageGroupStr;
  emp.targetStandard = targetStandard;
  emp.preFat = preFat;
  emp.postFat = postFat;
  emp.preMuscle = preMuscle;
  emp.postMuscle = postMuscle;

  if (emp.group === 'fat') {
    const diff = parseFloat((preFat - postFat).toFixed(2));
    emp.bodyResult = diff;
    emp.isGoalMet = diff >= targetStandard;
  } else {
    const diff = parseFloat((postMuscle - preMuscle).toFixed(2));
    emp.bodyResult = diff;
    emp.isGoalMet = diff >= targetStandard;
  }
});

function getTierPts(group: 'fat' | 'muscle', res: number): number {
  if (group === 'muscle') {
    if (res >= 1.0) return 20;
    if (res >= 0.6) return 15;
    if (res >= 0.2) return 10;
    return 0;
  } else {
    if (res >= 3.5) return 20;
    if (res >= 2.5) return 15;
    if (res >= 1.5) return 10;
    return 0;
  }
}

// 1. Fat InBody Ranking (Top 3 gets 40, 35, 30; non-top-3 gets 20, 15, 10, 0)
const fatList = Array.from(empMap.values()).filter(e => e.group === 'fat');
fatList.sort((a, b) => b.bodyResult - a.bodyResult);

fatList.forEach((e, idx) => {
  e.bodyRank = idx + 1;
  if (idx === 0) {
    e.rankPts = 40;
    e.inbodyPts = 0;
  } else if (idx === 1) {
    e.rankPts = 35;
    e.inbodyPts = 0;
  } else if (idx === 2) {
    e.rankPts = 30;
    e.inbodyPts = 0;
  } else {
    e.rankPts = 0;
    e.inbodyPts = getTierPts('fat', e.bodyResult);
  }
  e.totalPts = e.taskPts + e.rankPts + e.inbodyPts;
  e.isMinPtsMet = e.totalPts >= 45;
  e.achievementAward = e.isGoalMet && e.isMinPtsMet;
});

// 2. Muscle InBody Ranking
const muscleList = Array.from(empMap.values()).filter(e => e.group === 'muscle');
muscleList.sort((a, b) => b.bodyResult - a.bodyResult);

muscleList.forEach((e, idx) => {
  e.bodyRank = idx + 1;
  if (idx === 0) {
    e.rankPts = 40;
    e.inbodyPts = 0;
  } else if (idx === 1) {
    e.rankPts = 35;
    e.inbodyPts = 0;
  } else if (idx === 2) {
    e.rankPts = 30;
    e.inbodyPts = 0;
  } else {
    e.rankPts = 0;
    e.inbodyPts = getTierPts('muscle', e.bodyResult);
  }
  e.totalPts = e.taskPts + e.rankPts + e.inbodyPts;
  e.isMinPtsMet = e.totalPts >= 45;
  e.achievementAward = e.isGoalMet && e.isMinPtsMet;
});

// 3. Individual Overall Ranking
const sortIndividual = (a: EmpInfo, b: EmpInfo) => {
  if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
  return b.bodyResult - a.bodyResult;
};

const fatIndividual = [...fatList].sort(sortIndividual);
const muscleIndividual = [...muscleList].sort(sortIndividual);

let fatWinnerCount = 0;
const fatPrizes = [10000, 6000, 3000];
const fatPrizeTitles = ['減脂組 冠軍 ($10,000)', '減脂組 亞軍 ($6,000)', '減脂組 季軍 ($3,000)'];

fatIndividual.forEach(e => {
  if (e.isGoalMet && e.isMinPtsMet && fatWinnerCount < 3) {
    e.individualAward = fatPrizeTitles[fatWinnerCount];
    e.individualAwardPrize = fatPrizes[fatWinnerCount];
    fatWinnerCount++;
  }
});

let muscleWinnerCount = 0;
const musclePrizes = [10000, 6000, 3000];
const musclePrizeTitles = ['增肌組 冠軍 ($10,000)', '增肌組 亞軍 ($6,000)', '增肌組 季軍 ($3,000)'];

muscleIndividual.forEach(e => {
  if (e.isGoalMet && e.isMinPtsMet && muscleWinnerCount < 3) {
    e.individualAward = musclePrizeTitles[muscleWinnerCount];
    e.individualAwardPrize = musclePrizes[muscleWinnerCount];
    muscleWinnerCount++;
  }
});

// 4. Team Competition
const teamsMap = new Map<string, { group: 'fat' | 'muscle'; teamNum: string; members: EmpInfo[] }>();

Array.from(empMap.values()).forEach(e => {
  if (e.teamNum && e.teamNum !== '') {
    const key = `${e.group}_team_${e.teamNum}`;
    if (!teamsMap.has(key)) {
      teamsMap.set(key, { group: e.group, teamNum: e.teamNum, members: [] });
    }
    teamsMap.get(key)!.members.push(e);
  }
});

interface TeamStat {
  group: 'fat' | 'muscle';
  teamNum: string;
  members: EmpInfo[];
  avgTotalPts: number;
  avgBodyResult: number;
  avgTargetStandard: number;
  isAvgGoalMet: boolean;
  isAllMembersMinPtsMet: boolean;
  isQualified: boolean;
  award?: string;
  prizePerMember?: number;
}

const teamStatsList: TeamStat[] = [];

teamsMap.forEach((t) => {
  const count = t.members.length;
  const avgTotalPts = parseFloat((t.members.reduce((sum, m) => sum + m.totalPts, 0) / count).toFixed(2));
  const avgBodyResult = parseFloat((t.members.reduce((sum, m) => sum + m.bodyResult, 0) / count).toFixed(2));
  const avgTargetStandard = parseFloat((t.members.reduce((sum, m) => sum + (m.targetStandard || 0), 0) / count).toFixed(2));

  const isAvgGoalMet = avgBodyResult >= avgTargetStandard;
  const isAllMembersMinPtsMet = t.members.every(m => m.totalPts >= 45);
  const isQualified = isAvgGoalMet && isAllMembersMinPtsMet && count >= 2;

  teamStatsList.push({
    group: t.group,
    teamNum: t.teamNum,
    members: t.members,
    avgTotalPts,
    avgBodyResult,
    avgTargetStandard,
    isAvgGoalMet,
    isAllMembersMinPtsMet,
    isQualified,
  });
});

const sortTeams = (a: TeamStat, b: TeamStat) => {
  if (b.avgTotalPts !== a.avgTotalPts) return b.avgTotalPts - a.avgTotalPts;
  return b.avgBodyResult - a.avgBodyResult;
};

const fatTeams = teamStatsList.filter(t => t.group === 'fat').sort(sortTeams);
const muscleTeams = teamStatsList.filter(t => t.group === 'muscle').sort(sortTeams);

let fatTeamRank = 0;
fatTeams.forEach(t => {
  if (t.isQualified && fatTeamRank < 2) {
    if (fatTeamRank === 0) {
      t.award = '減脂組 團體冠軍 (每人 $3,000)';
      t.prizePerMember = 3000;
    } else {
      t.award = '減脂組 團體亞軍 (每人 $2,000)';
      t.prizePerMember = 2000;
    }
    fatTeamRank++;
  }
});

let muscleTeamRank = 0;
muscleTeams.forEach(t => {
  if (t.isQualified && muscleTeamRank < 2) {
    if (muscleTeamRank === 0) {
      t.award = '增肌組 團體冠軍 (每人 $3,000)';
      t.prizePerMember = 3000;
    } else {
      t.award = '增肌組 團體亞軍 (每人 $2,000)';
      t.prizePerMember = 2000;
    }
    muscleTeamRank++;
  }
});

// Ensure public directory exists
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate Full Settlement Report CSV
let fullCsv = '\uFEFF組別,名次,員工編號,姓名,暱稱,所屬隊伍,任務積分,體態名次加分,體態級距加分,個人總積分,前測數值,後測數值,體態成果,P22達標標準,P22達標狀態,個人總分滿45分,個人達標獎($2000),個人競賽獎項,個人競賽獎金,總獲得個人獎金\n';

fatIndividual.forEach((e, idx) => {
  const pre = e.preFat !== undefined ? `${e.preFat}%` : '未回填';
  const post = e.postFat !== undefined ? `${e.postFat}%` : '未回填';
  const res = e.preFat !== undefined ? `減脂 ${e.bodyResult}%` : '未回填';
  const std = e.targetStandard !== undefined ? `減脂 ${e.targetStandard}%` : '-';
  const isGoal = e.isGoalMet ? '達標' : '未達標';
  const is45 = e.isMinPtsMet ? '符合' : '未達';
  const achPrize = e.achievementAward ? 2000 : 0;
  const compPrize = e.individualAwardPrize || 0;
  const totalPrize = achPrize + compPrize;
  fullCsv += `減脂組,${idx + 1},${e.empId},${e.name},"${e.nickname}",${e.teamNum ? `第${e.teamNum}組` : '無'},${e.taskPts},${e.rankPts},${e.inbodyPts},${e.totalPts},${pre},${post},${res},${std},${isGoal},${is45},${e.achievementAward ? '獲獎' : '無'},"${e.individualAward || '無'}",${compPrize},${totalPrize}\n`;
});

muscleIndividual.forEach((e, idx) => {
  const pre = e.preMuscle !== undefined ? `${e.preMuscle}kg` : '未回填';
  const post = e.postMuscle !== undefined ? `${e.postMuscle}kg` : '未回填';
  const res = e.preMuscle !== undefined ? `增肌 ${e.bodyResult}kg` : '未回填';
  const std = e.targetStandard !== undefined ? `增肌 ${e.targetStandard}kg` : '-';
  const isGoal = e.isGoalMet ? '達標' : '未達標';
  const is45 = e.isMinPtsMet ? '符合' : '未達';
  const achPrize = e.achievementAward ? 2000 : 0;
  const compPrize = e.individualAwardPrize || 0;
  const totalPrize = achPrize + compPrize;
  fullCsv += `增肌組,${idx + 1},${e.empId},${e.name},"${e.nickname}",${e.teamNum ? `第${e.teamNum}組` : '無'},${e.taskPts},${e.rankPts},${e.inbodyPts},${e.totalPts},${pre},${post},${res},${std},${isGoal},${is45},${e.achievementAward ? '獲獎' : '無'},"${e.individualAward || '無'}",${compPrize},${totalPrize}\n`;
});

fs.writeFileSync(path.join(publicDir, '夏日挑戰賽_8月27日全員結算總報表.csv'), fullCsv, 'utf8');

// 2. Generate Prize Winners Summary CSV
let prizeCsv = '\uFEFF獎項類別,競賽組別,名次/獎項名稱,獲獎同仁/隊伍,員工編號,隊員名單/個人暱稱,成果數值(總分/體態成果),獲獎金額(新台幣)\n';

// Individual awards
fatIndividual.filter(e => e.individualAward).forEach(e => {
  prizeCsv += `個人競賽獎,減脂組,"${e.individualAward}",${e.name},${e.empId},"${e.nickname}","總分:${e.totalPts}分 / 減脂:${e.bodyResult}%",${e.individualAwardPrize}\n`;
});
muscleIndividual.filter(e => e.individualAward).forEach(e => {
  prizeCsv += `個人競賽獎,增肌組,"${e.individualAward}",${e.name},${e.empId},"${e.nickname}","總分:${e.totalPts}分 / 增肌:${e.bodyResult}kg",${e.individualAwardPrize}\n`;
});

// Team awards
fatTeams.filter(t => t.award).forEach(t => {
  const memberNames = t.members.map(m => `${m.name}(${m.empId})`).join('、');
  const totalTeamPrize = (t.prizePerMember || 0) * t.members.length;
  prizeCsv += `團體競賽獎,減脂組,"${t.award}","第 ${t.teamNum} 組",-, "${memberNames}","平均分:${t.avgTotalPts}分 / 平均減脂:${t.avgBodyResult}%",全隊$${totalTeamPrize}(每人$${t.prizePerMember})\n`;
});
muscleTeams.filter(t => t.award).forEach(t => {
  const memberNames = t.members.map(m => `${m.name}(${m.empId})`).join('、');
  const totalTeamPrize = (t.prizePerMember || 0) * t.members.length;
  prizeCsv += `團體競賽獎,增肌組,"${t.award}","第 ${t.teamNum} 組",-, "${memberNames}","平均分:${t.avgTotalPts}分 / 平均增肌:${t.avgBodyResult}kg",全隊$${totalTeamPrize}(每人$${t.prizePerMember})\n`;
});

// Individual Achievement awards
const allAchievement = [...fatIndividual, ...muscleIndividual].filter(e => e.achievementAward);
allAchievement.forEach(e => {
  const resStr = e.group === 'fat' ? `減脂:${e.bodyResult}%(標:${e.targetStandard}%)` : `增肌:${e.bodyResult}kg(標:${e.targetStandard}kg)`;
  prizeCsv += `個人達標獎,${e.group === 'fat' ? '減脂組' : '增肌組'},個人達標獎($2,000),${e.name},${e.empId},"${e.nickname}","總分:${e.totalPts}分 / ${resStr}",2000\n`;
});

fs.writeFileSync(path.join(publicDir, '夏日挑戰賽_得獎名冊與獎金總表.csv'), prizeCsv, 'utf8');

console.log('CSV files generated successfully in /public');
