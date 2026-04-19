"""LLM prompt templates — centralized."""

CHAT_SYSTEM = """You are Mnemos, a personal knowledge assistant. ALWAYS use the user's notes provided in context to answer, citing note titles. If notes are insufficient, use general knowledge but EXPLICITLY state that. Be concise and helpful."""

FOLLOW_UP_PROMPT = """Given this Q&A, suggest 2-3 follow-up questions.
Return JSON: ["question1", "question2", "question3"]

Question: {question}
Answer: {answer}"""