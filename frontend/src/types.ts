export interface Note {
  id: string
  title: string | null
  raw_text: string
  summary: string | null
  tags: string[]
  tasks: string[]
  entities: string[]
  source_url: string | null
  page_title: string | null
  capture_type: string
  processing_status: string
  related_note_ids: string[]
  created_at: string
  updated_at: string
  similarity?: number
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  sources?: ChatSource[]
}

export interface ChatSource {
  id: string
  title: string
  similarity: number
}
