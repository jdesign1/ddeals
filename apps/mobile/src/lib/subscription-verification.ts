export function appleTransactionVerificationKey(
  transactionId: string,
  jwsRepresentation: string,
  accountId: string,
): string {
  const transactionKey = transactionId || jwsRepresentation;
  return `${accountId}:${transactionKey}`;
}
