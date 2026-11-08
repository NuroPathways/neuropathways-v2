import { and, inArray, ne } from "drizzle-orm";
import { clientSessionsTable, mobileTokensTable } from "@workspace/db";

/**
 * Invalidate legacy web and mobile sessions for a credential scope.
 * An authenticated mobile code change may retain only the session performing it.
 */
export async function revokeClientSessionsForChildren(
  tx: any,
  childIds: string[],
  keepMobileToken?: string,
): Promise<void> {
  if (childIds.length === 0) return;

  await tx.delete(clientSessionsTable)
    .where(inArray(clientSessionsTable.childId, childIds));

  const mobileScope = keepMobileToken
    ? and(
      inArray(mobileTokensTable.childId, childIds),
      ne(mobileTokensTable.token, keepMobileToken),
    )
    : inArray(mobileTokensTable.childId, childIds);
  await tx.delete(mobileTokensTable).where(mobileScope);
}
