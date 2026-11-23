"use client";

import { useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import DocumentsPanel, { type DocumentRow } from "@/components/DocumentsPanel";

/**
 * Home — chat in the center (the primary thing you do here), your
 * documents on the right (what the chat is answering from). On
 * anything narrower than a desktop there isn't room for both side by
 * side without squeezing the chat unusably, so documents drop below
 * the chat instead of sharing the row.
 */
export default function Workspace() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const readyCount = docs.filter((d) => d.status === "ready").length;
  const filenameById = Object.fromEntries(docs.map((d) => [d.id, d.filename]));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <ChatPanel readyCount={readyCount} filenameById={filenameById} />
      <DocumentsPanel compact onDocsChange={setDocs} />
    </div>
  );
}
