export type PartnerAccessScope =
  | { kind: "global" }
  | { kind: "restricted"; partnerIds: string[] };
