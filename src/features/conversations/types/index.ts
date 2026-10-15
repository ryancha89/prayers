/** Conversation history types (spec §30). */

export interface ChatMessage {
  id: string;
  role: 'user' | 'counselor';
  text: string;
  at: string; // ISO
}

export interface ConversationSummary {
  sessionId: string;

  counselorId: string;
  counselorName: string;
  counselorAccent: string; // placeholder portrait tint (MVP)

  lastMessage: string;
  updatedAt: string; // ISO

  unreadCount?: number;
  subjectId?: string;

  /** Short label of what was last discussed — powers the resume greeting (§31). */
  lastTopicSummary?: string;

  /** Full transcript kept locally so a resumed room can show prior context. */
  messages: ChatMessage[];
}
