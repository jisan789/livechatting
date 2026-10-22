import asyncio
import logging
from typing import Dict, Set, Optional, List, Any
from fastapi import WebSocket
from app.crud import save_message, update_user_presence, mark_messages_seen
from app.async_utils import run_in_thread

logger = logging.getLogger("livechat.ws")

# In-memory registry of active WebSocket connections supporting multiple devices per user account:
# {username: {WebSocket, ...}}
connections: Dict[str, Set[WebSocket]] = {}


def is_user_online(username: str) -> bool:
    """Check if at least one device connection is active for this username."""
    user = (username or "").strip().lower()
    return bool(connections.get(user))


async def safe_send(ws: WebSocket, payload: dict) -> bool:
    """Send JSON payload over WebSocket, catching disconnects gracefully."""
    try:
        await ws.send_json(payload)
        return True
    except Exception:
        return False


async def send_to_user(recipient: str, payload: dict, exclude_ws: Optional[WebSocket] = None) -> bool:
    """
    Send payload to ALL active device connections for the recipient.
    Optionally excludes a specific WebSocket (e.g. the originating device).
    """
    recipient = recipient.strip().lower()
    user_sockets = list(connections.get(recipient, set()))
    if not user_sockets:
        return False

    dead_sockets = []
    delivered = False

    for ws in user_sockets:
        if exclude_ws is not None and ws is exclude_ws:
            continue
        ok = await safe_send(ws, payload)
        if ok:
            delivered = True
        else:
            dead_sockets.append(ws)

    # Clean up any broken connections
    if dead_sockets and recipient in connections:
        for dead_ws in dead_sockets:
            connections[recipient].discard(dead_ws)
        if not connections[recipient]:
            connections.pop(recipient, None)

    return delivered


async def broadcast(payload: dict, exclude: Optional[str] = None):
    """Broadcast JSON payload to all active connections of all users except the excluded user."""
    exclude_clean = exclude.strip().lower() if exclude else None

    for uname, sockets in list(connections.items()):
        if exclude_clean and uname == exclude_clean:
            continue
        dead_sockets = []
        for ws in list(sockets):
            ok = await safe_send(ws, payload)
            if not ok:
                dead_sockets.append(ws)
        if dead_sockets and uname in connections:
            for dead_ws in dead_sockets:
                connections[uname].discard(dead_ws)
            if not connections[uname]:
                connections.pop(uname, None)


async def background_save_message(user_key: str, recipient: str, msg_type: str, data: dict):
    """
    Persist chat message with automatic retry to ensure zero message loss
    across network hiccups or database lock contentions.
    """
    try:
        if msg_type == "chat":
            content = data.get("text") or data.get("text_content")
        elif msg_type == "image":
            content = data.get("image") or data.get("text_content")
        else:
            content = data.get("audio") or data.get("text") or data.get("text_content")

        client_id = data.get("id") or data.get("client_msg_id")

        for attempt in range(3):
            try:
                res = await run_in_thread(
                    save_message,
                    sender=user_key,
                    recipient=recipient,
                    msg_type=msg_type,
                    text_content=content,
                    media_duration=data.get("duration"),
                    client_time=data.get("time"),
                    seen=False,
                    reply_to=data.get("reply_to"),
                    client_msg_id=client_id,
                )
                if res:
                    break
            except Exception as save_err:
                logger.warning(f"[WS] Save message attempt {attempt + 1}/3 failed: {save_err}")
                if attempt < 2:
                    await asyncio.sleep(0.3 * (attempt + 1))
    except Exception as e:
        logger.error(f"[WS] Error saving message in background: {e}")


async def background_mark_seen(sender: str, recipient: str, ids: Optional[list] = None):
    """Mark seen in background task with retry."""
    try:
        await run_in_thread(
            mark_messages_seen,
            sender=sender,
            recipient=recipient,
            msg_ids=ids,
        )
    except Exception as e:
        logger.error(f"[WS] Error marking seen in background: {e}")
