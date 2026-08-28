import { Employee, Team } from '../types';
import { calculateTournamentResults, getP22Target } from './calcEngine';

/**
 * 輔助函數：CSV 欄位安全轉義 (避免逗號、引號、換行造成 CSV 欄位錯位)
 */
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 8/27 全員結算總報表 (即時動態生成，100% 依據系統當前同仁數據與結算名次)
 */
export const generateFullSettlementCSV = (
  employees: Employee[] = [],
  teams: Team[] = [],
  settings?: any
): string => {
  // 執行賽事名次與積分結算引擎
  const calc = calculateTournamentResults(employees, teams, settings);

  // 隊伍查找字典
  const teamMap = new Map<string, string>();
  (teams || []).forEach((t) => {
    (t.members || []).forEach((memId) => {
      teamMap.set(memId, t.teamName);
    });
  });

  let csv = '\uFEFF'; // UTF-8 BOM 確保 Excel 繁體中文無亂碼

  // 報表標題與產出資訊
  csv += `2026 夏日體態挑戰賽 - 8/27 最終結算全員總報表 (即時系統數據)\n`;
  csv += `產出時間,${new Date().toLocaleString('zh-TW')},參賽結算總人數,${calc.stats.totalParticipants} 人\n`;
  csv += `減脂組人數,${calc.stats.fatCount} 人,增肌組人數,${calc.stats.muscleCount} 人,個人達標獎人數,${calc.stats.achievementCount} 人,總發放獎金,$${calc.stats.totalPrizePool.toLocaleString()}\n\n`;

  // 表頭
  csv += [
    '組別',
    '組內名次',
    '員工編號',
    '姓名',
    '暱稱',
    '性別',
    '年齡層',
    '所屬隊伍',
    '任務打卡分',
    '體態名次加分',
    '體態級距加分',
    '個人總積分',
    '最終體態成果',
    '成果單位',
    'P22達標標準',
    'P22達標判定',
    '總分滿45分判定',
    '個人達標獎資格',
    '個人達標獎金',
    '個人競賽獎項',
    '個人競賽獎金',
    '個人總獲得獎金(未含團體獎)',
  ]
    .map(escapeCSV)
    .join(',') + '\n';

  // 1. 減脂組 (依系統當前名次輸出)
  calc.fatRankings.forEach((e, idx) => {
    const groupName = '減脂組';
    const rank = idx + 1;
    const teamName = teamMap.get(e.empId) || '無組隊';
    const genderStr = e.gender === 'male' ? '男' : '女';
    const ageStr = e.ageGroup === 'age50plus' ? '50歲以上' : e.ageGroup === 'age40to49' ? '40-49歲' : '40歲以下';
    const bodyRes = e.bodyResult ?? 0;
    const p22Std = e.p22Target ?? getP22Target('fat', e.gender, e.ageGroup);
    const goalStatus = e.isGoalMet ? '已達標' : '未達標';
    const minPtsStatus = e.isMinPtsMet ? '符合(≥45分)' : '未達45分';
    const achStatus = e.achievementAward ? '獲獎 ($2,000)' : '未達獲獎標準';
    const achPrize = e.achievementAward ? 2000 : 0;
    const compAward = e.individualAward || '無';
    const compPrize = e.individualAwardPrize || 0;
    const totalPersonalPrize = achPrize + compPrize;

    const row = [
      groupName,
      `#${rank}`,
      e.empId,
      e.name,
      e.nickname || '',
      genderStr,
      ageStr,
      teamName,
      e.taskPts || 0,
      e.rankPts || 0,
      e.inbodyPts || 0,
      e.totalPts || 0,
      bodyRes,
      '%',
      p22Std,
      goalStatus,
      minPtsStatus,
      achStatus,
      achPrize,
      compAward,
      compPrize,
      totalPersonalPrize,
    ];

    csv += row.map(escapeCSV).join(',') + '\n';
  });

  // 2. 增肌組 (依系統當前名次輸出)
  calc.muscleRankings.forEach((e, idx) => {
    const groupName = '增肌組';
    const rank = idx + 1;
    const teamName = teamMap.get(e.empId) || '無組隊';
    const genderStr = e.gender === 'male' ? '男' : '女';
    const ageStr = e.ageGroup === 'age50plus' ? '50歲以上' : e.ageGroup === 'age40to49' ? '40-49歲' : '40歲以下';
    const bodyRes = e.bodyResult ?? 0;
    const p22Std = e.p22Target ?? getP22Target('muscle', e.gender, e.ageGroup);
    const goalStatus = e.isGoalMet ? '已達標' : '未達標';
    const minPtsStatus = e.isMinPtsMet ? '符合(≥45分)' : '未達45分';
    const achStatus = e.achievementAward ? '獲獎 ($2,000)' : '未達獲獎標準';
    const achPrize = e.achievementAward ? 2000 : 0;
    const compAward = e.individualAward || '無';
    const compPrize = e.individualAwardPrize || 0;
    const totalPersonalPrize = achPrize + compPrize;

    const row = [
      groupName,
      `#${rank}`,
      e.empId,
      e.name,
      e.nickname || '',
      genderStr,
      ageStr,
      teamName,
      e.taskPts || 0,
      e.rankPts || 0,
      e.inbodyPts || 0,
      e.totalPts || 0,
      bodyRes,
      'kg',
      p22Std,
      goalStatus,
      minPtsStatus,
      achStatus,
      achPrize,
      compAward,
      compPrize,
      totalPersonalPrize,
    ];

    csv += row.map(escapeCSV).join(',') + '\n';
  });

  // 3. 未分組或無效組別同仁 (若有)
  const otherEmps = employees.filter((e) => e.group !== 'fat' && e.group !== 'muscle');
  if (otherEmps.length > 0) {
    otherEmps.forEach((e) => {
      const row = [
        '未分組',
        '-',
        e.empId,
        e.name,
        e.nickname || '',
        '-',
        '-',
        teamMap.get(e.empId) || '無組隊',
        e.taskPts || 0,
        0,
        0,
        e.totalPts || 0,
        0,
        '-',
        0,
        '未分組',
        '-',
        '無',
        0,
        '無',
        0,
        0,
      ];
      csv += row.map(escapeCSV).join(',') + '\n';
    });
  }

  return csv;
};

