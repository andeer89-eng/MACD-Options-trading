import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-macd-options-rules';
const OWNER_UID = 'owner-1';
const OTHER_UID = 'owner-2';
let testEnv;

function watchlistRef(db, id) {
  return doc(db, 'users', OWNER_UID, 'watchlistItems', id);
}

async function seedWatchlistItem(id, status = 'WATCHING') {
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
  it('rejects oversized symbols and unapproved fields on create', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID, { email_verified: true }).firestore();
    const oversized = doc(db, 'users', OWNER_UID, 'watchlistItems', 'oversized-symbol');
    await assertFails(setDoc(oversized, {
      ownerId: OWNER_UID,
      symbol: 'A'.repeat(21),
      status: 'NEW',
      totalScore: 10,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    const injected = doc(db, 'users', OWNER_UID, 'watchlistItems', 'ghost-field');
    await assertFails(setDoc(injected, {
      ownerId: OWNER_UID,
      symbol: 'AAPL',
      status: 'NEW',
      totalScore: 10,
      isAdmin: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  });

  it('rejects client-created and client-triggered watchlist states while allowing trusted server writes', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID, { email_verified: true }).firestore();
    const triggeredCreate = doc(db, 'users', OWNER_UID, 'watchlistItems', 'client-triggered-create');
    await assertFails(setDoc(triggeredCreate, {
      ownerId: OWNER_UID,
      symbol: 'AAPL',
      status: 'TRIGGERED',
      totalScore: 82,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));

    await seedWatchlistItem('client-triggered-update', 'WATCHING');
    await assertFails(updateDoc(watchlistRef(db, 'client-triggered-update'), {
      status: 'TRIGGERED',
      updatedAt: serverTimestamp(),
    }));

    // Trusted server code uses the Admin SDK, which bypasses Firestore Security Rules.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), 'users', OWNER_UID, 'watchlistItems', 'client-triggered-update'), {
        status: 'TRIGGERED',
        updatedAt: serverTimestamp(),
      });
    });
    const trustedSnapshot = await assertSucceeds(getDoc(watchlistRef(db, 'client-triggered-update')));
    assert.equal(trustedSnapshot.data()?.status, 'TRIGGERED');

    // Owners may still edit non-status metadata on a server-triggered record.
    await assertSucceeds(updateDoc(watchlistRef(db, 'client-triggered-update'), {
      isPinned: true,
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(watchlistRef(db, 'client-triggered-update'), {
      status: 'WATCHING',
      updatedAt: serverTimestamp(),
    }));
  });

  it('prevents deleting terminal items to bypass the irreversible state guard', async () => {
    await seedWatchlistItem('terminal-delete', 'EXPIRED');
    const db = testEnv.authenticatedContext(OWNER_UID, { email_verified: true }).firestore();
    await assertFails(deleteDoc(watchlistRef(db, 'terminal-delete')));

    await seedWatchlistItem('live-delete', 'WATCHING');
    await assertSucceeds(deleteDoc(watchlistRef(db, 'live-delete')));
  });

});
