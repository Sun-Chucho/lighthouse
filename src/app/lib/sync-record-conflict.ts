function getSettlementPriority(record: unknown) {
  if (typeof record !== "object" || record === null) return 0;
  const status = (record as { status?: unknown }).status;
  if (status === "checked-out") return 3;
  if (status === "completed") return 2;
  if (status === "credit") return 1;
  return 0;
}

function getRecordRevision(record: unknown) {
  if (typeof record !== "object" || record === null) return 0;
  const candidate = record as {
    updatedAt?: unknown;
    changedAt?: unknown;
    lastExtendedAt?: unknown;
    deliveredAt?: unknown;
    paidOutAt?: unknown;
    recordedAt?: unknown;
    cancelledAt?: unknown;
    closedAt?: unknown;
    createdAt?: unknown;
  };
  const revision = Number(
    candidate.updatedAt ??
    candidate.changedAt ??
    candidate.lastExtendedAt ??
    candidate.deliveredAt ??
    candidate.paidOutAt ??
    candidate.recordedAt ??
    candidate.cancelledAt ??
    (typeof candidate.closedAt === "string" ? Date.parse(candidate.closedAt) : candidate.closedAt) ??
    candidate.createdAt ??
    0,
  );
  return Number.isFinite(revision) ? revision : 0;
}

function getManualPaymentRevision(record: unknown) {
  if (typeof record !== "object" || record === null) return 0;
  const revision = Number((record as { paymentMethodEditedAt?: unknown }).paymentMethodEditedAt ?? 0);
  return Number.isFinite(revision) ? revision : 0;
}

export function getSyncRecordId(record: unknown) {
  if (typeof record !== "object" || record === null) return null;
  const id = (record as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function chooseIncomingSyncRecord(currentRecord: unknown, incomingRecord: unknown) {
  // Explicit payment-method edits are authoritative in either direction,
  // including intentionally moving a completed payment back to credit.
  const currentPaymentRevision = getManualPaymentRevision(currentRecord);
  const incomingPaymentRevision = getManualPaymentRevision(incomingRecord);
  if (currentPaymentRevision !== incomingPaymentRevision && Math.max(currentPaymentRevision, incomingPaymentRevision) > 0) {
    return incomingPaymentRevision > currentPaymentRevision ? incomingRecord : currentRecord;
  }

  const currentPriority = getSettlementPriority(currentRecord);
  const incomingPriority = getSettlementPriority(incomingRecord);
  if (currentPriority !== incomingPriority) {
    return incomingPriority > currentPriority ? incomingRecord : currentRecord;
  }

  const currentRevision = getRecordRevision(currentRecord);
  const incomingRevision = getRecordRevision(incomingRecord);
  if (currentRevision !== incomingRevision) {
    return incomingRevision > currentRevision ? incomingRecord : currentRecord;
  }

  // The caller deliberately supplies records in authority order. An exact tie
  // must accept the incoming value, including legacy menu records with no
  // revision timestamp yet.
  return incomingRecord;
}

function getRecordSortTime(record: unknown) {
  if (typeof record !== "object" || record === null) return 0;
  const candidate = record as {
    createdAt?: unknown;
    movedAt?: unknown;
    usedAt?: unknown;
    closedAt?: unknown;
  };
  const rawValue = candidate.createdAt ?? candidate.movedAt ?? candidate.usedAt ?? candidate.closedAt ?? 0;
  const value = typeof rawValue === "string" ? Date.parse(rawValue) : Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

export function mergeSyncRecords(currentRecords: unknown[], incomingRecords: unknown[]) {
  const mergedById = new Map<string, unknown>();
  const recordsWithoutId: unknown[] = [];

  for (const record of currentRecords) {
    const id = getSyncRecordId(record);
    if (id) {
      const existingRecord = mergedById.get(id);
      mergedById.set(id, existingRecord ? chooseIncomingSyncRecord(existingRecord, record) : record);
    } else {
      recordsWithoutId.push(record);
    }
  }

  for (const record of incomingRecords) {
    const id = getSyncRecordId(record);
    if (id) {
      const existingRecord = mergedById.get(id);
      mergedById.set(id, existingRecord ? chooseIncomingSyncRecord(existingRecord, record) : record);
    } else {
      recordsWithoutId.push(record);
    }
  }

  return [...Array.from(mergedById.values()), ...recordsWithoutId].sort(
    (left, right) => getRecordSortTime(right) - getRecordSortTime(left),
  );
}