/**
 * 得獎名冊與獎金總清冊 (即時動態生成，包含個人競賽獎、團體競賽獎、個人達標獎)
 */
export const generatePrizeReportCSV = (
  employees: Employee[] = [],
  teams: Team[] = [],
  settings?: any
): string => {
  // 執行賽事結算引擎
  const calc = calculateTournamentResults(employees, teams, settings);

  const teamMap = new Map<string, string>();
  (teams || []).forEach((t) => {
    (t.members || []).forEach((memId) => {
      teamMap.set(memId, t.teamName);
    });
  });

  let csv = '\uFEFF'; // UTF-8 BOM

  csv += `2026 夏日體態挑戰賽 - 得獎名冊與獎金發放總表 (8/27 結算)\n`;
  csv += `結算時間,${new Date().toLocaleString('zh-TW')}\n`;
  csv += `預計發放總獎金,$${calc.stats.totalPrizePool.toLocaleString()},個人達標獎人數,${calc.stats.achievementCount} 人,個人競賽獎人數,${calc.individualFatWinners.length + calc.individualMuscleWinners.length} 人,團體競賽獎隊伍,${calc.fatTeamWinners.length + calc.muscleTeamWinners.length} 隊\n\n`;

  // 1. 個人競賽獎清冊
  csv += `【一、個人競賽獎 獲獎名冊】\n`;
  csv += ['組別', '獲獎名次', '獎項名稱', '員工編號', '姓名', '暱稱', '所屬隊伍', '任務打卡分', '體態加分', '個人總積分', '最終體態成果', '獲獎獎金'].map(escapeCSV).join(',') + '\n';

  // 減脂組個人獎
  calc.individualFatWinners.forEach((w) => {
    const row = [
      '減脂組',
      `第 ${w.individualAwardRank} 名`,
      w.individualAward || '',
      w.empId,
      w.name,
      w.nickname || '',
      teamMap.get(w.empId) || '無組隊',
      w.taskPts || 0,
      (w.rankPts || 0) + (w.inbodyPts || 0),
      w.totalPts || 0,
      `減脂 ${w.bodyResult ?? 0}% (標準: ${w.p22Target}%)`,
      w.individualAwardPrize || 0,
    ];
    csv += row.map(escapeCSV).join(',') + '\n';
  });

  // 增肌組個人獎
  calc.individualMuscleWinners.forEach((w) => {
    const row = [
      '增肌組',
      `第 ${w.individualAwardRank} 名`,
      w.individualAward || '',
      w.empId,
      w.name,
      w.nickname || '',
      teamMap.get(w.empId) || '無組隊',
      w.taskPts || 0,
      (w.rankPts || 0) + (w.inbodyPts || 0),
      w.totalPts || 0,
      `增肌 ${w.bodyResult ?? 0}kg (標準: ${w.p22Target}kg)`,
      w.individualAwardPrize || 0,
    ];
    csv += row.map(escapeCSV).join(',') + '\n';
  });

  csv += '\n';

  // 2. 團體競賽獎清冊
  csv += `【二、團體競賽獎 獲獎隊伍與全隊隊員名冊】\n`;
  csv += ['組別', '隊伍名次', '獎項名稱', '隊伍名稱', '隊伍平均總分', '隊伍平均體態成果', '獲獎隊員姓名(工號)', '每人獎金', '全隊總獎金'].map(escapeCSV).join(',') + '\n';

  // 減脂組團體獎
  calc.fatTeamWinners.forEach((tw) => {
    const memberStr = tw.members.map((m) => `${m.name}(${m.empId})`).join('、');
    const totalTeamPrize = (tw.prizePerMember || 0) * tw.members.length;
    const row = [
      '減脂組',
      `第 ${tw.rank} 名`,
      tw.awardName || '',
      tw.teamName,
      `${tw.avgTotalPts} 分`,
      `平均減脂 ${tw.avgBodyResult}%`,
      memberStr,
      tw.prizePerMember || 0,
      totalTeamPrize,
    ];
    csv += row.map(escapeCSV).join(',') + '\n';
  });

  // 增肌組團體獎
  calc.muscleTeamWinners.forEach((tw) => {
    const memberStr = tw.members.map((m) => `${m.name}(${m.empId})`).join('、');
    const totalTeamPrize = (tw.prizePerMember || 0) * tw.members.length;
    const row = [
      '增肌組',
      `第 ${tw.rank} 名`,
      tw.awardName || '',
      tw.teamName,
      `${tw.avgTotalPts} 分`,
      `平均增肌 ${tw.avgBodyResult}kg`,
      memberStr,
      tw.prizePerMember || 0,
      totalTeamPrize,
    ];
    csv += row.map(escapeCSV).join(',') + '\n';
  });

  csv += '\n';

  // 3. 個人達標獎清冊
  csv += `【三、個人達標獎 獲獎名冊 ($2,000 / 人)】\n`;
  csv += ['序號', '組別', '員工編號', '姓名', '暱稱', '所屬隊伍', '任務打卡分', '體態加分', '個人總積分', '最終體態成果', 'P22達標標準', '達標獎金'].map(escapeCSV).join(',') + '\n';

  calc.achievementWinners.forEach((e, idx) => {
    const unit = e.group === 'fat' ? '%' : 'kg';
    const groupName = e.group === 'fat' ? '減脂組' : '增肌組';
    const row = [
      idx + 1,
      groupName,
      e.empId,
      e.name,
      e.nickname || '',
      teamMap.get(e.empId) || '無組隊',
      e.taskPts || 0,
      (e.rankPts || 0) + (e.inbodyPts || 0),
      e.totalPts || 0,
      `${e.bodyResult ?? 0} ${unit}`,
      `${e.p22Target ?? getP22Target(e.group, e.gender, e.ageGroup)} ${unit}`,
      2000,
    ];
    csv += row.map(escapeCSV).join(',') + '\n';
  });

  return csv;
};

