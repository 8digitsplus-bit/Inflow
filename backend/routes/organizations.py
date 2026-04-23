"""Team / Organization management routes."""
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr

from database import db
from models import User
from dependencies import get_current_user, require_owner, get_org_user_ids
from utils.email import send_email, build_invite_email_html

logger = logging.getLogger(__name__)
router = APIRouter()

INVITE_EXPIRY_DAYS = 7


def _enterprise_tier(tier: str) -> bool:
    return tier and tier.startswith("enterprise_")


class InviteRequest(BaseModel):
    email: EmailStr


async def _get_org(org_id: str) -> dict:
    org = await db.organizations.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _get_seat_usage(org_id: str) -> dict:
    org = await _get_org(org_id)
    members = await db.users.count_documents({"org_id": org_id})
    pending_invites = await db.org_invites.count_documents({
        "org_id": org_id, "status": "pending"
    })
    seats = org.get("seat_count", 1)
    tier = org.get("subscription_tier", "trial")
    return {
        "org_id": org_id,
        "org_name": org.get("name"),
        "subscription_tier": tier,
        "is_enterprise": _enterprise_tier(tier),
        "seats": seats,
        "members": members,
        "pending_invites": pending_invites,
        "available": max(0, seats - members - pending_invites),
    }


# ---------- Endpoints ---------- #

@router.get("/org/me")
async def get_my_org(user: User = Depends(get_current_user)):
    """Current user's organization + their role."""
    if not user.org_id:
        raise HTTPException(status_code=404, detail="User has no organization")
    org = await _get_org(user.org_id)
    return {
        "org_id": org["org_id"],
        "name": org.get("name"),
        "owner_user_id": org.get("owner_user_id"),
        "subscription_tier": org.get("subscription_tier", "trial"),
        "subscription_status": org.get("subscription_status", "active"),
        "seat_count": org.get("seat_count", 1),
        "role": user.role or "member",
    }


@router.get("/org/members")
async def list_members(user: User = Depends(get_current_user)):
    """List all members of the user's org."""
    if not user.org_id:
        raise HTTPException(status_code=404, detail="No organization")
    members = await db.users.find(
        {"org_id": user.org_id},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "picture": 1, "created_at": 1}
    ).to_list(500)
    return {"members": members}


@router.get("/org/seats")
async def get_seats(user: User = Depends(get_current_user)):
    """Seat usage for the user's org."""
    if not user.org_id:
        raise HTTPException(status_code=404, detail="No organization")
    return await _get_seat_usage(user.org_id)


@router.get("/org/invites")
async def list_invites(owner: User = Depends(require_owner)):
    """List pending invites (owner only)."""
    invites = await db.org_invites.find(
        {"org_id": owner.org_id, "status": "pending"},
        {"_id": 0, "token": 0}  # hide token
    ).to_list(100)
    return {"invites": invites}


@router.post("/org/invite")
async def invite_member(body: InviteRequest, request: Request, owner: User = Depends(require_owner)):
    """Send an invite email (owner only). Requires Enterprise plan."""
    org = await _get_org(owner.org_id)
    tier = org.get("subscription_tier", "trial")

    if not _enterprise_tier(tier):
        raise HTTPException(
            status_code=403,
            detail="Team invites require an Enterprise plan. Please upgrade to invite teammates."
        )

    email = body.email.strip().lower()

    # Block invite if email matches any existing user in the org
    existing_member = await db.users.find_one({"email": email, "org_id": owner.org_id}, {"_id": 0})
    if existing_member:
        raise HTTPException(status_code=400, detail="This user is already a member of your team")

    # Block duplicate pending invite
    existing_invite = await db.org_invites.find_one(
        {"org_id": owner.org_id, "email": email, "status": "pending"}, {"_id": 0}
    )
    if existing_invite:
        raise HTTPException(status_code=400, detail="An invite has already been sent to this email")

    # Seat availability
    usage = await _get_seat_usage(owner.org_id)
    if usage["available"] <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"No seats available. You have {usage['seats']} seat(s); all are used or pending. Add more seats from your plan."
        )

    token = uuid.uuid4().hex + uuid.uuid4().hex
    invite_id = f"inv_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=INVITE_EXPIRY_DAYS)

    invite_doc = {
        "invite_id": invite_id,
        "token": token,
        "org_id": owner.org_id,
        "email": email,
        "invited_by": owner.user_id,
        "status": "pending",
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
    }
    await db.org_invites.insert_one(invite_doc)

    # Build accept URL from the request origin (or fallback)
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    accept_url = f"{origin}/accept-invite/{token}"

    email_result = await send_email(
        to=email,
        subject=f"{owner.name} invited you to join {org.get('name')} on InFlow",
        html=build_invite_email_html(owner.name, org.get("name", "their team"), accept_url),
        text=f"{owner.name} invited you to join {org.get('name')} on InFlow. Accept: {accept_url}",
    )

    return {
        "invite_id": invite_id,
        "email": email,
        "accept_url": accept_url,
        "email_sent": email_result["sent"],
        "email_reason": email_result["reason"],
        "expires_at": expires_at.isoformat(),
    }


