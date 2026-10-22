import asyncio
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse
from app.async_utils import run_in_thread
from app.config import is_registration_enabled, set_registration_enabled, ADMIN_SECRET_KEY
from app.auth import (
    is_https_request,
    set_session_cookie,
    clear_session_cookie,
    extract_token_from_request,
    verify_session_token,
)
from app.crud import (
    register_user,
    authenticate_user,
    delete_session,
    set_user_passkey,
    verify_user_passkey,
    get_user_profile,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/config")
async def api_auth_config():
    """Returns current authentication configuration (whether registration is open)."""
    return {
        "status": "ok",
        "allow_registration": is_registration_enabled(),
    }


@router.post("/admin/registration")
async def api_admin_toggle_registration(request: Request):
    """Admin endpoint to turn registration ON or OFF dynamically."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    secret = (body.get("admin_key") or request.headers.get("X-Admin-Key") or "").strip()
    if not secret or secret != ADMIN_SECRET_KEY:
        return JSONResponse({"status": "error", "message": "Unauthorized: Invalid admin key"}, status_code=401)

    new_state = body.get("enabled")
    if new_state is None:
        return JSONResponse({"status": "error", "message": "Missing 'enabled' parameter (true/false)"}, status_code=400)

    current = set_registration_enabled(bool(new_state))
    return {
        "status": "ok",
        "message": f"Account registration is now {'ENABLED' if current else 'DISABLED'}",
        "allow_registration": current,
    }


@router.post("/register")
async def api_register(request: Request, response: Response):
    # Enforce admin registration toggle
    if not is_registration_enabled():
        return JSONResponse(
            {
                "status": "error",
                "message": "New account registration is currently disabled by administrator.",
                "registration_disabled": True,
            },
            status_code=403,
        )

    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "message": "Invalid JSON"}, status_code=400)

    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    display_name = data.get("display_name", "").strip()
    avatar = data.get("avatar", "").strip()
    passkey = data.get("passkey", "").strip()

    user, token, err = await run_in_thread(
        register_user,
        username=username,
        password=password,
        display_name=display_name,
        avatar=avatar,
        passkey=passkey if passkey else None,
    )

    if err or not user:
        return JSONResponse({"status": "error", "message": err or "Registration failed"}, status_code=400)

    is_https = is_https_request(request)
    set_session_cookie(response, token, is_https)

    return {
        "status": "ok",
        "message": "Account created successfully",
        "user": user,
        "token": token,
        "need_passkey_setup": not bool(user.get("has_passkey")),
    }


@router.post("/login")
async def api_login(request: Request, response: Response):
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"status": "error", "message": "Invalid JSON"}, status_code=400)

    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    user, token, err = await run_in_thread(authenticate_user, username, password)
    if err or not user:
        return JSONResponse({"status": "error", "message": err or "Invalid credentials"}, status_code=401)

    is_https = is_https_request(request)
    set_session_cookie(response, token, is_https)

    return {
        "status": "ok",
        "message": "Logged in successfully",
        "user": user,
        "token": token,
        "has_passkey": bool(user.get("has_passkey")),
    }


@router.post("/logout")
async def api_logout(request: Request, response: Response):
    token = extract_token_from_request(request)
    if token:
        await run_in_thread(delete_session, token)
    clear_session_cookie(response)
    return {"status": "ok", "message": "Logged out"}


@router.get("/me")
async def api_get_me(request: Request):
    token = extract_token_from_request(request)
    if not token:
        return JSONResponse({"status": "unauthorized", "user": None}, status_code=401)

    user = await run_in_thread(verify_session_token, token)
    if not user:
        return JSONResponse({"status": "unauthorized", "user": None}, status_code=401)

    return {"status": "ok", "user": user}


@router.post("/passkey/setup")
async def api_set_passkey(request: Request):
    token = extract_token_from_request(request)
    user = await run_in_thread(verify_session_token, token) if token else None

    try:
        data = await request.json()
    except Exception:
        data = {}

    username = (user["username"] if user else data.get("username", "")).strip().lower()
    passkey = str(data.get("passkey", "")).strip()

    if not username:
        return JSONResponse({"status": "error", "message": "Not authenticated"}, status_code=401)
    if len(passkey) != 4 or not passkey.isdigit():
        return JSONResponse({"status": "error", "message": "Passkey must be a 4-digit number"}, status_code=400)

    ok = await run_in_thread(set_user_passkey, username, passkey)
    if ok:
        return {"status": "ok", "message": "Passkey configured successfully"}
    return JSONResponse({"status": "error", "message": "Could not set passkey"}, status_code=500)


@router.post("/passkey/verify")
async def api_verify_passkey(request: Request):
    try:
        data = await request.json()
    except Exception:
        data = {}

    username = data.get("username", "").strip().lower()
    passkey = str(data.get("passkey", "")).strip()

    if not username or not passkey:
        return JSONResponse({"status": "error", "message": "Missing username or passkey"}, status_code=400)

    valid = await run_in_thread(verify_user_passkey, username, passkey)
    if valid:
        profile = await run_in_thread(get_user_profile, username)
        return {"status": "ok", "verified": True, "user": profile}
    return JSONResponse({"status": "error", "verified": False, "message": "Incorrect passcode"}, status_code=400)
