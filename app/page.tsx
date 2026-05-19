import TicketManager from "@/components/TicketManager";
import participants from "@/data/participants.json";
import preScanned from "@/data/preScanned.json";
import futureFreeTickets from "@/data/futureFreeTickets.json";
import futureBlocklist from "@/data/futureBlocklist.json";
import meta from "@/data/meta.json";
import type { BuildMeta, FutureBlocklist, FutureFreeTicket, Participant } from "@/lib/types";

export default function HomePage() {
  const m = meta as BuildMeta;

  return (
    <TicketManager
      participants={participants as Participant[]}
      preScanned={preScanned as Record<string, boolean>}
      futureFreeTickets={futureFreeTickets as FutureFreeTicket[]}
      futureBlocklist={futureBlocklist as FutureBlocklist}
      eventColors={m.eventColors}
      pipeline={m.pipeline}
      generatedAt={m.generatedAt}
    />
  );
}
