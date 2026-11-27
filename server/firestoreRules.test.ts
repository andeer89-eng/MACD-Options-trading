import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-macd-options-rules';
const OWNER_UID = 'owner-1';
const OTHER_UID = 'owner-2';
let testEnv: RulesTestEnvironment;

function watchlistRef(db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore'], id: string) {
  return doc(db, 'users', OWNER_UID, 'watchlistItems', id);
}

async function seedWatchlistItem(id: string, status: 'NEW' | 'WATCHING' | 'EXPIRED' | 'INVALIDATED' = 'WATCHING') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', OWNER_UID, 'watchlistItems', id), {
      ownerId: OWNER_UID,
      symbol: 'AAPL',
      status,
      totalScore: 82,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

describe('Firestore watchlist security rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('allows a live item to become terminal but prevents EXPIRED from being reactivated', async () => {
    await seedWatchlistItem('expired-reversal');
    const db = testEnv.authenticatedContext(OWNER_UID, { email_verified: true }).firestore();
    const ref = watchlistRef(db, 'expired-reversal');

    await assertSucceeds(updateDoc(ref, { status: 'EXPIRED', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'TRIGGERED', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: 'WATCHING', updatedAt: serverTimestamp() }));
  });

  it('prevents INVALIDATED from being reactivated while allowing non-status metadata edits', async () => {
    await seedWatchlistItem('invalidated-reversal', 'INVALIDATED');
    const db = testEnv.authenticatedContext(OWNER_UID, { email_verified: true }).firestore();
    const ref = watchlistRef(db, 'invalidated-reversal');

    await assertFails(updateDoc(ref, { status: 'TRIGGERED', updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(ref, { isPinned: true, updatedAt: serverTimestamp() }));
    const snapshot = await assertSucceeds(getDoc(ref));
    assert.equal(snapshot.data()?.status, 'INVALIDATED');
    assert.equal(snapshot.data()?.isPinned, true);
  });

  it('rejects writes by another user and reads by unauthenticated clients', async () => {
    await seedWatchlistItem('ownership-boundary');
    const otherDb = testEnv.authenticatedContext(OTHER_UID, { email_verified: true }).firestore();
    const otherRef = doc(otherDb, 'users', OWNER_UID, 'watchlistItems', 'ownership-boundary');
    await assertFails(updateDoc(otherRef, { isPinned: true, updatedAt: serverTimestamp() }));

    const anonymousDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymousDb, 'users', OWNER_UID, 'watchlistItems', 'ownership-boundary')));
  });

  it('rejects ownerId spoofing even when the caller is the document owner', async () => {
    await seedWatchlistItem('owner-spoof');
    const db = testEnv.authenticatedContext(OWNER_UID, { email_verified: true }).firestore();
    await assertFails(updateDoc(watchlistRef(db, 'owner-spoof'), {
      ownerId: OTHER_UID,
      updatedAt: serverTimestamp(),
    }));
  });
});
