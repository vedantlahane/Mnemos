import asyncio
from app.db.supabase import db

async def test():
    # Insert a dummy note
    note = await db.insert_note(
        raw_text="This is a test note about Python and React. It should be processed and placed on a new page called Tech Stack.",
        source_url="https://example.com/tech",
        source_title="Tech",
        capture_type="text",
        processing_status="pending",
        user_id=None
    )
    print(f"Created note: {note['id']}")

    from app.services.processor import processor
    await processor.process_note(note["id"], note["raw_text"])
    print("Processing complete.")
    
    # check page
    note_after = await db.get_note(note["id"])
    page_id = note_after.get("page_id")
    print(f"Note is now assigned to page_id: {page_id}")
    
    if page_id:
        page = await db.get_page(page_id)
        if page:
            print(f"Page name: {page['name']}")
        
        # check scene
        scene = await db.get_scene(page_id)
        if scene and scene.get("data"):
            elements = scene["data"].get("elements", [])
            print(f"Scene has {len(elements)} elements.")
        else:
            print(f"Scene dict keys: {scene.keys() if scene else 'None'}")

asyncio.run(test())
