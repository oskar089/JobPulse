# Code Review Rules

## Python / FastAPI
- Use async def for routes and DB operations
- Use SQLAlchemy 2.0 style (select() not query)
- Prefer joinedload over select(N+1)
- Type-annotate all functions
- Keep routes thin — logic in services/tasks
- Use Depends() for DI (auth, DB sessions)
- Handle errors with typed exceptions, not bare raises

## Docker / Compose
- Always add healthchecks to services
- Use slim/alpine base images
- Pin service images to specific versions
- Never mount .env directly in compose
