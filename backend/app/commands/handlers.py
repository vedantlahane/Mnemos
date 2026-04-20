# === FILE: backend/app/commands/handlers.py ===

from __future__ import annotations
import logging

from app.commands.responses import CommandResponse
from app.db.repo import repo
from app.services import capture as capture_svc
from app.services import search as search_svc
from app.services.placement import (
    find_placement, find_placement_for_size, get_column_bounds,
)
from app.services.sync import handle_structural_rebuild
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
# WORKSPACE CONTENT GATHERING
# ═══════════════════════════════════════

async def _gather_board_context(workspace_id: str, owner_id: str) -> str:
    """
    Gather ALL content on a board — items + canvas objects.
    This is the single source of truth for "what's on this page".
    """
    parts = []

    # 1. Items (note cards)
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    if items:
        parts.append(f"=== NOTE CARDS ({len(items)}) ===")
        for i in items:
            title = i.get("title") or "Untitled"
            summary = i.get("summary") or i.get("source_text", "")[:300]
            tags = ", ".join(i.get("tags") or [])
            entry = f"[{title}]: {summary}"
            if tags:
                entry += f" (tags: {tags})"
            parts.append(entry)

    # 2. Canvas objects (composed text, stickies, diagrams)
    objects = await repo.get_canvas_objects(workspace_id)
    if objects:
        texts = [o for o in objects if o.get("kind") == "text"]
        stickies = [o for o in objects if o.get("kind") == "sticky"]
        diagrams = [o for o in objects if o.get("kind") == "diagram"]

        if texts:
            parts.append(f"\n=== COMPOSED TEXT ({len(texts)}) ===")
            for o in texts:
                content = o.get("content", "")[:500]
                topic = (o.get("meta") or {}).get("topic", "")
                if topic:
                    parts.append(f"[Composed: {topic}]: {content}")
                else:
                    parts.append(f"[Composed text]: {content}")

        if stickies:
            parts.append(f"\n=== STICKY NOTES ({len(stickies)}) ===")
            for o in stickies:
                content = o.get("content", "")[:200]
                parts.append(f"[Sticky]: {content}")

        if diagrams:
            parts.append(f"\n=== DIAGRAMS ({len(diagrams)}) ===")
            for o in diagrams:
                content = o.get("content", "")
                meta = o.get("meta") or {}
                topology = meta.get("topology", {})
                nodes = topology.get("elements", [])
                node_labels = [n.get("label", "") for n in nodes]
                parts.append(
                    f"[Diagram: {content}]: nodes: {', '.join(node_labels)}"
                )

    if not parts:
        return ""

    return "\n".join(parts)


