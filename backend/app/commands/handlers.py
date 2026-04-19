# === FILE: backend/app/commands/handlers.py ===

"""
Each handler takes a classified command and returns a CommandResponse.
Handlers are thin — they call services and format the response.
"""

from __future__ import annotations
import logging

from app.commands.responses import CommandResponse
from app.db.repo import repo
from app.services import capture as capture_svc
from app.services import search as search_svc
from app.services.placement import find_placement
from app.canvas import canvas_renderer
from app.canvas.layout import layout_diagram
from app.llm import router as llm_router
from app.core.config import settings
from app.core.events import bus, Event, ITEM_CREATED, CANVAS_CHANGED

logger = logging.getLogger("mnemos.handlers")


async def handle(
    intent: str,
    action: str,
    params: dict,
    message: str,
    owner_id: str = None,
    workspace_id: str = None,
) -> CommandResponse:
    """Dispatch to the right handler."""
    ctx = {"owner_id": owner_id, "workspace_id": workspace_id}

    try:
        if intent == "navigate":
            return await _handle_navigate(action, params, ctx)
        elif intent == "capture":
            return await _handle_capture(action, params, message, ctx)
        elif intent == "query":
            return await _handle_query(action, params, message, ctx)
        elif intent == "canvas":
            return await _handle_canvas(action, params, message, ctx)
        elif intent == "manage":
            return await _handle_manage(action, params, ctx)
        elif intent == "settings":
            return await _handle_settings(action, params, ctx)
        else:
            return await _handle_chat(action, message, ctx)
    except Exception as e:
        logger.error(f"Handler failed: {intent}/{action}: {e}")
        return CommandResponse(
            text=f"Something went wrong: {str(e)}",
            intent=intent, error=str(e),
        )


# ═══════════════════════════════════════
# NAVIGATE
# ═══════════════════════════════════════

async def _handle_navigate(action: str, params: dict, ctx: dict) -> CommandResponse:
    owner_id = ctx["owner_id"]

    if action == "open_settings":
        prefs = None
        if owner_id:
            prefs = await repo.get_preferences(owner_id)
        if not prefs:
            prefs = {
                "theme": "dark",
                "primary_model": settings.gemini_model,
                "secondary_model": settings.groq_model,
                "similarity_threshold": settings.similarity_threshold,
                "auto_layout": True,
                "auto_connect": True,
            }
        return CommandResponse(
            text="Here are your settings.",
            intent="navigate", ui_action="open_settings",
            data=prefs,
        )

    if action == "list_boards":
        boards = await repo.list_workspaces(owner_id=owner_id)
        names = [b["display_name"] for b in boards]
        return CommandResponse(
            text=f"You have {len(boards)} board{'s' if len(boards) != 1 else ''}: {', '.join(names) or 'none yet'}.",
            intent="navigate", ui_action="list_boards",
            data={"boards": boards},
        )

    if action == "list_items":
        result = await repo.list_items(owner_id=owner_id, limit=50)
        return CommandResponse(
            text=f"Showing {len(result['items'])} of {result['total']} items.",
            intent="navigate", ui_action="list_items",
            data=result,
        )

    if action == "open_board":
        board_ref = params.get("board_ref", "")
        board = await repo.get_workspace_by_slug(board_ref, owner_id=owner_id)
        if not board:
            # Try fuzzy match on display_name
            boards = await repo.list_workspaces(owner_id=owner_id)
            board = next(
                (b for b in boards
                 if board_ref.lower() in b["display_name"].lower()),
                None,
            )
        if not board:
            return CommandResponse(
                text=f"I couldn't find a board called '{board_ref}'. Say 'show boards' to see all.",
                intent="navigate",
            )
        return CommandResponse(
            text=f"Opening **{board['display_name']}**.",
            intent="navigate", ui_action="open_board",
            data={"board": board},
        )

    if action == "open_graph":
        items_r = await repo.list_items(owner_id=owner_id, limit=500)
        connections = await repo.get_all_connections(owner_id=owner_id)
        nodes = [
            {"id": i["id"], "title": i.get("title") or "Untitled",
             "tags": i.get("tags", []), "content_type": i.get("content_type")}
            for i in items_r["items"]
        ]
        edges = [
            {"id": c["id"], "source": c["from_id"], "target": c["to_id"],
             "type": c.get("rel_type", "related"), "label": c.get("label"),
             "weight": c.get("score", 0)}
            for c in connections
        ]
        return CommandResponse(
            text=f"Knowledge graph: {len(nodes)} nodes, {len(edges)} connections.",
            intent="navigate", ui_action="open_graph",
            data={"nodes": nodes, "edges": edges},
        )

    if action == "list_tags":
        tags = await repo.get_all_tags(owner_id=owner_id)
        tag_str = ", ".join(f"#{t['name']} ({t['count']})" for t in tags[:20])
        return CommandResponse(
            text=f"Your tags: {tag_str or 'none yet'}.",
            intent="navigate", ui_action="list_tags",
            data={"tags": tags},
        )

    if action == "show_stats":
        stats = await repo.get_stats(owner_id=owner_id)
        return CommandResponse(
            text=(
                f"**Dashboard**: {stats['total_items']} items across "
                f"{stats['total_workspaces']} boards, {stats['total_tags']} tags."
            ),
            intent="navigate", ui_action="show_stats",
            data=stats,
        )

    return CommandResponse(text="I'm not sure what to open.", intent="navigate")


