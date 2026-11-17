/** Quem causou uma transição: o vendedor autenticado ou o próprio sistema. */
export type Actor = { type: 'seller'; sellerId: string } | { type: 'system' };

export const SYSTEM_ACTOR: Actor = { type: 'system' };

export const sellerActor = (sellerId: string): Actor => ({
  type: 'seller',
  sellerId,
});