@router.get("/org/invite/{token}")
async def get_invite(token: str):
    """Public endpoint — lookup invite details by token (for the accept page)."""
    invite = await db.org_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")

    expires_at = invite.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if invite["status"] != "pending":
        raise HTTPException(status_code=410, detail=f"Invite is {invite['status']}")
    if expires_at < datetime.now(timezone.utc):
        await db.org_invites.update_one(
            {"invite_id": invite["invite_id"]}, {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=410, detail="Invite has expired")

    org = await _get_org(invite["org_id"])
    inviter = await db.users.find_one(
        {"user_id": invite["invited_by"]}, {"_id": 0, "name": 1, "email": 1}
    )

    return {
        "email": invite["email"],
        "org_name": org.get("name"),
        "subscription_tier": org.get("subscription_tier"),
        "inviter_name": (inviter or {}).get("name", "A teammate"),
        "inviter_email": (inviter or {}).get("email"),
        "expires_at": invite["expires_at"],
    }


@router.post("/org/accept-invite/{token}")
async def accept_invite(token: str, user: User = Depends(get_current_user)):
    """Authenticated user accepts an invite — joins the org as 'member'."""
    invite = await db.org_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite["status"] != "pending":
        raise HTTPException(status_code=410, detail=f"Invite is {invite['status']}")

    expires_at = invite.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.org_invites.update_one(
            {"invite_id": invite["invite_id"]}, {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=410, detail="Invite has expired")

    # Email must match (case-insensitive)
    if user.email.lower() != invite["email"].lower():
        raise HTTPException(
            status_code=403,
            detail=f"This invite was sent to {invite['email']}. Please sign in with that email."
        )

    # Seat availability (re-check — someone else may have joined since invite was sent)
    usage = await _get_seat_usage(invite["org_id"])
    if usage["members"] >= usage["seats"]:
        raise HTTPException(status_code=400, detail="No seats available in this organization")

    # If the user already owns a solo org that has no other members, we'll abandon it
    # (their data stays linked via user_id but org_id moves). For Phase 1 keep simple.
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"org_id": invite["org_id"], "role": "member"}}
    )
    await db.org_invites.update_one(
        {"invite_id": invite["invite_id"]},
        {"$set": {
            "status": "accepted",
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "accepted_by": user.user_id,
        }}
    )

    org = await _get_org(invite["org_id"])
    return {
        "status": "joined",
        "org_id": invite["org_id"],
        "org_name": org.get("name"),
        "subscription_tier": org.get("subscription_tier"),
    }


@router.delete("/org/members/{user_id}")
async def remove_member(user_id: str, owner: User = Depends(require_owner)):
    """Remove a member from the org. Owner can't remove themselves this way.
    Member loses org access immediately; seat count on Stripe decreases at next renewal.
    """
    if user_id == owner.user_id:
        raise HTTPException(status_code=400, detail="Owners cannot remove themselves. Cancel the subscription instead.")

    target = await db.users.find_one(
        {"user_id": user_id, "org_id": owner.org_id}, {"_id": 0}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in your organization")

    # Detach the user from the org (they revert to their own solo org)
    new_org_id = f"org_{uuid.uuid4().hex[:12]}"
    org_name = (target.get("name") or target.get("email", "My")) + "'s Team"
    now = datetime.now(timezone.utc).isoformat()

    await db.organizations.insert_one({
        "org_id": new_org_id,
        "name": org_name,
        "owner_user_id": user_id,
        "subscription_tier": "expired",  # removed member loses Enterprise access
        "subscription_status": "expired",
        "seat_count": 1,
        "created_at": now,
    })
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "org_id": new_org_id,
            "role": "owner",
            "subscription_tier": "expired",
        }}
    )

    return {
        "status": "removed",
        "removed_user_id": user_id,
        "note": "Seat will be released at next billing renewal.",
    }


@router.post("/org/invites/{invite_id}/revoke")
async def revoke_invite(invite_id: str, owner: User = Depends(require_owner)):
    invite = await db.org_invites.find_one(
        {"invite_id": invite_id, "org_id": owner.org_id}, {"_id": 0}
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Invite is already {invite['status']}")
    await db.org_invites.update_one(
        {"invite_id": invite_id}, {"$set": {"status": "revoked"}}
    )
    return {"status": "revoked", "invite_id": invite_id}


# ---------- Signup-and-accept (for brand-new invitees) ---------- #

class SignupAndAcceptRequest(BaseModel):
    name: str
    password: str


@router.post("/org/signup-and-accept/{token}")
async def signup_and_accept(token: str, body: SignupAndAcceptRequest):
    """Create a new user account from an invite and join the org as a member.
    Sets the session cookie so the user is logged in immediately.
    """
    import bcrypt
    from starlette.responses import JSONResponse

    invite = await db.org_invites.find_one({"token": token}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite["status"] != "pending":
        raise HTTPException(status_code=410, detail=f"Invite is {invite['status']}")

    expires_at = invite.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.org_invites.update_one({"invite_id": invite["invite_id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=410, detail="Invite has expired")

    email = invite["email"].strip().lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists — please log in and accept the invite.")

    usage = await _get_seat_usage(invite["org_id"])
    if usage["members"] >= usage["seats"]:
        raise HTTPException(status_code=400, detail="No seats available in this organization")

    hashed = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "picture": None,
        "password_hash": hashed,
        "auth_provider": "email",
        "subscription_tier": "trial",
        "subscription_status": "active",
        "org_id": invite["org_id"],
        "role": "member",
        "created_at": now_iso,
    })
    await db.org_invites.update_one(
        {"invite_id": invite["invite_id"]},
        {"$set": {"status": "accepted", "accepted_at": now_iso, "accepted_by": user_id}}
    )

    session_token = f"session_{uuid.uuid4().hex}"
    session_expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": session_expires.isoformat(),
        "created_at": now_iso,
    })

    org = await _get_org(invite["org_id"])
    resp = JSONResponse(content={
        "status": "joined",
        "org_id": invite["org_id"],
        "org_name": org.get("name"),
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "role": "member",
    })
    resp.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    return resp
