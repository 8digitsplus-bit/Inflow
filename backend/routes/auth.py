from fastapi import APIRouter, HTTPException, Request, Response, Depends
from datetime import datetime, timezone, timedelta
import uuid
import os
import httpx
import bcrypt
import random

from database import db
from models import User, RegisterRequest, LoginRequest, OnboardingData
from dependencies import get_current_user
from utils.email import send_email
from utils.rate_limit import (
    limiter,
    check_email_rate_limit,
    record_email_failure,
    reset_email_attempts,
)

router = APIRouter()


def _build_2fa_email_html(code: str, user_name: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0b;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="480" style="background:#111113;border:1px solid #26262a;border-radius:16px;padding:40px;max-width:480px;">
          <tr>
            <td>
              <div style="color:#818cf8;font-size:12px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:24px;">InFlow · Verification</div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 12px 0;line-height:1.2;">Hi {user_name}, here's your sign-in code</h1>
              <p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 28px 0;">
                Use this code to finish signing in. It expires in 10 minutes.
              </p>
              <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:22px;text-align:center;margin-bottom:24px;">
                <div style="color:#ffffff;font-size:36px;font-weight:700;letter-spacing:0.4em;font-family:'SFMono-Regular',Consolas,monospace;">{code}</div>
              </div>
              <p style="color:#71717a;font-size:12px;line-height:1.5;margin:0;">
                If you didn't request this, someone may be trying to access your account — change your password immediately.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


async def _send_2fa_code(user_doc: dict) -> tuple:
    """Generate an OTP, store it, email it. Returns (code, email_sent)."""
    code = str(random.randint(100000, 999999))
    await db.otp_codes.delete_many({"user_id": user_doc["user_id"]})
    await db.otp_codes.insert_one({
        "user_id": user_doc["user_id"],
        "code": code,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    })
    result = await send_email(
        to=user_doc["email"],
        subject=f"Your InFlow verification code is {code}",
        html=_build_2fa_email_html(code, user_doc.get("name", "there")),
        text=f"Your InFlow verification code is {code}. It expires in 10 minutes.",
    )
    return code, result["sent"]

# ============== GOOGLE SESSION AUTH ==============

@router.post("/auth/session")
@limiter.limit("10/minute")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    data = await request.json()
    session_id = data.get("session_id")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )

        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")

        auth_data = resp.json()

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    existing_user = await db.users.find_one({"email": auth_data["email"]}, {"_id": 0})

    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": auth_data["name"],
                "picture": auth_data.get("picture"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        org_id = f"org_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.organizations.insert_one({
            "org_id": org_id,
            "name": f"{auth_data['name']}'s Team",
            "owner_user_id": user_id,
            "subscription_tier": "trial",
            "subscription_status": "active",
            "seat_count": 1,
            "created_at": now_iso,
        })
        await db.users.insert_one({
            "user_id": user_id,
            "email": auth_data["email"],
            "name": auth_data["name"],
            "picture": auth_data.get("picture"),
            "subscription_tier": "trial",
            "subscription_status": "active",
            "org_id": org_id,
            "role": "owner",
            "trial_start": datetime.now(timezone.utc).isoformat(),
            "trial_end": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
            "created_at": now_iso
        })

    session_token = auth_data.get("session_token", f"session_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    # Compute trial days left for trial users
    if user_doc and user_doc.get("subscription_tier") == "trial":
        trial_end = user_doc.get("trial_end")
        if trial_end:
            now = datetime.now(timezone.utc)
            if isinstance(trial_end, str):
                end = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
            else:
                end = trial_end.replace(tzinfo=timezone.utc) if trial_end.tzinfo is None else trial_end
            days_left = (end - now).days
            user_doc["trial_days_left"] = max(0, days_left)
            if days_left <= 0:
                user_doc["subscription_tier"] = "expired"
                await db.users.update_one({"user_id": user_id}, {"$set": {"subscription_tier": "expired"}})
    
    return user_doc


@router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user with trial status"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "password_hash": 0})

    # Check trial expiration
    if user_doc and user_doc.get("subscription_tier") == "trial":
        trial_end = user_doc.get("trial_end")
        if trial_end:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            # Handle both string and datetime objects
            if isinstance(trial_end, str):
                end = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
            else:
                # Ensure datetime has timezone info
                end = trial_end.replace(tzinfo=timezone.utc) if trial_end.tzinfo is None else trial_end
            days_left = (end - now).days
            user_doc["trial_days_left"] = max(0, days_left)
            if days_left <= 0:
                user_doc["subscription_tier"] = "expired"
                await db.users.update_one(
                    {"user_id": user.user_id},
                    {"$set": {"subscription_tier": "expired"}}
                )

    return user_doc


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})

    response.delete_cookie(key="session_token", path="/", samesite="none", secure=True)
    return {"message": "Logged out successfully"}