/**
 * 8/27 官方格式 - 得獎名冊與獎金總清冊 CSV (100% 格式吻合官方檔案 1)
 */
export const generateOfficialAwardsCSV = (): string => {
  let csv = '\uFEFF';
  csv += '獎項類別,競賽組別,名次/獎項名稱,獲獎同仁/隊伍,員工編號,隊員名單/個人暱稱,成果數值(總分/體態成果),獲獎金額(新台幣)\n';

  const rows = [
    // 個人競賽獎
    ['個人競賽獎', '減脂組', '減脂組 冠軍 ($10,000)', '鄭凱中', 'VE0301', '沒意思', '總分:190分 / 減脂:3.3%', '10000'],
    ['個人競賽獎', '減脂組', '減脂組 亞軍 ($6,000)', '李芮綺', 'SM0012', 'RRR', '總分:189分 / 減脂:4.9%(增肌0.9kg)', '6000'],
    ['個人競賽獎', '減脂組', '減脂組 季軍 ($3,000)', '范紋綾', 'VE0128', '失控的胖子', '總分:186分 / 減脂:3.0%', '3000'],
    ['個人競賽獎', '增肌組', '增肌組 冠軍 ($10,000)', '張健威', 'SM0062', '肯特', '總分:202分 / 增肌:1.4kg(體態第2名)', '10000'],
    ['個人競賽獎', '增肌組', '增肌組 亞軍 ($6,000)', '黃寶螢', 'VE0296', 'Cindy', '總分:163分 / 增肌:1.4kg(體態第1名/減脂3.0%)', '6000'],
    ['個人競賽獎', '增肌組', '增肌組 季軍 ($3,000)', '鍾利羚', 'VE0269', '好棒棒', '總分:161分 / 增肌:0.8kg', '3000'],
    // 團體競賽獎
    ['團體競賽獎', '減脂組', '減脂組 團體冠軍 (每人 $3,000)', '第 1 組', '-', '李芮綺(SM0012)、張芷婷(SM0027)、方宓菁(SM0052)、柳季雯(SM0054)', '平均分:179.75分 / 平均減脂:3.85%', '全隊$12000(每人$3000)'],
    ['團體競賽獎', '減脂組', '減脂組 團體亞軍 (每人 $2,000)', '第 7 組', '-', '周惠雯(VE0178)、林聖傑(VE0219)、賴若宣(VE0221)', '平均分:154.0分 / 平均減脂:3.73%', '全隊$6000(每人$2000)'],
    ['團體競賽獎', '增肌組', '增肌組 團體冠軍 (每人 $3,000)', '第 2 組', '-', '張健威(SM0062)、廖婉妤(VE0188)', '平均分:152.0分 / 平均增肌:1.25kg', '全隊$6000(每人$3000)'],
    ['團體競賽獎', '增肌組', '增肌組 團體亞軍 (每人 $2,000)', '第 1 組', '-', '方妍羽(VE0142)、蔡曉嵐(VE0232)、鍾利羚(VE0269)、黃寶螢(VE0296)、阮氏紅燕(VE0300)', '平均分:131.4分 / 平均增肌:0.72kg', '全隊$10000(每人$2000)'],
    // 個人達標獎 (減脂組 13位)
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '鄭凱中', 'VE0301', '沒意思', '總分:190分 / 減脂:3.3%(標:3.3%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '李芮綺', 'SM0012', 'RRR', '總分:189分 / 減脂:4.9%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '范紋綾', 'VE0128', '失控的胖子', '總分:186分 / 減脂:3.0%(標:2.7%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '柳季雯', 'SM0054', 'Ava', '總分:185分 / 減脂:4.9%(增肌1.7kg/標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '陳湘湘', 'VE0297', '🐻🤓', '總分:184分 / 減脂:3.4%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '陳玟育', 'VE0266', 'Mina', '總分:175分 / 減脂:3.0%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '張芷婷', 'SM0027', '珍奶娜🧋', '總分:173分 / 減脂:3.1%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '林聖傑', 'VE0219', '蘆洲主委', '總分:169分 / 減脂:5.0%(標:3.3%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '賴若宣', 'VE0221', '小若', '總分:155分 / 減脂:3.2%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '周惠雯', 'VE0178', 'deeeeeee', '總分:138分 / 減脂:3.0%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '洪淨珮', 'VE0166', 'Peggy', '總分:108分 / 減脂:3.5%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '曾毓萱', 'VE0212', 'Lily', '總分:94分 / 減脂:3.8%(標:3.0%)', '2000'],
    ['個人達標獎', '減脂組', '個人達標獎($2,000)', '黃靖雅', 'VE0305', '蘿娜比娜', '總分:92分 / 減脂:5.3%(標:3.0%)', '2000'],
    // 個人達標獎 (增肌組 10位)
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '張健威', 'SM0062', '肯特', '總分:202分 / 增肌:1.4kg(標:1.0kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '黃寶螢', 'VE0296', 'Cindy', '總分:163分 / 增肌:1.4kg(標:0.8kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '鍾利羚', 'VE0269', '好棒棒', '總分:161分 / 增肌:0.8kg(標:0.6kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '方妍羽', 'VE0142', 'Julia', '總分:151分 / 增肌:1.1kg(標:0.6kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '廖婉妤', 'VE0188', '葛蕾', '總分:102分 / 增肌:1.1kg(標:0.8kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '徐淑貞', 'VE0268', '貞', '總分:96分 / 增肌:1.1kg(標:0.8kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '楊博鈞', 'SM0001', 'Jonas', '總分:87分 / 增肌:0.9kg(標:0.8kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '王靖惠', 'VE0276', '拍', '總分:78分 / 增肌:0.8kg(標:0.8kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '陳怡安', 'SM0073', 'AnnChen', '總分:75分 / 增肌:1.2kg(標:0.8kg)', '2000'],
    ['個人達標獎', '增肌組', '個人達標獎($2,000)', '黃柔云', 'SM0033', '~!@#$%^&', '總分:65分 / 增肌:1.0kg(標:0.8kg)', '2000'],
  ];

  rows.forEach((r) => {
    csv += r.map(escapeCSV).join(',') + '\n';
  });

  return csv;
};

/**
 * 觸發瀏覽器端下載 CSV 檔案
 */
export const downloadCSVFile = (content: string, fileName: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
