import { sql } from "@/lib/db";
import { isUuid } from "@/lib/security";

export type SavedTurn = {
  question: string;
  answer: string;
  grounded: boolean;
  citations: unknown;
  reranker?: string | null;
};

function makeTitle(question: string): string {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

/**
 * Appends one Q&A turn to a conversation, creating the conversation on
 * first use. A conversationId that doesn't exist or belongs to someone
 * else is silently treated as "start a new one" — never an error, never
 * a way to write into another user's thread.
 * Returns the conversation id the turn was saved under.
 */
export async function saveChatTurn(
  userId: string,
  conversationId: unknown,
  turn: SavedTurn,
  channel: "web" | "telegram" = "web",
): Promise<string> {
  let convId: string | null = null;
  if (isUuid(conversationId)) {
    const rows = await sql`
      select id from chat_conversations
      where id = ${conversationId} and user_id = ${userId}
    `;
    if (rows.length > 0) convId = conversationId;
  }
  if (!convId) {
    const [c] = await sql`
      insert into chat_conversations (user_id, title, channel)
      values (${userId}, ${makeTitle(turn.question)}, ${channel})
      returning id
    `;
    convId = c.id as string;
  }
  await sql`
    insert into chat_turns
      (conversation_id, user_id, question, answer, grounded, citations, reranker)
    values (
      ${convId}, ${userId}, ${turn.question}, ${turn.answer}, ${turn.grounded},
      ${sql.json((turn.citations ?? []) as Parameters<typeof sql.json>[0])}, ${turn.reranker ?? null}
    )
  `;
  await sql`update chat_conversations set updated_at = now() where id = ${convId}`;
  return convId;
}
