export type RedeemRecord = {
  key: string;
  createdAt: string;
  שם?: string;
  אירוע?: string;
  order_id?: string;
  byHash?: string;
};

export type RedeemStoreType = "github" | "redis" | "memory";

export type RedeemStore = {
  type: RedeemStoreType;
  listKeys: () => Promise<string[]>;
  listRecords: () => Promise<RedeemRecord[]>;
  addRedeem: (record: RedeemRecord) => Promise<{ created: boolean; record: RedeemRecord }>;
  removeRedeem: (key: string) => Promise<boolean>;
  clear: () => Promise<void>;
};