# ═══════════════════════════════════════
# CAPTURE
# ═══════════════════════════════════════

async def _handle_capture(action: str, params: dict,
                          message: str, ctx: dict) -> CommandResponse:
    text = params.get("text") or message
    owner_id = ctx["owner_id"]
    workspace_id = ctx.get("workspace_id")
    board_hint = params.get("board_hint")

    # Create the item
    item = await repo.create_item(
        source_text=text,
        source_type="manual",
        owner_id=owner_id,
        status="pending",
    )

    # Fire event — capture service listens and processes async
    await bus.emit(Event(ITEM_CREATED, {
        "item_id": item["id"],
        "source_text": text,
        "board_hint": board_hint,
        "workspace_id": workspace_id,
        "owner_id": owner_id,
    }))

    return CommandResponse(
        text=f"Captured! Processing your note now.",
        intent="capture",
        data={"item_id": item["id"], "status": "processing"},
    )


# ═══════════════════════════════════════
# QUERY / SEARCH
# ═══════════════════════════════════════

async def _handle_query(action: str, params: dict,
                        message: str, ctx: dict) -> CommandResponse:
    query = params.get("query") or params.get("topic") or message
    owner_id = ctx["owner_id"]
    workspace_id = ctx.get("workspace_id")

    results = await search_svc.semantic_search(
        query=query,
        owner_id=owner_id,
        workspace_id=workspace_id,
        limit=8,
    )

    if not results:
        return CommandResponse(
            text=f"No items found matching '{query}'.",
            intent="query", ui_action="show_search",
            data={"query": query, "results": []},
        )

    summary_parts = []
    for r in results[:5]:
        title = r.get("title") or "Untitled"
        sim = r.get("similarity", 0)
        summary_parts.append(f"• **{title}** ({sim:.0%})")

    return CommandResponse(
        text=f"Found {len(results)} items:\n" + "\n".join(summary_parts),
        intent="query", ui_action="show_search",
        data={"query": query, "results": results},
    )


# ═══════════════════════════════════════
# CANVAS
# ═══════════════════════════════════════

async def _handle_canvas(action: str, params: dict,
                         message: str, ctx: dict) -> CommandResponse:
    workspace_id = ctx.get("workspace_id")
    owner_id = ctx["owner_id"]

    if not workspace_id:
        return CommandResponse(
            text="Open a board first before modifying the canvas. Say 'show boards'.",
            intent="canvas",
        )

    ws = await repo.get_workspace(workspace_id, owner_id=owner_id)
    if not ws:
        return CommandResponse(
            text="Board not found.", intent="canvas", error="board_not_found",
        )

    if action == "add_diagram":
        return await _canvas_add_diagram(params, workspace_id, owner_id)

    if action == "add_sticky":
        return await _canvas_add_sticky(params, workspace_id, owner_id)

    if action == "compose":
        return await _canvas_compose(params, workspace_id, owner_id)

    if action in ("set_dark", "set_light"):
        theme = "dark" if action == "set_dark" else "light"
        bg = "#0e0e1a" if theme == "dark" else "#ffffff"
        stored = await repo.get_canvas(workspace_id)
        new_version = stored["version"] + 1
        # Rebuild scene with new theme
        items = await repo.get_items_for_workspace(workspace_id, owner_id)
        placements = await repo.get_placements(workspace_id)
        objects = await repo.get_canvas_objects(workspace_id)
        user_drawn = canvas_renderer.extract_user_drawn(
            stored["scene"].get("elements", []),
        )
        scene = canvas_renderer.build_scene(
            items, placements, objects, user_drawn,
            theme=theme, background=bg,
        )
        await repo.save_canvas(workspace_id, scene, new_version,
                               theme=theme, background=bg)
        return CommandResponse(
            text=f"Switched to {theme} mode.",
            intent="canvas",
            canvas_update={"version": new_version, "action": "reload"},
        )

    if action == "rebuild":
        return await _canvas_rebuild(workspace_id, owner_id)

    return CommandResponse(text="Canvas action not recognized.", intent="canvas")