# ============== EMAIL/PASSWORD AUTH ==============

@router.post("/auth/register")
@limiter.limit("5/hour")
async def register_with_email(request: Request, req: RegisterRequest, response: Response):
    """Register with email and password"""
    existing = await db.users.find_one({"email": req.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = bcrypt.hashpw(req.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.organizations.insert_one({
        "org_id": org_id,
        "name": f"{req.name}'s Team",
        "owner_user_id": user_id,
        "subscription_tier": "trial",
        "subscription_status": "active",
        "seat_count": 1,
        "created_at": now_iso,
    })

    await db.users.insert_one({
        "user_id": user_id,
        "email": req.email,
        "name": req.name,
        "picture": None,
        "password_hash": hashed,
        "auth_provider": "email",
        "subscription_tier": "trial",
        "subscription_status": "active",
        "org_id": org_id,
        "role": "owner",
        "trial_start": datetime.now(timezone.utc).isoformat(),
        "trial_end": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
        "created_at": now_iso
    })

    session_token = f"session_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    user_doc["trial_days_left"] = 14
    return user_doc
@router.post("/auth/login")
@limiter.limit("10/15 minutes")
async def login_with_email(request: Request, req: LoginRequest, response: Response):
    """Login with email and password — returns 2FA challenge if enabled"""
    # Email-based throttle (prevents IP-rotating attackers from pounding one account)
    check_email_rate_limit(req.email)

    user_doc = await db.users.find_one({"email": req.email}, {"_id": 0})
    if not user_doc:
        record_email_failure(req.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    stored_hash = user_doc.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="This account uses social login. Please sign in with Google.")

    if not bcrypt.checkpw(req.password.encode("utf-8"), stored_hash.encode("utf-8")):
        record_email_failure(req.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Successful credential check — clear failure history
    reset_email_attempts(req.email)

    # Check if 2FA is enabled
    if user_doc.get("two_fa_enabled"):
        _, email_sent = await _send_2fa_code(user_doc)
        return {
            "requires_2fa": True,
            "user_id": user_doc["user_id"],
            "email_hint": user_doc["email"][:3] + "***" + user_doc["email"][user_doc["email"].index("@"):],
            "email_sent": email_sent,
        }

    # No 2FA — proceed with normal login
    return await _create_session_and_respond(user_doc, response)


@router.post("/auth/2fa/verify")
@limiter.limit("10/15 minutes")
async def verify_2fa(request: Request, response: Response):
    """Verify OTP code and complete login"""
    data = await request.json()
    user_id = data.get("user_id")
    code = data.get("code")

    if not user_id or not code:
        raise HTTPException(status_code=400, detail="user_id and code are required")

    otp_doc = await db.otp_codes.find_one({"user_id": user_id, "code": code}, {"_id": 0})
    if not otp_doc:
        raise HTTPException(status_code=401, detail="Invalid verification code")

    expires_at = datetime.fromisoformat(otp_doc["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        await db.otp_codes.delete_many({"user_id": user_id})
        raise HTTPException(status_code=401, detail="Code has expired. Please log in again.")

    await db.otp_codes.delete_many({"user_id": user_id})

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    return await _create_session_and_respond(user_doc, response)


@router.post("/auth/2fa/enable/request")
async def request_2fa_enable(current_user: User = Depends(get_current_user)):
    """Send a code to the user's email to confirm enabling 2FA."""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    _, email_sent = await _send_2fa_code(user_doc)
    return {
        "email_hint": user_doc["email"][:3] + "***" + user_doc["email"][user_doc["email"].index("@"):],
        "email_sent": email_sent,
    }


@router.post("/auth/2fa/enable/confirm")
async def confirm_2fa_enable(request: Request, current_user: User = Depends(get_current_user)):
    """Confirm the emailed code and enable 2FA on the account."""
    data = await request.json()
    code = (data.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code is required")

    otp_doc = await db.otp_codes.find_one(
        {"user_id": current_user.user_id, "code": code}, {"_id": 0}
    )
    if not otp_doc:
        raise HTTPException(status_code=401, detail="Invalid verification code")

    expires_at = datetime.fromisoformat(otp_doc["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        await db.otp_codes.delete_many({"user_id": current_user.user_id})
        raise HTTPException(status_code=401, detail="Code has expired. Please request a new one.")

    await db.otp_codes.delete_many({"user_id": current_user.user_id})
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"two_fa_enabled": True, "two_fa_method": "email"}}
    )
    return {"status": "enabled", "method": "email"}


@router.post("/auth/2fa/disable")
async def disable_2fa(current_user: User = Depends(get_current_user)):
    """Disable 2FA for the current user"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"two_fa_enabled": False, "two_fa_method": None}}
    )
    return {"status": "disabled"}


@router.post("/auth/2fa/resend")
@limiter.limit("3/5 minutes")
async def resend_2fa_code(request: Request):
    """Re-send the OTP during login (public — needs only user_id from the prior /auth/login response)."""
    data = await request.json()
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user_doc or not user_doc.get("two_fa_enabled"):
        raise HTTPException(status_code=404, detail="2FA not enabled for this user")
    _, email_sent = await _send_2fa_code(user_doc)
    return {"email_sent": email_sent}


@router.get("/auth/2fa/status")
async def get_2fa_status(current_user: User = Depends(get_current_user)):
    """Get 2FA status for the current user"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0, "two_fa_enabled": 1, "two_fa_method": 1})
    return {
        "enabled": user_doc.get("two_fa_enabled", False),
        "method": user_doc.get("two_fa_method"),
    }


async def _create_session_and_respond(user_doc: dict, response: Response):
    """Create session and return user data"""
    session_token = f"session_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    await db.user_sessions.insert_one({
        "user_id": user_doc["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    safe_user = {k: v for k, v in user_doc.items() if k != "password_hash"}

    # Compute trial days left for trial users
    if safe_user.get("subscription_tier") == "trial":
        trial_end = safe_user.get("trial_end")
        if trial_end:
            now = datetime.now(timezone.utc)
            if isinstance(trial_end, str):
                end = datetime.fromisoformat(trial_end.replace("Z", "+00:00"))
            else:
                end = trial_end.replace(tzinfo=timezone.utc) if trial_end.tzinfo is None else trial_end
            days_left = (end - now).days
            safe_user["trial_days_left"] = max(0, days_left)
            if days_left <= 0:
                safe_user["subscription_tier"] = "expired"
                await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"subscription_tier": "expired"}})

    return safe_user


# ============== ONBOARDING ==============

@router.get("/auth/onboarding-status")
async def get_onboarding_status(current_user: User = Depends(get_current_user)):
    """Check if user has completed onboarding"""
    user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    return {"onboarded": user_doc.get("onboarded", False)}


@router.post("/auth/onboarding")
async def complete_onboarding(data: OnboardingData, current_user: User = Depends(get_current_user)):
    """Save onboarding data and mark user as onboarded"""
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {
            "onboarded": True,
            "company_name": data.company_name,
            "team_size": data.team_size,
            "industry": data.industry,
            "goals": data.goals,
            "onboarded_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"status": "completed"}
