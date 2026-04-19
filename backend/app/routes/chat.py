from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest
from app.db.supabase import db
from app.services import embeddings
from app.llm import router as llm
from app.llm.prompts import CHAT_SYSTEM, FOLLOW_UP_PROMPT
from app.auth.dependencies import get_optional_user_id
from app.config import settings
import asyncio
import json

router = APIRouter()


@router.post("/chat")
async def chat(payload: ChatRequest,
               user_id: str = Depends(get_optional_user_id)):
    # Gather context from notes
    context = ""
    try:
        query_emb = await embeddings.generate_query(payload.question)
        if payload.page_id:
            relevant = await db.vector_search_in_page(
                query_emb, payload.page_id, limit=8, threshold=0.5,
            )
        else:
            relevant = await db.vector_search(query_emb, limit=8, threshold=0.55)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]
        if relevant:
            context = "\n\n".join(
                f"[{n.get('title', 'Untitled')}]: {n.get('summary') or n.get('raw_text', '')[:300]}"
                for n in relevant[:8]
            )
    except Exception:
        pass

    system = CHAT_SYSTEM
    if context:
        system += f"\n\nRelevant notes:\n{context}"

    messages = payload.history + [{"role": "user", "content": payload.question}]
    answer = await llm.chat(system, messages, user_id=user_id)

    # Generate follow-ups
    follow_ups = []
    try:
        fu_prompt = FOLLOW_UP_PROMPT.format(question=payload.question, answer=answer[:500])
        fu_response = await llm.chat(
            "Return JSON array of follow-up questions.",
            [{"role": "user", "content": fu_prompt}],
            user_id=user_id,
        )
        fu_data = json.loads(fu_response) if fu_response.strip().startswith("[") else []
        follow_ups = [str(q) for q in fu_data[:3]]
    except Exception:
        pass

    # Save chat history
    try:
        chat_messages = messages + [{"role": "assistant", "content": answer}]
        await db.insert_chat(
            user_id=user_id,
            page_id=payload.page_id,
            context_type=payload.context_type,
            messages=chat_messages,
            title=payload.question[:100],
        )
    except Exception:
        pass

    return {
        "answer": answer,
        "follow_ups": follow_ups,
        "sources": [
            {"title": n.get("title", "Untitled"), "id": n.get("id"),
             "similarity": n.get("similarity", 0)}
            for n in (relevant[:5] if 'relevant' in dir() else [])
        ],
    }


@router.post("/chat/stream")
async def chat_stream(payload: ChatRequest,
                      user_id: str = Depends(get_optional_user_id)):
    context = ""
    relevant = []
    try:
        query_emb = await embeddings.generate_query(payload.question)
        if payload.page_id:
            relevant = await db.vector_search_in_page(
                query_emb, payload.page_id, limit=8, threshold=0.5,
            )
        else:
            relevant = await db.vector_search(query_emb, limit=8, threshold=0.55)
        if user_id:
            relevant = [r for r in relevant if r.get("user_id") == user_id]
        if relevant:
            context = "\n\n".join(
                f"[{n.get('title', 'Untitled')}]: {n.get('summary') or n.get('raw_text', '')[:300]}"
                for n in relevant[:8]
            )
    except Exception:
        pass

    system = CHAT_SYSTEM
    if context:
        system += f"\n\nRelevant notes:\n{context}"

    messages = payload.history + [{"role": "user", "content": payload.question}]

    async def generate():
        # Send sources first
        sources = [
            {"title": n.get("title", "Untitled"), "id": n.get("id"),
             "similarity": n.get("similarity", 0)}
            for n in relevant[:5]
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # Stream answer
        full_answer = ""
        try:
            primary, _ = await llm._runtime_models(user_id)
            from app.services.composition import _streaming_llm
            from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

            llm_inst = _streaming_llm(primary)
            lc_messages = [SystemMessage(content=system)]
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "user":
                    lc_messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    lc_messages.append(AIMessage(content=content))

            async for chunk in llm_inst.astream(lc_messages):
                text = chunk.content if hasattr(chunk, "content") else str(chunk)
                if text:
                    full_answer += text
                    yield f"data: {json.dumps({'type': 'chunk', 'content': text})}\n\n"
                    await asyncio.sleep(settings.stream_chunk_delay)
        except Exception as e:
            # Fallback to non-streaming
            full_answer = await llm.chat(system, messages, user_id=user_id)
            yield f"data: {json.dumps({'type': 'chunk', 'content': full_answer})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'full_answer': full_answer})}\n\n"

        # Save history
        try:
            chat_messages = messages + [{"role": "assistant", "content": full_answer}]
            await db.insert_chat(
                user_id=user_id, page_id=payload.page_id,
                context_type=payload.context_type,
                messages=chat_messages, title=payload.question[:100],
            )
        except Exception:
            pass

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/chat/history")
async def chat_history(page_id: str = None, limit: int = 20,
                       user_id: str = Depends(get_optional_user_id)):
    chats = await db.list_chats(user_id=user_id, page_id=page_id, limit=limit)
    return {"chats": chats}


@router.get("/chat/{chat_id}")
async def get_chat(chat_id: str):
    chat_data = await db.get_chat(chat_id)
    if not chat_data:
        raise HTTPException(status_code=404, detail="Chat not found")
    return chat_data


@router.delete("/chat/{chat_id}")
async def delete_chat(chat_id: str):
    await db.delete_chat(chat_id)
    return {"status": "deleted"}