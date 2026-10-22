import asyncio
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.auth import extract_token_from_request, verify_session_token
from app.crud import get_all_users, update_user_profile
from app.websocket import connections
from app.async_utils import run_in_thread

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users")
async def api_get_users(request: Request):
    token = extract_token_from_request(request)
    current_user_obj = await run_in_thread(verify_session_token, token) if token else None
    current_uname = current_user_obj["username"] if current_user_obj else request.query_params.get("current_user")

    users_list = await run_in_thread(get_all_users, current_uname)

    # Attach live online flag from active connections
    for u in users_list:
        uname = u["username"]
        u["is_online"] = bool(connections.get(uname))

    return {"status": "ok", "users": users_list}


@router.post("/user/profile")
async def api_update_profile(request: Request):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None
    if not current_user:
        return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)

    try:
        data = await request.json()
    except Exception:
        data = {}

    display_name = data.get("display_name", "").strip() or None
    avatar = data.get("avatar", "").strip() or None

    updated = await run_in_thread(
        update_user_profile,
        username=current_user["username"],
        display_name=display_name,
        avatar=avatar,
    )

    if updated:
        return {"status": "ok", "user": updated}
    return JSONResponse({"status": "error", "message": "Failed to update profile"}, status_code=400)
