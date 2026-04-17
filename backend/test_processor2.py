import asyncio
from app.db.supabase import db

async def test():
    note = await db.insert_note(
        raw_text="This is a test note about Docker and Kubernetes. It should be placed on a DevOps page.",
        source_url="https://example.com/devops",
        source_title="K8s",
        capture_type="text",
        processing_status="pending",
        user_id=None
    )
    print(f"Created note: {note['id']}")

    from app.services.processor import processor
    await processor.process_note(note["id"], note["raw_text"])
    
    note_after = await db.get_note(note["id"])
    page_id = note_after.get("page_id")
    
    if page_id:
        scene = await db.get_scene(page_id)
        if scene and scene.get("elements"):
            elements = scene.get("elements", [])
            print(f"SUCCESS: Scene has {len(elements)} elements.")
        else:
            print("FAILED: Scene is Empty or None!")

asyncio.run(test())