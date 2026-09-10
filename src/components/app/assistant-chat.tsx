import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, X } from "lucide-react";
import { askGuestAssistant, askStaffAssistant } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS: Record<string, string[]> = {
  guest: [
    "How do I report a maintenance issue?",
    "What happens after I submit a report?",
    "Track my ticket MX-2026-00001",
    "Is it safe to stay in the room while I wait?",
  ],
  receptionist: [
    "Which tickets are still unassigned?",
    "How does AI assignment choose a technician?",
    "Which tickets are escalated and why?",
    "How do I assign an outsourced technician?",
  ],
  hotel_manager: [
    "Give me a summary of open tickets.",
    "What do the report charts show?",
    "Which tickets are escalated?",
    "How do SLA targets work?",
  ],
  admin: [
    "Give me a summary of open tickets.",
    "How does escalation work?",
    "How are priorities decided?",
    "What do the ticket statuses mean?",
  ],
  technician: [
    "What jobs are assigned to me?",
    "How do I use My Jobs?",
    "What do I do if I can't resolve a job?",
    "Why can I only have one job In Progress?",
  ],
};

const GREETING: Record<string, string> = {
  guest: "Hi! I'm the MaintainX assistant. I can explain how to report an issue, share safety tips, or check a ticket if you give me its exact ticket number.",
  receptionist:
    "Hi! I'm the MaintainX assistant. Ask me about assignment, escalation, priorities, statuses, or your unassigned tickets.",
  hotel_manager:
    "Hi! I'm the MaintainX assistant. Ask me about dashboards, reports, escalation or your current ticket picture.",
  admin: "Hi! I'm the MaintainX assistant. Ask me anything about how MaintainX works.",
  technician:
    "Hi! I'm the MaintainX assistant. Ask me about your assigned jobs, statuses or how My Jobs works.",
};

export function AssistantChat({ audience }: { audience: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const askGuest = useServerFn(askGuestAssistant);
  const askStaff = useServerFn(askStaffAssistant);
  const isGuest = audience === "guest";

  const suggestions = SUGGESTIONS[audience] ?? SUGGESTIONS["guest"]!;
  const greeting = GREETING[audience] ?? GREETING["guest"]!;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy, open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    const history = turns;
    setTurns([...history, { role: "user", content: message }]);
    setInput("");
    setBusy(true);
    try {
      const result = isGuest
        ? await askGuest({ data: { message, history } })
        : await askStaff({ data: { message, history } });
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.ok ? result.reply : result.error,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't reach the assistant. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <Button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-50 h-12 gap-2 rounded-full px-4 shadow-lg sm:right-6 sm:bottom-6"
          aria-label="Open the MaintainX assistant"
        >
          <MessageCircle className="size-5" aria-hidden />
          <span className="hidden sm:inline">Ask MaintainX</span>
        </Button>
      )}

      {open && (
        <div
          className="fixed inset-x-3 bottom-3 z-50 flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:h-[560px] sm:w-[380px]"
          role="dialog"
          aria-label="MaintainX assistant"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">MaintainX Assistant</p>
              <p className="truncate text-xs text-muted-foreground">
                Guidance and read-only information
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            <p className="text-sm text-foreground">{greeting}</p>
            {turns.length === 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turns.map((turn, index) => (
              <div
                key={index}
                className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                    turn.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {turn.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">Thinking…</p>}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 border-t border-border p-3"
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Ask a question…"
              aria-label="Message the assistant"
              className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
