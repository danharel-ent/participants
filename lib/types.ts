export type Participant = {
  שם: string;
  טלפון: string;
  אימייל: string;
  כרטיס: string;
  אירוע: string;
  order_id: string;
  qr: string;
};

export type FutureFreeTicket = {
  שם: string;
  טלפון: string;
  מקור: string;
  order_id: string;
  כרטיס: string;
};

export type FutureBlocklist = {
  phones: string[];
  emails: string[];
  qrIds: string[];
  orderIds: string[];
  names: string[];
};

export type EventColor = {
  a: string;
  t: string;
  tc: string;
};

export type EventColors = Record<string, EventColor>;

export type EventBuildReport = {
  rows?: number;
  scannedRows?: number;
  identityMatched?: number;
  removedTotal?: number;
  eligible?: number;
  source?: string;
  total?: number;
  scannedMatchedFromOtherZygoCsv?: number;
  note?: string;
};

export type PipelineStep = {
  description: string;
  byEvent?: Record<string, number>;
  total?: number;
  removed?: number;
  removedByEvent?: Record<string, number>;
  totalRemoved?: number;
  futureFreeTicketCount?: number;
  futureFiles?: Record<
    string,
    { totalRows: number; freeTicketRows: number; scannedRows?: number; activeOrders?: number }
  >;
  uniqueFreeIdentities?: { phones: number; emails: number };
  fuzzyNameRemoved?: number;
  sourceRows?: number;
  rowsWithoutPhone?: number;
  file?: string;
};

export type BuildMeta = {
  generatedAt: string;
  model?: string;
  byEvent: Record<string, number>;
  totalEligible: number;
  totalPreScanned: number;
  pipeline: {
    step1_purimPaid: PipelineStep;
    step2_afterPurimScans: PipelineStep;
    step3_afterFutureMatch: PipelineStep;
    step4_afterRedeemedXlsx?: PipelineStep;
    step4_finalEligible: PipelineStep;
  };
  report: Record<string, EventBuildReport>;
  eventColors: EventColors;
};

export type RedeemRecord = {
  key: string;
  createdAt: string;
  שם?: string;
  אירוע?: string;
  order_id?: string;
  byHash?: string;
};

export type RedeemStoreKind = "github" | "redis" | "memory";

export type RedeemsSnapshot = {
  keys: string[];
  records: RedeemRecord[];
  count: number;
  store: RedeemStoreKind;
};

export type ApiOk<T> = {
  ok: true;
  data: T;
  meta: { updatedAt: string };
};

export type ApiErr = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  meta: { updatedAt: string };
};

export type ApiResponse<T> = ApiOk<T> | ApiErr;
