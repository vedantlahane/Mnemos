from fastapi import APIRouter
from app.models.schemas import ChatRequest
from app.services import llm, embeddings
from app.db.supabase import db

router = APIRouter()


@router.post("/chat")
async def chat_with_notes(payload: ChatRequest):
    query_embedding = await embeddings.generate_query(payload.question)

    relevant = await db.vector_search(
        query_embedding, limit=5, threshold=0.65
    )

    if not relevant:
        return {
            "answer": "I couldn't find any related notes in your knowledge base.",
            "sources": [],
        }

    context = "\n\n---\n\n".join(
        [
            f"Note: {n['title']}\n"
            f"Summary: {n.get('summary', 'No summary')}\n"
            f"Content: {n['raw_text'][:1000]}\n"
            f"Tags: {', '.join(n.get('tags', []))}"
            for n in relevant
        ]
    )

    answer = await llm.chat(
        question=payload.question,
        context=context,
        history=payload.history,
    )

    return {
        "answer": answer,
        "sources": [
            {
                "id": n["id"],
                "title": n["title"],
                "similarity": n["similarity"],
            }
            for n in relevant
        ],
    }