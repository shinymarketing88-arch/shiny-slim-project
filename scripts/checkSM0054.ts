import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { firebaseConfig } from '../src/lib/firebase';
import { calculateEmployeeStats } from '../src/lib/calcEngine';

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // Search for SM0054
  const allEmpsSnap = await getDocs(collection(db, 'summer2026_employees'));
  let empDoc: any = null;
  allEmpsSnap.docs.forEach((d) => {
    const data = d.data();
    if (d.id === 'SM0054' || data.empId === 'SM0054' || d.id.includes('0054')) {
      empDoc = { id: d.id, ...data };
    }
  });

  if (!empDoc) {
    console.log('Employee SM0054 not found');
    process.exit(0);
  }

  console.log('Employee SM0054 in DB:', JSON.stringify(empDoc, null, 2));

  const cSnap = await getDocs(query(collection(db, 'summer2026_checkins'), where('empId', '==', empDoc.id)));
  const checkins = cSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];

  console.log(`Checkins total for ${empDoc.id}: ${checkins.length}`);
  const approved = checkins.filter((c) => c.status === '通過' || c.status === '補登通過');
  console.log(`Approved checkins: ${approved.length}`);

  approved.forEach((c) => {
    const t = c.createdAt?.seconds ? new Date(c.createdAt.seconds * 1000) : new Date(c.createdAt);
    console.log(`- ID: ${c.id}, taskType: ${c.taskType}, status: ${c.status}, createdAt: ${t.toISOString()}, localTW: ${t.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}, isMakeup: ${c.isMakeup}, makeupDate: ${c.makeupDate}`);
  });

  const sSnap = await getDoc(doc(db, 'summer2026_settings', 'main'));
  const startDateStr = sSnap.exists() && sSnap.data().startDate ? sSnap.data().startDate : '2026-07-13';

  const stats = calculateEmployeeStats(empDoc, approved, startDateStr);
  console.log('\nCalculated Stats for SM0054:');
  console.log(JSON.stringify(stats, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
