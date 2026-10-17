import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { useHistoryHand } from "@/lib/history/use-history-pages";
import { HandDetailPage } from "./hand-detail-page";
import { HandsPage } from "./hands-page";
import { useLedgerReadable } from "./ledger/ledger-stage";
import { PageStack } from "./ledger/page-stack";
import { SessionsPage } from "./sessions-page";

export function HistoryScreen({
  level,
  sessionId,
  handId,
  revealed,
  back,
  openSession,
  openHand,
}: {
  level: number;
  sessionId?: string;
  handId?: string;
  revealed: boolean;
  back: () => void;
  openSession: (id: string) => void;
  openHand: (id: string) => void;
}) {
  const readable = useLedgerReadable();
  const reduced = useReduceMotion();
  const dealActive = revealed && readable && !reduced;
  const detail = useHistoryHand(handId);
  const selected = detail.row?.hand.sessionId === sessionId ? detail.row : null;
  const dealing = (page: number) => dealActive && page === level;
  return (
    <PageStack level={level}>
      {[
        <SessionsPage
          key="sessions"
          active={dealing(0)}
          openSession={openSession}
        />,
        <HandsPage
          key={"hands-" + (sessionId ?? "")}
          sessionId={sessionId}
          active={dealing(1)}
          back={back}
          openHand={openHand}
        />,
        <HandDetailPage
          key={"detail-" + (sessionId ?? "") + "-" + (handId ?? "")}
          row={selected}
          loading={detail.loading}
          active={dealing(2)}
          back={back}
        />,
      ]}
    </PageStack>
  );
}
