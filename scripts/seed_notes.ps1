# Mnemos Note Seeding Script
# Automatically seeds 20 tech-focused notes for testing

$API = "http://localhost:8000/api"
$notes = @(
    @{
        text = "Retrieval-Augmented Generation (RAG) is a technique that combines the power of large language models with external knowledge retrieval. Instead of relying solely on the LLMs training data, RAG systems first retrieve relevant documents from a knowledge base, then use those documents as context for generating answers. This approach significantly reduces hallucinations and allows the model to reference up-to-date information."
        title = "Complete Guide to RAG"
        url = "https://example.com/rag-guide"
    },
    @{
        text = "Vector databases store data as high-dimensional vectors (embeddings) and enable similarity search. Unlike traditional databases that match exact values, vector DBs find the closest vectors using distance metrics like cosine similarity or Euclidean distance. Popular options include Pinecone, Weaviate, Milvus, and pgvector for PostgreSQL. The choice depends on scale, managed vs self-hosted preference, and integration requirements."
        title = "Choosing a Vector Database"
        url = "https://example.com/vector-dbs"
    },
    @{
        text = "FastAPI is a modern Python web framework built on Starlette and Pydantic. It provides automatic API documentation via Swagger UI, native async support, and type validation through Pydantic models. FastAPI is one of the fastest Python frameworks available, comparable to Node.js and Go in benchmarks. Key features include dependency injection, background tasks, WebSocket support, and middleware."
        title = "Why FastAPI"
        url = "https://example.com/fastapi-overview"
    },
    @{
        text = "Prompt engineering is the practice of designing effective prompts for LLMs. Key techniques include: few-shot prompting (providing examples), chain-of-thought (asking the model to reason step by step), structured output (requesting JSON format), and system prompts (setting the models persona and constraints). The quality of the prompt often matters more than the choice of model."
        title = "Prompt Engineering Best Practices"
        url = "https://example.com/prompt-engineering"
    },
    @{
        text = "Kubernetes (K8s) is a container orchestration platform that automates deployment, scaling, and management of containerized applications. Core concepts include Pods (smallest deployable unit), Deployments (desired state management), Services (networking), ConfigMaps and Secrets (configuration), and Horizontal Pod Autoscaler (automatic scaling). K8s uses a declarative model where you define the desired state in YAML manifests."
        title = "Kubernetes Fundamentals"
        url = "https://example.com/k8s-basics"
    },
    @{
        text = "Docker containers package applications with their dependencies into isolated environments. A Dockerfile defines the build steps: base image, copy files, install dependencies, expose ports, and define the entrypoint command. Docker Compose allows defining multi-container applications in a single YAML file. Best practices include using multi-stage builds to reduce image size, running as non-root user, and using .dockerignore."
        title = "Docker Best Practices"
        url = "https://example.com/docker-best-practices"
    },
    @{
        text = "React hooks revolutionized how we write components. useState manages local state, useEffect handles side effects and lifecycle events, useCallback memoizes functions, useMemo memoizes computed values, and useRef holds mutable references. Custom hooks let you extract and reuse stateful logic across components. The rules of hooks: only call at the top level, only call from React functions."
        title = "React Hooks Deep Dive"
        url = "https://example.com/react-hooks"
    },
    @{
        text = "PostgreSQL is a powerful open-source relational database. Advanced features include JSONB columns for document storage, full-text search, window functions, CTEs (Common Table Expressions), and extensions like pgvector for vector similarity search and PostGIS for geospatial data. PostgreSQL supports ACID transactions, has excellent concurrency via MVCC, and can handle both OLTP and analytical workloads."
        title = "PostgreSQL Advanced Features"
        url = "https://example.com/postgresql-features"
    },
    @{
        text = "TypeScript adds static typing to JavaScript. Key features include interfaces for defining object shapes, generics for reusable typed components, union and intersection types, type guards for narrowing, and utility types like Partial, Pick, Omit, and Record. TypeScript catches bugs at compile time that would otherwise surface at runtime. The strict mode enables all strict type checking options."
        title = "TypeScript Essential Guide"
        url = "https://example.com/typescript-guide"
    },
    @{
        text = "CI/CD with GitHub Actions automates testing, building, and deploying code. Workflows are defined in YAML files under .github/workflows/. Key concepts: triggers (push, PR, schedule), jobs (run on runners), steps (individual commands), actions (reusable tasks), and secrets (encrypted environment variables). A typical pipeline: lint, test, build Docker image, push to registry, deploy to Kubernetes."
        title = "GitHub Actions CI/CD Pipeline"
        url = "https://example.com/github-actions"
    },
    @{
        text = "Embeddings are dense vector representations of text that capture semantic meaning. Words or sentences with similar meanings have vectors that are close together in the embedding space. Models like OpenAI's text-embedding-ada-002 and Google's text-embedding-004 produce fixed-size vectors. The dimensionality (e.g., 768 or 1536) affects the amount of information captured and storage costs."
        title = "Understanding Text Embeddings"
        url = "https://example.com/embeddings-explained"
    },
    @{
        text = "Tailwind CSS is a utility-first CSS framework. Instead of writing custom CSS, you compose designs using utility classes like flex, p-4, text-lg, bg-blue-500. Benefits include rapid prototyping, consistent design systems, and smaller bundle sizes through purging unused styles. Tailwind v4 introduces a Vite plugin, CSS-first configuration, and automatic content detection."
        title = "Tailwind CSS Modern Guide"
        url = "https://example.com/tailwind-guide"
    },
    @{
        text = "Supabase is an open-source Firebase alternative built on PostgreSQL. It provides authentication, real-time subscriptions, storage, edge functions, and a REST API auto-generated from your database schema. The pgvector extension enables vector similarity search. The free tier includes 500MB database storage, 1GB file storage, and 50,000 monthly active users."
        title = "Supabase Platform Overview"
        url = "https://example.com/supabase-overview"
    },
    @{
        text = "Monitoring with Prometheus and Grafana: Prometheus scrapes metrics from application endpoints (/metrics) at regular intervals and stores them as time series data. Grafana connects to Prometheus as a data source and visualizes metrics through dashboards. Key metrics to track: request rate, error rate, latency percentiles (p50, p95, p99), and resource utilization (CPU, memory)."
        title = "Monitoring Stack Setup"
        url = "https://example.com/prometheus-grafana"
    },
    @{
        text = "The HNSW (Hierarchical Navigable Small World) algorithm is used for approximate nearest neighbor search in vector databases. It builds a multi-layer graph where each layer has fewer nodes. Search starts at the top layer and navigates down, getting progressively more precise. HNSW offers a good balance between search speed and recall accuracy. Key parameters are M (number of connections) and ef_construction (build-time quality)."
        title = "HNSW Algorithm Explained"
        url = "https://example.com/hnsw-algorithm"
    },
    @{
        text = "Python async/await enables concurrent I/O operations without threads. asyncio is the standard library for writing async code. Key concepts: coroutines (async def), event loop (runs coroutines), await (pause until result ready), asyncio.gather (run multiple coroutines concurrently), and asyncio.to_thread (run blocking code in a thread pool). FastAPI is built on async, making it ideal for I/O-heavy APIs."
        title = "Python Async Programming"
        url = "https://example.com/python-async"
    },
    @{
        text = "Chrome Extension Manifest V3 is the latest extension platform. Key changes from V2: service workers replace persistent background pages, the Fetch API replaces XMLHttpRequest in service workers, host_permissions are separate from permissions, and content security policy is stricter. Plasmo framework abstracts away much of the Manifest V3 complexity and provides hot reloading during development."
        title = "Chrome Extension Manifest V3"
        url = "https://example.com/manifest-v3"
    },
    @{
        text = "Pydantic v2 is a data validation library for Python. It uses type annotations to define data models and validates input data at runtime. Key features: BaseModel for data classes, Field for validation constraints, model_validate_json for parsing JSON, computed fields, and discriminated unions. Pydantic v2 is rewritten in Rust for 5-50x speed improvement over v1. It integrates seamlessly with FastAPI."
        title = "Pydantic V2 Guide"
        url = "https://example.com/pydantic-v2"
    },
    @{
        text = "Git branching strategies: trunk-based development uses short-lived feature branches merged frequently to main. GitFlow uses develop, feature, release, and hotfix branches. GitHub Flow is simpler: create branch from main, make changes, open PR, review, merge to main. For solo projects, trunk-based with feature flags is simplest. Always write descriptive commit messages and squash before merging."
        title = "Git Branching Strategies"
        url = "https://example.com/git-branching"
    },
    @{
        text = "REST API design best practices: use nouns for resource URLs (not verbs), use HTTP methods correctly (GET for read, POST for create, PUT for update, DELETE for remove), return appropriate status codes (200, 201, 400, 404, 500), support pagination for list endpoints, use consistent error response format, and version your API (v1, v2) in the URL or headers."
        title = "REST API Design Guide"
        url = "https://example.com/rest-api-design"
    }
)