async def _canvas_add_diagram(params: dict, workspace_id: str,
                              owner_id: str) -> CommandResponse:
    topic = params.get("topic", "untitled diagram")

    # Generate topology via LLM
    topology = await llm_router.generate_diagram(topic, user_id=owner_id)

    # Get current canvas state for placement
    stored = await repo.get_canvas(workspace_id)
    scene_elements = stored["scene"].get("elements", [])
    occupied = [
        {"x": e.get("x", 0), "y": e.get("y", 0),
         "width": e.get("width", 0), "height": e.get("height", 0)}
        for e in scene_elements if not e.get("isDeleted") and e.get("width", 0) > 0
    ]

    # Place diagram
    placement = _find_free_spot(occupied)
    f = canvas_renderer.factory(stored.get("theme", "dark"))
    diagram_elements, bbox = layout_diagram(
        topology, placement["x"], placement["y"], f,
    )

    # Store as canvas_object
    obj = await repo.create_canvas_object(
        workspace_id=workspace_id,
        kind="diagram", origin="ai",
        excalidraw_ids=[e["id"] for e in diagram_elements],
        x=bbox["x"], y=bbox["y"],
        w=bbox["width"], h=bbox["height"],
        content=topic,
        meta={"topology": topology},
    )

    # Rebuild and save scene
    new_version = stored["version"] + 1
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    placements_db = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    user_drawn = canvas_renderer.extract_user_drawn(scene_elements)
    # Add diagram elements to user_drawn since renderer doesn't handle diagrams yet
    user_drawn.extend(diagram_elements)

    scene = canvas_renderer.build_scene(
        items, placements_db, objects, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )
    await repo.save_canvas(workspace_id, scene, new_version)
    await repo.log_op(workspace_id, new_version, "diagram_added",
                      actor="ai", data={"topic": topic, "bbox": bbox})

    return CommandResponse(
        text=f"Created a diagram about **{topic}**.",
        intent="canvas",
        canvas_update={"version": new_version, "action": "reload"},
        data={"bbox": bbox, "object_id": obj.get("id")},
    )


async def _canvas_add_sticky(params: dict, workspace_id: str,
                              owner_id: str) -> CommandResponse:
    content = params.get("content", "")
    color = params.get("color", "#fef08a")

    if not content:
        return CommandResponse(
            text="What should the sticky note say?",
            intent="canvas",
        )

    stored = await repo.get_canvas(workspace_id)
    scene_elements = stored["scene"].get("elements", [])
    occupied = [
        {"x": e.get("x", 0), "y": e.get("y", 0),
         "width": e.get("width", 0), "height": e.get("height", 0)}
        for e in scene_elements if not e.get("isDeleted") and e.get("width", 0) > 0
    ]
    placement = _find_free_spot(occupied, size=(180, 160))

    obj = await repo.create_canvas_object(
        workspace_id=workspace_id,
        kind="sticky", origin="ai",
        x=placement["x"], y=placement["y"], w=180, h=160,
        content=content,
        meta={"color": color},
    )

    # Rebuild scene
    new_version = stored["version"] + 1
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    placements_db = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    user_drawn = canvas_renderer.extract_user_drawn(scene_elements)

    scene = canvas_renderer.build_scene(
        items, placements_db, objects, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )
    await repo.save_canvas(workspace_id, scene, new_version)
    await repo.log_op(workspace_id, new_version, "element_added",
                      actor="ai", data={"type": "sticky"})

    return CommandResponse(
        text=f"Added a sticky note: \"{content[:60]}\"",
        intent="canvas",
        canvas_update={"version": new_version, "action": "reload"},
    )