async def _get_board_summary_text(workspace_id: str, owner_id: str) -> tuple[str, list]:
    """Get a human-readable summary of board contents + source list."""
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    objects = await repo.get_canvas_objects(workspace_id)

    sources = []
    content_parts = []

    # Count things
    item_count = len(items)
    text_count = len([o for o in objects if o.get("kind") == "text"])
    sticky_count = len([o for o in objects if o.get("kind") == "sticky"])
    diagram_count = len([o for o in objects if o.get("kind") == "diagram"])

    total = item_count + text_count + sticky_count + diagram_count

    if total == 0:
        return "empty", []

    # Items
    for i in items:
        title = i.get("title") or "Untitled"
        summary = i.get("summary") or i.get("source_text", "")[:300]
        content_parts.append(f"[{title}]: {summary}")
        sources.append({
            "title": title, "id": i.get("id"), "similarity": 1.0,
        })

    # Objects
    for o in objects:
        kind = o.get("kind")
        content = o.get("content", "")[:300]
        if kind == "text":
            topic = (o.get("meta") or {}).get("topic", "composed text")
            content_parts.append(f"[{topic}]: {content}")
        elif kind == "sticky":
            content_parts.append(f"[Sticky note]: {content}")
        elif kind == "diagram":
            content_parts.append(f"[Diagram: {content}]")

    return "\n\n".join(content_parts), sources


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

    item = await repo.create_item(
        source_text=text,
        source_type="manual",
        owner_id=owner_id,
        status="pending",
    )

    await bus.emit(Event(ITEM_CREATED, {
        "item_id": item["id"],
        "source_text": text,
        "source_title": None,      # chat captures have no page title
        "source_url": None,
        "board_hint": board_hint,
        "workspace_id": workspace_id,  # route to current board
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
# CANVAS — shared helpers
# ═══════════════════════════════════════

async def _get_canvas_context(workspace_id: str, owner_id: str) -> dict:
    """Gather everything needed for scene rebuilds."""
    stored = await repo.get_canvas(workspace_id)
    items = await repo.get_items_for_workspace(workspace_id, owner_id)
    placements = await repo.get_placements(workspace_id)
    objects = await repo.get_canvas_objects(workspace_id)
    managed_ids = canvas_renderer.collect_managed_ids(items, objects)
    user_drawn = canvas_renderer.extract_user_drawn(
        stored["scene"].get("elements", []), managed_ids,
    )
    return {
        "stored": stored,
        "items": items,
        "placements": placements,
        "objects": objects,
        "user_drawn": user_drawn,
    }


def _rebuild_scene(ctx: dict, theme: str = None, background: str = None) -> tuple:
    """Rebuild scene from DB truth. Returns (scene, new_version)."""
    stored = ctx["stored"]
    t = theme or stored.get("theme", "dark")
    bg = background or stored.get("background")
    scene = canvas_renderer.build_scene(
        ctx["items"], ctx["placements"], ctx["objects"], ctx["user_drawn"],
        theme=t, background=bg,
    )
    return scene, stored["version"] + 1


# ═══════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════

async def _create_diagram_for_topic(topic: str, workspace_id: str, owner_id: str):
    """Helper to create a diagram — used by both standalone and compound commands."""
    topology = await llm_router.generate_diagram(topic, user_id=owner_id)

    canvas_ctx = await _get_canvas_context(workspace_id, owner_id)
    col = get_column_bounds()
    f = canvas_renderer.factory(canvas_ctx["stored"].get("theme", "dark"))
    _, bbox = layout_diagram(topology, 0, 0, f, max_width=col["width"])

    from app.services.placement import find_diagram_placement
    placement = find_diagram_placement(
        placements=canvas_ctx["placements"],
        objects=canvas_ctx["objects"],
        user_elements=canvas_ctx["user_drawn"],
        diagram_width=bbox["width"],
        diagram_height=bbox["height"],
    )

    await repo.create_canvas_object(
        workspace_id=workspace_id,
        kind="diagram", origin="ai",
        excalidraw_ids=[],
        x=placement["x"], y=placement["y"],
        w=bbox["width"], h=bbox["height"],
        content=topic,
        meta={"topology": topology},
    )


async def _canvas_compose_and_diagram(params: dict, workspace_id: str,
                                      owner_id: str) -> CommandResponse:
    """Handle compound: write about topic AND create diagram."""
    topic = params.get("topic", "untitled")

    # Get board context for better topic understanding
    ws = await repo.get_workspace(workspace_id, owner_id=owner_id)
    board_name = ws.get("display_name", "") if ws else ""

    # If the topic is vague and board has a clear name, enrich it
    enriched_topic = topic
    if board_name and topic.lower() != board_name.lower():
        # e.g. topic="architecture", board="k8s" → "k8s architecture"
        enriched_topic = f"{board_name} {topic}"

    # 1. Start the compose (text) as a background task
    from app.services.composition import compose_stream_chunks, strip_markdown
    from app.services.broadcaster import broadcaster
    from app.canvas.text_measure import measure_text
    import asyncio

    col = get_column_bounds()

    async def _run_compose():
        canvas_ctx = await _get_canvas_context(workspace_id, owner_id)

        placement = find_placement_for_size(
            placements=canvas_ctx["placements"],
            objects=canvas_ctx["objects"],
            user_elements=canvas_ctx["user_drawn"],
            width=col["width"],
            height=300,
        )

        obj = await repo.create_canvas_object(
            workspace_id=workspace_id,
            kind="text", origin="ai",
            x=placement["x"], y=placement["y"],
            w=col["width"], h=300,
            content="",
            meta={"topic": topic},
        )
        obj_id = obj["id"]

        content = ""
        try:
            async for chunk in compose_stream_chunks(topic, workspace_id, owner_id):
                content += chunk
                await broadcaster.publish(workspace_id, {
                    "type": "stream_chunk",
                    "obj_id": obj_id,
                    "chunk": chunk,
                    "text": content,
                    "x": placement["x"],
                    "y": placement["y"],
                })
        except Exception as e:
            logger.error(f"Compose stream failed: {e}")

        content = strip_markdown(content)
        m = measure_text(content, font_size=16, font_family=1,
                         max_width=col["width"], max_lines=200)
        actual_h = m["height"] + 20
        await repo.update_canvas_object(obj_id, content=content, h=actual_h)

        # After text is done, create the diagram with enriched topic
        await _create_diagram_for_topic(enriched_topic, workspace_id, owner_id)

        # Final rebuild
        result = await handle_structural_rebuild(workspace_id, owner_id)

        await repo.log_op(workspace_id, result["version"], "compound_compose_diagram",
                          actor="ai", data={"topic": enriched_topic})

        await broadcaster.publish(workspace_id, {
            "type": "stream_end",
            "obj_id": obj_id,
            "version": result["version"],
        })

    asyncio.create_task(_run_compose())

    return CommandResponse(
        text=f"Writing about '{topic}' and creating an architecture diagram.",
        intent="canvas",
        canvas_update=None,
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

    if action == "compose_and_diagram":
        return await _canvas_compose_and_diagram(params, workspace_id, owner_id)

    if action == "compose":
        return await _canvas_compose(params, workspace_id, owner_id)

    if action in ("set_dark", "set_light"):
        theme = "dark" if action == "set_dark" else "light"
        bg = "#0e0e1a" if theme == "dark" else "#ffffff"

        canvas_ctx = await _get_canvas_context(workspace_id, owner_id)
        scene, new_version = _rebuild_scene(canvas_ctx, theme=theme, background=bg)

        await repo.save_canvas(workspace_id, scene, new_version,
                               theme=theme, background=bg)
        await repo.log_op(workspace_id, new_version, "theme_changed",
                          actor="user", data={"theme": theme})

        from app.services.broadcaster import broadcaster
        await broadcaster.publish(workspace_id, {
            "type": "canvas_updated",
            "version": new_version,
            "op": "theme_changed",
        })

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

    await _create_diagram_for_topic(topic, workspace_id, owner_id)
    result = await handle_structural_rebuild(workspace_id, owner_id)

    await repo.log_op(workspace_id, result["version"], "diagram_added",
                      actor="ai", data={"topic": topic})

    from app.services.broadcaster import broadcaster
    await broadcaster.publish(workspace_id, {
        "type": "canvas_updated",
        "version": result["version"],
        "op": "diagram_added",
    })

    return CommandResponse(
        text=f"Created a diagram about **{topic}**.",
        intent="canvas",
        canvas_update={"version": result["version"], "action": "reload"},
    )


async def _canvas_add_sticky(params: dict, workspace_id: str,
                              owner_id: str) -> CommandResponse:
    content = params.get("content", "")
    color = params.get("color", "#fef08a")

    if not content:
        return CommandResponse(text="What should the sticky note say?", intent="canvas")

    canvas_ctx = await _get_canvas_context(workspace_id, owner_id)

    placement = find_placement_for_size(
        placements=canvas_ctx["placements"],
        objects=canvas_ctx["objects"],
        user_elements=canvas_ctx["user_drawn"],
        width=180, height=160,
    )

    await repo.create_canvas_object(
        workspace_id=workspace_id,
        kind="sticky", origin="ai",
        x=placement["x"], y=placement["y"], w=180, h=160,
        content=content,
        meta={"color": color},
    )

    result = await handle_structural_rebuild(workspace_id, owner_id)

    from app.services.broadcaster import broadcaster
    await broadcaster.publish(workspace_id, {
        "type": "canvas_updated",
        "version": result["version"],
        "op": "element_added",
    })

    return CommandResponse(
        text=f"Added a sticky note.",
        intent="canvas",
        canvas_update={"version": result["version"], "action": "reload"},
    )


async def _canvas_compose(params: dict, workspace_id: str,
                          owner_id: str) -> CommandResponse:
    topic = params.get("topic", "")
    if not topic:
        return CommandResponse(text="What should I write about?", intent="canvas")

    from app.services.composition import compose_stream_chunks, strip_markdown
    from app.services.broadcaster import broadcaster
    from app.canvas.text_measure import measure_text
    import asyncio

    col = get_column_bounds()

    async def _run_compose():
        try:
            logger.info(f"[COMPOSE] Starting compose for topic='{topic}', ws={workspace_id}")
            canvas_ctx = await _get_canvas_context(workspace_id, owner_id)
            logger.info(f"[COMPOSE] Got canvas context, placements={len(canvas_ctx['placements'])}")

            placement = find_placement_for_size(
                placements=canvas_ctx["placements"],
                objects=canvas_ctx["objects"],
                user_elements=canvas_ctx["user_drawn"],
                width=col["width"],
                height=300,
            )
            logger.info(f"[COMPOSE] Found placement at ({placement['x']}, {placement['y']})")

            obj = await repo.create_canvas_object(
                workspace_id=workspace_id,
                kind="text", origin="ai",
                x=placement["x"], y=placement["y"],
                w=col["width"], h=300,
                content="",
                meta={"topic": topic},
            )
            obj_id = obj["id"]
            logger.info(f"[COMPOSE] Created canvas object {obj_id}")

            content = ""
            chunk_count = 0
            try:
                async for chunk in compose_stream_chunks(topic, workspace_id, owner_id):
                    chunk_count += 1
                    content += chunk
                    await broadcaster.publish(workspace_id, {
                        "type": "stream_chunk",
                        "obj_id": obj_id,
                        "chunk": chunk,
                        "text": content,
                        "x": placement["x"],
                        "y": placement["y"],
                    })
                logger.info(f"[COMPOSE] Streamed {chunk_count} chunks, total length={len(content)}")
            except Exception as e:
                logger.error(f"[COMPOSE] Stream failed: {e}", exc_info=True)

            # Clean markdown
            content = strip_markdown(content)
            logger.info(f"[COMPOSE] After markdown strip: {len(content)} chars")

            # Measure actual height
            m = measure_text(content, font_size=16, font_family=1,
                             max_width=col["width"], max_lines=200)
            actual_h = m["height"] + 20
            logger.info(f"[COMPOSE] Measured height: {actual_h}")

            # Update object with final content and real dimensions
            await repo.update_canvas_object(obj_id, content=content, h=actual_h)
            logger.info(f"[COMPOSE] Updated canvas object with final content")

            # Structural rebuild
            result = await handle_structural_rebuild(workspace_id, owner_id)
            logger.info(f"[COMPOSE] Rebuilt scene, version={result['version']}")

            await repo.log_op(workspace_id, result["version"], "element_added",
                              actor="ai", data={"type": "composed_text", "topic": topic})

            await broadcaster.publish(workspace_id, {
                "type": "stream_end",
                "obj_id": obj_id,
                "version": result["version"],
            })
            logger.info(f"[COMPOSE] Compose completed successfully")
        except Exception as e:
            logger.error(f"[COMPOSE] Fatal error in _run_compose: {e}", exc_info=True)

    asyncio.create_task(_run_compose())

    return CommandResponse(
        text=f"Writing about '{topic}' on the board now.",
        intent="canvas",
        canvas_update=None,
    )


async def _canvas_rebuild(workspace_id: str, owner_id: str) -> CommandResponse:
    """Full page reorganization — cleans up all overlaps."""
    from app.services.placement import organize_page

    objects = await repo.get_canvas_objects(workspace_id)
    current_placements = await repo.get_placements(workspace_id)

    # Reorganize everything into a clean vertical flow
    new_placements, new_obj_positions = organize_page(current_placements, objects)

    # Save updated placements
    for p in new_placements:
        await repo.upsert_placement(
            workspace_id, p["item_id"],
            p["x"], p["y"], p["w"], p["h"],
        )

    # Save updated object positions
    for op in new_obj_positions:
        if op.get("id"):
            await repo.update_canvas_object(
                op["id"],
                x=op["x"], y=op["y"],
                w=op.get("w"), h=op.get("h"),
            )

    result = await handle_structural_rebuild(workspace_id, owner_id)

    from app.services.broadcaster import broadcaster
    await broadcaster.publish(workspace_id, {
        "type": "canvas_updated",
        "version": result["version"],
        "op": "full_rebuild",
    })

    # Count what's actually on the board
    total_elements = len(new_placements) + len(new_obj_positions)

    # Build a descriptive summary
    kind_counts: dict[str, int] = {}
    for obj in objects:
        kind = obj.get("kind", "unknown")
        kind_counts[kind] = kind_counts.get(kind, 0) + 1

    parts = []
    if kind_counts.get("text"):
        n = kind_counts["text"]
        parts.append(f"{n} text block{'s' if n != 1 else ''}")
    if kind_counts.get("diagram"):
        n = kind_counts["diagram"]
        parts.append(f"{n} diagram{'s' if n != 1 else ''}")
    if kind_counts.get("sticky"):
        n = kind_counts["sticky"]
        parts.append(f"{n} sticky note{'s' if n != 1 else ''}")
    if len(new_placements) > 0:
        n = len(new_placements)
        parts.append(f"{n} card{'s' if n != 1 else ''}")

    if parts:
        summary = ", ".join(parts)
        text = f"Canvas reorganized — {summary} arranged."
    elif total_elements == 0:
        text = "Canvas is empty — nothing to organize."
    else:
        text = f"Canvas reorganized — {total_elements} element{'s' if total_elements != 1 else ''} arranged."

    return CommandResponse(
        text=text,
        intent="canvas",
        canvas_update={"version": result["version"], "action": "reload"},
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
            return CommandResponse(text=f"Board '{board_ref}' not found.", intent="manage")
        if board["slug"] == "inbox":
            return CommandResponse(text="Can't delete the Inbox board.", intent="manage")
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
        return CommandResponse(text=f"Renamed to **{new_name}**.", intent="manage")

    return CommandResponse(text="Management action not recognized.", intent="manage")


# ═══════════════════════════════════════
# SETTINGS
# ═══════════════════════════════════════

async def _handle_settings(action: str, params: dict, ctx: dict) -> CommandResponse:
    owner_id = ctx["owner_id"]
    prefs = None
    if owner_id:
        prefs = await repo.get_preferences(owner_id)
    if not prefs:
        prefs = {
            "theme": "dark", "primary_model": settings.gemini_model,
            "secondary_model": settings.groq_model,
            "similarity_threshold": settings.similarity_threshold,
            "auto_layout": True, "auto_connect": True
        }

    if action in ("set_dark", "set_light"):
        theme = "dark" if action == "set_dark" else "light"
        prefs["theme"] = theme
        if owner_id:
            await repo.upsert_preferences(owner_id, theme=theme)

        workspace_id = ctx.get("workspace_id")
        canvas_update = None
        if workspace_id:
            ws = await repo.get_workspace(workspace_id, owner_id=owner_id)
            if ws:
                bg = "#0e0e1a" if theme == "dark" else "#ffffff"

                # Use structural rebuild
                stored = await repo.get_canvas(workspace_id)
                items = await repo.get_items_for_workspace(workspace_id, owner_id)
                placements = await repo.get_placements(workspace_id)
                objects = await repo.get_canvas_objects(workspace_id)
                managed_ids = canvas_renderer.collect_managed_ids(items, objects)
                user_drawn = canvas_renderer.extract_user_drawn(
                    stored["scene"].get("elements", []), managed_ids,
                )

                scene = canvas_renderer.build_scene(
                    items, placements, objects, user_drawn,
                    theme=theme, background=bg,
                )
                new_version = stored["version"] + 1

                await repo.save_canvas(workspace_id, scene, new_version,
                                       theme=theme, background=bg)
                await repo.log_op(workspace_id, new_version, "theme_changed",
                                  actor="user", data={"theme": theme})

                from app.services.broadcaster import broadcaster
                await broadcaster.publish(workspace_id, {
                    "type": "canvas_updated",
                    "version": new_version,
                    "op": "theme_changed",
                })
                canvas_update = {"version": new_version, "action": "reload"}

        return CommandResponse(
            text=f"Switched to {theme} mode.",
            intent="settings", ui_action="open_settings", data=prefs,
            canvas_update=canvas_update,
        )

    if action == "set_primary_model":
        model = params.get("text", "")
        if not model:
            return CommandResponse(text="Which model? E.g. 'Gemini 2.5 Flash'", intent="settings")
        prefs["primary_model"] = model
        if owner_id:
            await repo.upsert_preferences(owner_id, primary_model=model)
        return CommandResponse(text=f"Primary model set to **{model}**.", intent="settings", ui_action="open_settings", data=prefs)

    if action == "set_secondary_model":
        model = params.get("text", "")
        if not model:
            return CommandResponse(text="Which model?", intent="settings")
        prefs["secondary_model"] = model
        if owner_id:
            await repo.upsert_preferences(owner_id, secondary_model=model)
        return CommandResponse(text=f"Secondary model set to **{model}**.", intent="settings", ui_action="open_settings", data=prefs)

    if action == "set_auto_layout":
        val = params.get("text", "").lower() == "on"
        prefs["auto_layout"] = val
        if owner_id:
            await repo.upsert_preferences(owner_id, auto_layout=val)
        return CommandResponse(text=f"Auto layout turned {'on' if val else 'off'}.", intent="settings", ui_action="open_settings", data=prefs)

    if action == "set_auto_connect":
        val = params.get("text", "").lower() == "on"
        prefs["auto_connect"] = val
        if owner_id:
            await repo.upsert_preferences(owner_id, auto_connect=val)
        return CommandResponse(text=f"Auto connect turned {'on' if val else 'off'}.", intent="settings", ui_action="open_settings", data=prefs)

    if action in ("inc_threshold", "dec_threshold"):
        delta = 0.05 if action == "inc_threshold" else -0.05
        new_val = max(0.0, min(1.0, prefs["similarity_threshold"] + delta))
        prefs["similarity_threshold"] = new_val
        if owner_id:
            await repo.upsert_preferences(owner_id, similarity_threshold=new_val)
        return CommandResponse(text=f"Similarity threshold set to {new_val:.2f}.", intent="settings", ui_action="open_settings", data=prefs)

    return CommandResponse(text="Setting not recognized.", intent="settings")


# ═══════════════════════════════════════
# CHAT (fallback) — now workspace-aware
# ═══════════════════════════════════════

async def _handle_chat(action: str, message: str, ctx: dict) -> CommandResponse:
    owner_id = ctx["owner_id"]
    workspace_id = ctx.get("workspace_id")

    context = ""
    sources = []

    try:
        if action == "summarize_board" and workspace_id:
            # ── Board summary — reads EVERYTHING on the canvas ──
            context = await _gather_board_context(workspace_id, owner_id)
            if not context:
                return CommandResponse(
                    text="This board is empty. Try capturing some notes or composing text!",
                    intent="chat",
                )

            items = await repo.get_items_for_workspace(workspace_id, owner_id)
            objects = await repo.get_canvas_objects(workspace_id)
            sources = [
                {"title": i.get("title", "Untitled"), "id": i.get("id"), "similarity": 1.0}
                for i in items[:5]
            ]
            # Add objects to sources
            for o in objects[:5]:
                kind = o.get("kind", "")
                content = o.get("content", "")[:50]
                topic = (o.get("meta") or {}).get("topic", "")
                sources.append({
                    "title": f"{kind.title()}: {topic or content}",
                    "id": str(o.get("id", "")),
                    "similarity": 1.0,
                })
        else:
            # ── Regular chat — search + board context ──
            # First try semantic search
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

            # Also add current board context if on a workspace
            if workspace_id:
                board_context = await _gather_board_context(workspace_id, owner_id)
                if board_context:
                    if context:
                        context += f"\n\n--- Current Board Content ---\n{board_context}"
                    else:
                        context = f"--- Current Board Content ---\n{board_context}"
    except Exception as e:
        logger.warning(f"Context gathering failed: {e}")

    system = (
        "You are Mnemos, a personal knowledge assistant. "
        "The user is viewing a visual board/canvas where they organize knowledge. "
        "Use the provided notes and board content to answer. "
        "If asked about 'this page', 'this board', or 'what's here', describe the board content. "
        "Cite note titles when relevant. "
        "If notes are insufficient, use general knowledge but say so. "
        "Be concise and helpful."
    )
    if context:
        system += f"\n\nAvailable content:\n{context}"

    answer = await llm_router.chat(
        system, [{"role": "user", "content": message}],
        user_id=owner_id,
    )

    return CommandResponse(
        text=answer,
        intent="chat",
        data={"sources": sources} if sources else None,
    )