Write-Host "🌱 Seeding Mnemos with $($notes.Count) notes..." -ForegroundColor Green
Write-Host "API: $API`n" -ForegroundColor Cyan

$seeded = 0
$failed = 0

foreach ($note in $notes) {
    try {
        $body = @{
            text = $note.text
            source_url = $note.url
            page_title = $note.title
            capture_type = "highlight"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$API/capture" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
        
        Write-Host "✓ Seeded: $(($note.title).PadRight(35)) (ID: $($response.note_id.Substring(0, 8))...)" -ForegroundColor Green
        $seeded++
        
        Start-Sleep -Milliseconds 500
    }
    catch {
        Write-Host "✗ Failed: $(($note.title).PadRight(35)) — $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n📊 Results: $seeded seeded, $failed failed" -ForegroundColor Yellow
if ($failed -eq 0) {
    Write-Host "✅ All notes seeded successfully!" -ForegroundColor Green
    Write-Host "`n⏳ Waiting 60 seconds for background processing..." -ForegroundColor Cyan
    for ($i = 60; $i -gt 0; $i--) {
        Write-Host -NoNewline "`r  Processing: $($i)s remaining...     "
        Start-Sleep -Seconds 1
    }
    Write-Host "`n✨ Done! Check http://localhost:5173 to see your notes" -ForegroundColor Green
}