async def _canvas_compose(params: dict, workspace_id: str,
                          owner_id: str) -> CommandResponse:
    topic = params.get("topic", "")
    if not topic:
        return CommandResponse(text="What should I write about?", intent="canvas")

    # Gather context from related items
    from app.services.composition import compose_content
    content = await compose_content(topic, workspace_id, owner_id)

    stored = await repo.get_canvas(workspace_id)
    scene_elements = stored["scene"].get("elements", [])
    occupied = [
        {"x": e.get("x", 0), "y": e.get("y", 0),
         "width": e.get("width", 0), "height": e.get("height", 0)}
        for e in scene_elements if not e.get("isDeleted") and e.get("width", 0) > 0
    ]
    placement = _find_free_spot(occupied, size=(500, 300))

    obj = await repo.create_canvas_object(
        workspace_id=workspace_id,
        kind="text", origin="ai",
        x=placement["x"], y=placement["y"], w=500, h=300,
        content=content,
        meta={"topic": topic},
    )

    new_version = stored["version"] + 1
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    placements_db = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    user_drawn = canvas_renderer.extract_user_drawn(scene_elements)

    scene = canvas_renderer.build_scene(
        items, placements_db, objects, user_drawn,
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )
    await repo.save_canvas(workspace_id, scene, new_version)
    await repo.log_op(workspace_id, new_version, "element_added",
                      actor="ai", data={"type": "composed_text", "topic": topic})

    return CommandResponse(
        text=f"Wrote about **{topic}** on the canvas.",
        intent="canvas",
        canvas_update={"version": new_version, "action": "reload"},
    )


async def _canvas_rebuild(workspace_id: str, owner_id: str) -> CommandResponse:
    """Nuclear option — rebuild entire canvas from items + placements."""
    from app.services.placement import sequential_layout

    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    objects = await repo.get_canvas_objects(workspace_id)

    # Recalculate all placements
    new_placements = sequential_layout(items)
    for p in new_placements:
        await repo.upsert_placement(
            workspace_id, p["item_id"],
            p["x"], p["y"], p["w"], p["h"],
        )

    stored = await repo.get_canvas(workspace_id)
    new_version = stored["version"] + 1

    scene = canvas_renderer.build_scene(
        items, new_placements, objects, [],
        theme=stored.get("theme", "dark"),
        background=stored.get("background", "#0e0e1a"),
    )
    await repo.save_canvas(workspace_id, scene, new_version)
    await repo.log_op(workspace_id, new_version, "full_rebuild",
                      actor="system", data={"item_count": len(items)})

    return CommandResponse(
        text=f"Canvas rebuilt with {len(items)} items.",
        intent="canvas",
        canvas_update={"version": new_version, "action": "reload"},
    )


# ═══════════════════════════════════════
# MANAGE
# ═══════════════════════════════════════

async def _handle_manage(action: str, params: dict, ctx: dict) -> CommandResponse:
    owner_id = ctx["owner_id"]

    if action == "create_board":
        name = params.get("name", "").strip()
        if not name:
            return CommandResponse(text="What should I name the board?", intent="manage")
        slug = name.lower().replace(" ", "-")
        existing = await repo.get_workspace_by_slug(slug, owner_id=owner_id)
        if existing:
            return CommandResponse(
                text=f"A board called '{name}' already exists.",
                intent="manage",
            )
        ws = await repo.create_workspace(
            slug=slug, display_name=name, owner_id=owner_id,
        )
        return CommandResponse(
            text=f"Created board **{name}**.",
            intent="manage", ui_action="open_board",
            data={"board": ws},
        )

    if action == "delete_board":
        board_ref = params.get("board_ref", "")
        board = await repo.get_workspace_by_slug(
            board_ref.lower().replace(" ", "-"), owner_id=owner_id,
        )
        if not board:
            boards = await repo.list_workspaces(owner_id=owner_id)
            board = next(
                (b for b in boards if board_ref.lower() in b["display_name"].lower()),
                None,
            )
        if not board:
            return CommandResponse(
                text=f"Board '{board_ref}' not found.",
                intent="manage",
            )
        if board["slug"] == "inbox":
            return CommandResponse(
                text="Can't delete the Inbox board.",
                intent="manage",
            )
        await repo.delete_workspace(board["id"], owner_id=owner_id)
        return CommandResponse(
            text=f"Deleted board **{board['display_name']}**.",
            intent="manage",
        )

    if action == "rename_board":
        board_ref = params.get("board_ref", "")
        new_name = params.get("new_name", "")
        if not board_ref or not new_name:
            return CommandResponse(
                text="Usage: 'rename board Old Name to New Name'",
                intent="manage",
            )
        board = await repo.get_workspace_by_slug(
            board_ref.lower().replace(" ", "-"), owner_id=owner_id,
        )
        if not board:
            boards = await repo.list_workspaces(owner_id=owner_id)
            board = next(
                (b for b in boards if board_ref.lower() in b["display_name"].lower()),
                None,
            )
        if not board:
            return CommandResponse(text=f"Board '{board_ref}' not found.", intent="manage")
        new_slug = new_name.lower().replace(" ", "-")
        await repo.update_workspace(
            board["id"], owner_id=owner_id,
            display_name=new_name, slug=new_slug,
        )
        return CommandResponse(
            text=f"Renamed to **{new_name}**.",
            intent="manage",
        )

    return CommandResponse(text="Management action not recognized.", intent="manage")


