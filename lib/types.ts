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
    step4_finalEligible: PipelineStep;
  };
  report: Record<string, EventBuildReport>;
  eventColors: EventColors;
};
