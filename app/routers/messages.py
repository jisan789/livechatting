import asyncio
import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from app.auth import extract_token_from_request, verify_session_token
from app.crud import get_conversation, clear_conversation, mark_messages_seen
from app.websocket import connections, safe_send, send_to_user
from app.async_utils import run_in_thread

logger = logging.getLogger("livechat.messages")
router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.get("")
async def api_get_messages(request: Request):
    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    user1 = request.query_params.get("user1") or (current_user["username"] if current_user else "")
    user2 = request.query_params.get("user2") or request.query_params.get("opponent", "")

    if not user1 or not user2:
        return JSONResponse({"status": "error", "message": "Missing conversation participants"}, status_code=400)

    msgs = await run_in_thread(get_conversation, user1, user2)
    return {"status": "ok", "messages": msgs, "count": len(msgs)}


@router.post("/clear")
async def api_clear_messages(request: Request):
    """
    Safely clear conversation messages between two specific users.
    CRITICAL: Protects against clearing the entire database.
    Only deletes records where sender and recipient match the two participants.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    user1 = (current_user["username"] if current_user else body.get("user1", "")).strip().lower()
    user2 = (body.get("opponent") or body.get("user2") or "").strip().lower()

    if not user1 or not user2:
        return JSONResponse(
            {
                "status": "error",
                "message": "Both conversation participants must be specified to delete messages. Database wipe prevented.",
            },
            status_code=400,
        )

    ok, deleted_count = await run_in_thread(clear_conversation, user1, user2)

    if not ok:
        return JSONResponse({"status": "error", "message": "Failed to clear conversation"}, status_code=500)

    # Notify connected opponent in real-time across all their devices
    await send_to_user(user2, {"type": "chat_cleared", "from": user1})
    # Also notify sender's other devices so they clear simultaneously
    await send_to_user(user1, {"type": "chat_cleared", "from": user2, "self_cleared": True})

    return {
        "status": "ok",
        "deleted_count": deleted_count,
        "message": f"Successfully deleted {deleted_count} messages between {user1} and {user2}.",
    }


@router.post("/seen")
async def api_mark_seen(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    token = extract_token_from_request(request)
    current_user = await run_in_thread(verify_session_token, token) if token else None

    sender = (body.get("sender") or body.get("opponent") or "").strip().lower()
    recipient = (current_user["username"] if current_user else (body.get("recipient") or body.get("user") or "")).strip().lower()
    ids = body.get("ids", [])

    ok = await run_in_thread(mark_messages_seen, sender, recipient, ids)
    return {"status": "ok" if ok else "error"}