# ═══════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════

async def _handle_settings(action: str, params: dict, ctx: dict) -> CommandResponse:
    owner_id = ctx["owner_id"]
    if not owner_id:
        return CommandResponse(
            text="Settings are saved locally when auth is disabled.",
            intent="settings",
        )

    if action == "set_model":
        model = params.get("model", "")
        if not model:
            return CommandResponse(text="Which model? E.g. 'gemini-2.5-flash'", intent="settings")
        await repo.upsert_preferences(owner_id, primary_model=model)
        return CommandResponse(text=f"Primary model set to **{model}**.", intent="settings")

    if action == "set_threshold":
        val = params.get("value")
        try:
            t = float(val)
            if not 0.0 <= t <= 1.0:
                raise ValueError
        except (TypeError, ValueError):
            return CommandResponse(text="Threshold must be 0.0 to 1.0.", intent="settings")
        await repo.upsert_preferences(owner_id, similarity_threshold=t)
        return CommandResponse(text=f"Similarity threshold set to {t}.", intent="settings")

    return CommandResponse(text="Setting not recognized.", intent="settings")


# ═══════════════════════════════════════
# CHAT (fallback — Q&A with knowledge)
# ═══════════════════════════════════════

async def _handle_chat(action: str, message: str, ctx: dict) -> CommandResponse:
    owner_id = ctx["owner_id"]
    workspace_id = ctx.get("workspace_id")

    # Gather context from items
    context = ""
    sources = []
    try:
        if action == "summarize_board" and workspace_id:
            items = await repo.get_items_for_workspace(workspace_id=workspace_id, owner_id=owner_id)
            if items:
                context = "\n\n".join(
                    f"[{i.get('title', 'Untitled')}]: "
                    f"{i.get('summary') or i.get('source_text', '')[:300]}"
                    for i in items[:15]
                )
                sources = [
                    {"title": i.get("title", "Untitled"), "id": i.get("id"), "similarity": 1.0}
                    for i in items[:5]
                ]
            else:
                context = "The board is currently empty."
        else:
            results = await search_svc.semantic_search(
                query=message, owner_id=owner_id,
                workspace_id=workspace_id, limit=8,
            )
            if results:
                context = "\n\n".join(
                    f"[{r.get('title', 'Untitled')}]: "
                    f"{r.get('summary') or r.get('source_text', '')[:300]}"
                    for r in results[:8]
                )
                sources = [
                    {"title": r.get("title", "Untitled"), "id": r.get("id"),
                     "similarity": r.get("similarity", 0)}
                    for r in results[:5]
                ]
    except Exception:
        pass

    system = (
        "You are Mnemos, a personal knowledge assistant. "
        "Use the user's notes to answer, citing note titles. "
        "If notes are insufficient, use general knowledge but say so. "
        "Be concise."
    )
    if context:
        system += f"\n\nRelevant notes:\n{context}"

    answer = await llm_router.chat(
        system, [{"role": "user", "content": message}],
        user_id=owner_id,
    )

    return CommandResponse(
        text=answer,
        intent="chat",
        data={"sources": sources} if sources else None,
    )


# ═══════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════

def _find_free_spot(
    occupied: list[dict],
    size: tuple[float, float] = (360, 240),
    gap: float = 60,
) -> dict:
    """Simple sequential placement — find first non-overlapping spot."""
    if not occupied:
        return {"x": 100.0, "y": 100.0}
    max_y = max(r["y"] + r["height"] for r in occupied)
    return {"x": 100.0, "y": max_y + gap}