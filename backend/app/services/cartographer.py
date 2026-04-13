import numpy as np
import random as _random
from app.db.supabase import db
from app.services import llm
from app.config import settings


class Cartographer:

    async def compute_full_layout(self, page_id: str) -> dict:
        notes = await db.get_notes_with_embeddings(page_id)

        if not notes:
            return {"notes": [], "clusters": []}

        if len(notes) < 3:
            return await self._simple_grid_layout(page_id, notes)

        ids = [n["id"] for n in notes]
        embeddings_matrix = np.array([n["embedding"] for n in notes])

        # Step 1: UMAP 768D → 2D
        try:
            import umap

            reducer = umap.UMAP(
                n_components=2,
                n_neighbors=min(15, len(notes) - 1),
                min_dist=0.1,
                metric="cosine",
                random_state=42,
            )
            coords_2d = reducer.fit_transform(embeddings_matrix)
        except ImportError:
            print("umap-learn not installed, using PCA fallback")
            coords_2d = self._pca_2d(embeddings_matrix)
        except Exception as e:
            print(f"UMAP failed: {e}, falling back to PCA")
            coords_2d = self._pca_2d(embeddings_matrix)

        # Step 2: Normalize to canvas bounds
        w = settings.canvas_width
        h = settings.canvas_height
        margin = 100
        x_range = coords_2d[:, 0].max() - coords_2d[:, 0].min()
        y_range = coords_2d[:, 1].max() - coords_2d[:, 1].min()
        if x_range > 0:
            coords_2d[:, 0] = (
                margin
                + (coords_2d[:, 0] - coords_2d[:, 0].min())
                / x_range
                * (w - 2 * margin)
            )
        else:
            coords_2d[:, 0] = w / 2
        if y_range > 0:
            coords_2d[:, 1] = (
                margin
                + (coords_2d[:, 1] - coords_2d[:, 1].min())
                / y_range
                * (h - 2 * margin)
            )
        else:
            coords_2d[:, 1] = h / 2

        # Step 3: HDBSCAN clustering
        cluster_labels = np.full(len(notes), -1)
        try:
            import hdbscan

            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=max(3, len(notes) // 5),
                metric="euclidean",
            )
            cluster_labels = clusterer.fit_predict(embeddings_matrix)
        except ImportError:
            print("hdbscan not installed, skipping clustering")
        except Exception as e:
            print(f"HDBSCAN failed: {e}")

        # Step 4: NetworkX centrality
        centrality_scores: dict[str, float] = {}
        bridge_notes: set[str] = set()
        try:
            import networkx as nx

            edges = await db.get_edges_for_page(page_id)
            G = nx.Graph()
            for nid in ids:
                G.add_node(nid)
            for e in edges:
                if e["source_id"] in ids and e["target_id"] in ids:
                    G.add_edge(e["source_id"], e["target_id"])

            if G.number_of_edges() > 0:
                centrality_scores = nx.betweenness_centrality(G)
                sorted_centrality = sorted(
                    centrality_scores.items(), key=lambda x: x[1], reverse=True
                )
                threshold = (
                    sorted_centrality[max(0, len(sorted_centrality) // 5)][1]
                    if sorted_centrality
                    else 0
                )
                for nid, score in centrality_scores.items():
                    if score >= threshold and score > 0:
                        bridge_notes.add(nid)
        except ImportError:
            print("networkx not installed, skipping centrality")
        except Exception as e:
            print(f"NetworkX analysis failed: {e}")

        # Step 5: Overlap resolution
        coords_2d = self._resolve_overlaps(coords_2d, min_dist=80)

        # Step 6: Recreate clusters
        await db.delete_clusters_for_page(page_id)
        unique_labels = set(int(x) for x in cluster_labels)
        unique_labels.discard(-1)

        cluster_map: dict[int, str] = {}
        for label in unique_labels:
            indices = [i for i, cl in enumerate(cluster_labels) if int(cl) == label]
            center_x = float(np.mean(coords_2d[indices, 0]))
            center_y = float(np.mean(coords_2d[indices, 1]))

            cluster_notes_info = "\n".join(
                f"- {notes[i].get('title', 'Untitled')} "
                f"(tags: {', '.join(notes[i].get('tags') or [])})"
                for i in indices[:8]
            )
            try:
                naming = await llm.name_cluster(cluster_notes_info)
                cluster_label = naming.get("label", f"Cluster {label}")
                cluster_desc = naming.get("description", "")
                cluster_color = naming.get("color_hint", "#6366f1")
            except Exception:
                cluster_label = f"Cluster {label}"
                cluster_desc = ""
                cluster_color = "#6366f1"

            cluster = await db.insert_cluster(
                page_id=page_id,
                label=cluster_label,
                description=cluster_desc,
                color=cluster_color,
                center_x=center_x,
                center_y=center_y,
            )
            cluster_map[label] = cluster["id"]

        # Step 7: Save positions
        for i, nid in enumerate(ids):
            cl_label = int(cluster_labels[i])
            cid = cluster_map.get(cl_label)
            c_score = centrality_scores.get(nid, 0.0)
            is_b = nid in bridge_notes

            await db.update_note(
                nid,
                canvas_x=float(coords_2d[i, 0]),
                canvas_y=float(coords_2d[i, 1]),
                cluster_id=cid,
                centrality=c_score,
                is_bridge=is_b,
            )

        try:
            from app.services.excalidraw_scene import sync_page_notes_to_canvas

            await sync_page_notes_to_canvas(page_id)
        except Exception as e:
            print(f"Excalidraw layout sync failed: {e}")

        return await db.get_page_canvas(page_id)

    async def place_single_note(
        self, note_id: str, page_id: str
    ) -> dict | None:
        note = await db.get_note(note_id)
        if not note or not note.get("embedding"):
            return None

        existing = await db.get_notes_with_embeddings(page_id)
        existing = [n for n in existing if n["id"] != note_id]

        if not existing:
            return {
                "x": settings.canvas_width / 2,
                "y": settings.canvas_height / 2,
                "cluster_id": None,
            }

        note_emb = np.array(note["embedding"])
        note_norm = np.linalg.norm(note_emb)
        if note_norm == 0:
            return {
                "x": settings.canvas_width / 2,
                "y": settings.canvas_height / 2,
                "cluster_id": None,
            }

        best_sim = -1.0
        best_idx = 0
        for i, ex in enumerate(existing):
            if ex.get("embedding"):
                ex_emb = np.array(ex["embedding"])
                ex_norm = np.linalg.norm(ex_emb)
                if ex_norm == 0:
                    continue
                sim = float(np.dot(note_emb, ex_emb) / (note_norm * ex_norm))
                if sim > best_sim:
                    best_sim = sim
                    best_idx = i

        nearest = existing[best_idx]
        base_x = nearest.get("canvas_x") or settings.canvas_width / 2
        base_y = nearest.get("canvas_y") or settings.canvas_height / 2

        angle = _random.uniform(0, 2 * 3.14159)
        distance = _random.uniform(100, 200)
        x = max(
            50,
            min(settings.canvas_width - 50, base_x + distance * np.cos(angle)),
        )
        y = max(
            50,
            min(settings.canvas_height - 50, base_y + distance * np.sin(angle)),
        )

        cluster_id = nearest.get("cluster_id") if best_sim > 0.75 else None

        return {
            "x": float(x),
            "y": float(y),
            "cluster_id": cluster_id,
        }

    def _resolve_overlaps(
        self, coords: np.ndarray, min_dist: float = 80, iterations: int = 50
    ) -> np.ndarray:
        coords = coords.copy()
        for _ in range(iterations):
            moved = False
            for i in range(len(coords)):
                for j in range(i + 1, len(coords)):
                    dx = coords[j, 0] - coords[i, 0]
                    dy = coords[j, 1] - coords[i, 1]
                    dist = np.sqrt(dx * dx + dy * dy)
                    if dist < min_dist and dist > 0:
                        push = (min_dist - dist) / 2.0
                        nx_ = dx / dist
                        ny_ = dy / dist
                        coords[i, 0] -= nx_ * push
                        coords[i, 1] -= ny_ * push
                        coords[j, 0] += nx_ * push
                        coords[j, 1] += ny_ * push
                        moved = True
            if not moved:
                break
        return coords

    def _pca_2d(self, matrix: np.ndarray) -> np.ndarray:
        """Simple PCA fallback when UMAP is unavailable."""
        centered = matrix - matrix.mean(axis=0)
        try:
            _, _, Vt = np.linalg.svd(centered, full_matrices=False)
            return centered @ Vt[:2].T
        except Exception:
            return np.random.uniform(0, 1, size=(len(matrix), 2))

    async def _simple_grid_layout(
        self, page_id: str, notes: list
    ) -> dict:
        w = settings.canvas_width
        h = settings.canvas_height
        positions = [
            (w * 0.3, h * 0.5),
            (w * 0.7, h * 0.5),
            (w * 0.5, h * 0.3),
        ]
        for i, note in enumerate(notes):
            x, y = positions[i] if i < len(positions) else (w / 2, h / 2)
            await db.update_note(note["id"], canvas_x=x, canvas_y=y)

        try:
            from app.services.excalidraw_scene import sync_page_notes_to_canvas

            await sync_page_notes_to_canvas(page_id)
        except Exception as e:
            print(f"Excalidraw layout sync failed: {e}")

        return await db.get_page_canvas(page_id)


cartographer = Cartographer()