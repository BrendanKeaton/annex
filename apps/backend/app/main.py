# std library
import time
import uuid

# third party libraries
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi.middleware import SlowAPIMiddleware
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

# annex imports
from app.auth.router import auth_router
from app.auth.router import auth_anon_router
from app.path.router import path_router
from app.sessions.router import sessions_router
from app.testing.gen_data import test_router
from app.org.router import org_router
from app.account.router import account_router
from app.rate_limiter import limiter
from app.logging.logs import log_middleware
from app.config import IS_DEV, CORS_ORIGINS
from app.logging.logs import log_unhandled_exception
from app.third_party_clients.supabase import supabase_service_client

app = FastAPI(
    docs_url="/docs" if IS_DEV else None,
    redoc_url="/redoc" if IS_DEV else None,
    openapi_url="/openapi.json" if IS_DEV else None,
)

origins = CORS_ORIGINS


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    try:

        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.time()
        response = await call_next(request)  # This continues flow to endpoint
        duration_ms = time.time() - start

        response.headers["X-Request-ID"] = request_id

        # Default logging function for middleware
        log_middleware(request, request_id, int(
            response.status_code), duration_ms)
        return response
    except Exception as e:
        raise e


# This is rate limiting stuff. We rate limit by IP only now.
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
    )


app.state.limiter = limiter

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    # Defense-in-depth headers for browser clients (Next.js). No-op for native clients (Tauri).
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Add middlewares
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(Exception)
async def global_unhandled_exception_handler(
    request: Request,
    exc: Exception,
):
    if getattr(request.state, "exception_logged", False):
        # Already logged intentionally — do not double log
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    log_unhandled_exception(
        request=request,
        exc=exc,
        endpoint="__global__",
        extra={"details": "DEFAULT GLOBAL EXCEPTION HANDLER", "type": "DEFAULT"},
    )

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/health", tags=["Health"])
async def health_check():
    try:
        supabase_service_client.from_("users").select("id").limit(1).execute()
        return {"status": "ok", "database": "ok"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable"},
        )


app.include_router(auth_router)
app.include_router(auth_anon_router)
app.include_router(path_router)
app.include_router(sessions_router)
app.include_router(org_router)
app.include_router(account_router)

if IS_DEV:
    app.include_router(test_router)
