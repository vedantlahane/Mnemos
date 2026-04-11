"""
Mnemos RAG Smoke Tests
Run after seeding 20+ notes.

Usage:
    cd C:\Users\Admin\Desktop\Mnemos
    python eval/smoke_test.py
"""

import asyncio
import httpx
import sys

API = "http://localhost:8000/api"

# ─── Search Tests ────────────────────────────────────────────────────

SEARCH_TESTS = [
    {
        "query": "vector similarity search",
        "expected_titles_contain": ["vector", "hnsw", "embedding"],
        "min_results": 1,
    },
    {
        "query": "how to deploy containers",
        "expected_titles_contain": ["docker", "kubernetes", "k8s"],
        "min_results": 1,
    },
    {
        "query": "building REST APIs with Python",
        "expected_titles_contain": ["fastapi", "rest", "api"],
        "min_results": 1,
    },
    {
        "query": "frontend styling framework",
        "expected_titles_contain": ["tailwind", "css"],
        "min_results": 1,
    },
    {
        "query": "AI generating answers from documents",
        "expected_titles_contain": ["rag", "retrieval"],
        "min_results": 1,
    },
]

# ─── Chat Tests ──────────────────────────────────────────────────────

CHAT_TESTS = [
    {
        "question": "What is RAG and how does it work?",
        "expected_keywords": ["retrieval", "knowledge", "context", "hallucination"],
    },
    {
        "question": "What vector databases are mentioned in my notes?",
        "expected_keywords": ["pinecone", "weaviate", "pgvector"],
    },
    {
        "question": "How does FastAPI handle async operations?",
        "expected_keywords": ["async", "starlette", "pydantic"],
    },
    {
        "question": "What monitoring tools should I use?",
        "expected_keywords": ["prometheus", "grafana", "metrics"],
    },
    {
        "question": "What are the key TypeScript features?",
        "expected_keywords": ["interface", "generic", "type"],
    },
]


async def run_tests():
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Check backend is up
        try:
            resp = await client.get(f"{API.replace('/api', '')}/health")
            if resp.status_code != 200:
                print("❌ Backend not responding. Start it first.")
                sys.exit(1)
        except httpx.ConnectError:
            print("❌ Can't connect to backend at", API)
            print("   Run: uvicorn main:app --reload --port 8000")
            sys.exit(1)

        print("=" * 60)
        print("MNEMOS SMOKE TESTS")
        print("=" * 60)

        total = 0
        passed = 0
        failed = 0

        # ─── Search Tests ────────────────────────────────────────

        print("\n📎 SEARCH TESTS\n")

        for i, test in enumerate(SEARCH_TESTS, 1):
            total += 1
            try:
                resp = await client.get(
                    f"{API}/search",
                    params={"q": test["query"], "limit": 5},
                )
                data = resp.json()
                results = data.get("results", [])

                # Check minimum results
                if len(results) < test["min_results"]:
                    print(f"  ✗ Search {i}: FAILED — got {len(results)} results, expected >= {test['min_results']}")
                    print(f"    Query: {test['query']}")
                    failed += 1
                    continue

                # Check if any expected title keywords appear
                all_titles = " ".join(
                    (r.get("title") or "").lower() for r in results
                )
                all_tags = " ".join(
                    " ".join(r.get("tags") or []) for r in results
                ).lower()
                combined = all_titles + " " + all_tags

                found = [
                    kw for kw in test["expected_titles_contain"]
                    if kw.lower() in combined
                ]

                if found:
                    top_sim = results[0].get("similarity", 0) if results else 0
                    print(f"  ✓ Search {i}: PASSED — {len(results)} results, top sim={top_sim:.3f}, matched: {found}")
                    passed += 1
                else:
                    print(f"  ✗ Search {i}: FAILED — no expected keywords in results")
                    print(f"    Query: {test['query']}")
                    print(f"    Expected: {test['expected_titles_contain']}")
                    print(f"    Got titles: {[r.get('title', '') for r in results]}")
                    failed += 1

            except Exception as e:
                print(f"  ✗ Search {i}: ERROR — {e}")
                failed += 1

        # ─── Chat Tests ──────────────────────────────────────────

        print("\n💬 CHAT TESTS\n")

        for i, test in enumerate(CHAT_TESTS, 1):
            total += 1
            try:
                resp = await client.post(
                    f"{API}/chat",
                    json={"question": test["question"], "history": []},
                )
                data = resp.json()
                answer = data.get("answer", "").lower()
                sources = data.get("sources", [])

                found = [
                    kw for kw in test["expected_keywords"]
                    if kw.lower() in answer
                ]

                if found and len(sources) > 0:
                    print(f"  ✓ Chat {i}: PASSED — {len(sources)} sources, matched: {found}")
                    passed += 1
                elif found:
                    print(f"  ~ Chat {i}: PARTIAL — matched keywords but no sources")
                    print(f"    Question: {test['question']}")
                    passed += 1  # Still count as pass
                else:
                    print(f"  ✗ Chat {i}: FAILED")
                    print(f"    Question: {test['question']}")
                    print(f"    Expected: {test['expected_keywords']}")
                    print(f"    Answer preview: {answer[:200]}")
                    print(f"    Sources: {len(sources)}")
                    failed += 1

            except Exception as e:
                print(f"  ✗ Chat {i}: ERROR — {e}")
                failed += 1

        # ─── Summary ─────────────────────────────────────────────

        print("\n" + "=" * 60)
        print(f"RESULTS: {passed}/{total} passed, {failed} failed")
        print("=" * 60)

        if failed > 0:
            print("\n⚠️  Some tests failed. This might be normal if:")
            print("   - Notes haven't finished processing yet (wait 30s)")
            print("   - Similarity thresholds are too high")
            print("   - LLM gave a different phrasing")
            sys.exit(1)
        else:
            print("\n✅ All tests passed!")


if __name__ == "__main__":
    asyncio.run(run_tests())
