import admin from 'firebase-admin';

if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수(시크릿)가 비어있습니다.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
} catch (err) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY가 올바른 JSON이 아닙니다:', err.message);
  process.exit(1);
}

console.log('서비스 계정 프로젝트 ID:', serviceAccount.project_id);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function getDayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function remainingItemsToday(items, now) {
  const todayKey = getDayKey(now);
  const todayWeekday = now.getDay();

  return (items || []).filter((t) => {
    if (t.checked) return false;
    if (t.type === 'daily') return true;
    if (t.type === 'weekly') return t.weekday === undefined || t.weekday === todayWeekday;
    if (t.type === 'date') {
      return t.date === todayKey || (t.category === 'study' && t.date < todayKey);
    }
    return false;
  });
}

async function run() {
  // 알림은 한국 시간 기준으로 판단합니다 (서버는 UTC로 돌아가므로 KST로 변환).
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);

  const snapshot = await db.collection('checklists').get();
  const messaging = admin.messaging();

  console.log(`checklists 문서 ${snapshot.size}개 확인, 기준 시각(KST): ${now.toISOString()}`);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const tokens = data.pushTokens || [];
    const remaining = remainingItemsToday(data.items, now);
    console.log(`- ${doc.id}: 토큰 ${tokens.length}개, 전체 항목 ${(data.items || []).length}개, 남은 항목 ${remaining.length}개`);

    if (tokens.length === 0) continue;
    if (remaining.length === 0) continue;

    const body = remaining.map((t) => t.text).join(', ') + ' 남았어요';

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: '체크리스트', body },
    });

    const invalidTokens = [];
    response.responses.forEach((res, i) => {
      if (!res.success && (
        res.error?.code === 'messaging/registration-token-not-registered' ||
        res.error?.code === 'messaging/invalid-registration-token'
      )) {
        invalidTokens.push(tokens[i]);
      }
    });

    if (invalidTokens.length > 0) {
      await doc.ref.update({
        pushTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
      });
    }

    console.log(`${doc.id}: ${remaining.length}개 남음, ${tokens.length - invalidTokens.length}개 기기에 전송`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
