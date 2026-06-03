# third party imports
from app.logging.logs import log_unhandled_exception
from fastapi import APIRouter, Depends, HTTPException, Request

# annex imports
from app.logging.logs import log_unhandled_exception
from app.sessions.service import session_start, session_start_update, session_end, initiate_end_session, report_encrypted_file
from app.rate_limiter import limiter, user_limiter
from app.config import IS_DEV
from app.auth.depends import user_validation
from app.auth.depends import user_validation as dev_user_validation
from app.sessions.models import StartSessionMetadata, SessionStartUpdate, EndSession, InitiateEndSession, ReportEncryptedFile

# Currently, dev user and user are the same, but this allows for future differences
router_dependencies = [Depends(dev_user_validation)] if IS_DEV else [
    Depends(user_validation)]

sessions_router = APIRouter(
    prefix="/sessions",
    tags=["Sessions"],
    dependencies=router_dependencies,
    responses={404: {"description": "Not found"}},
)


@sessions_router.post(
    "/start",
    summary="Start a users session- create and save AES key.",
    tags=["Sessions"],
)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def start_session(request: Request, session_metadata: StartSessionMetadata):
    try:
        user = request.state.user

        return session_start(session_metadata, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="sessions",
            endpoint="start",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@sessions_router.post(
    "/session_start_update",
    summary="Finalize encryption: record actual encryption time.",
    tags=["Sessions"],
)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def session_start_update_endpoint(request: Request, session_metadata: SessionStartUpdate):
    try:
        user = request.state.user
        return session_start_update(session_metadata, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="sessions",
            endpoint="session_start_update",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@sessions_router.post(
    "/report_file",
    summary="Report a single encrypted file for crash recovery tracking.",
    tags=["Sessions"],
)
@limiter.limit("5000/hour;500/minute")
@user_limiter.limit("5000/hour;500/minute")
def report_file_endpoint(request: Request, file_report: ReportEncryptedFile):
    try:
        user = request.state.user
        return report_encrypted_file(file_report, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="sessions",
            endpoint="report_file",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@sessions_router.post(
    "/end",
    summary="End a users session, update relevant values in db",
    tags=["Sessions"],
)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def end_session(request: Request, session: EndSession):
    try:
        user = request.state.user
        return session_end(session.session_id, session.status, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="sessions",
            endpoint="end",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )


@sessions_router.post(
    "/initiate_end_session",
    summary="Retrieve AES key and file records for decryption.",
    tags=["Sessions"],
)
@limiter.limit("500/hour;50/minute")
@user_limiter.limit("500/hour;50/minute")
def initiate_end_session_endpoint(request: Request, session: InitiateEndSession):
    try:
        user = request.state.user
        return initiate_end_session(session.session_id, user.user_id)

    except HTTPException as http_exc:
        raise http_exc

    except Exception as e:
        log_unhandled_exception(
            request=request,
            exc=e,
            router="sessions",
            endpoint="initiate_end_session",
        )

        request.state.exception_logged = True

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )
