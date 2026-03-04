from fastapi import APIRouter, HTTPException, Depends

from database import db
from models import User, Notification
from dependencies import get_current_user

router = APIRouter()


async def create_notification(user_id: str, type: str, title: str, message: str, deal_id: str = None, priority: str = "medium"):
    """Helper function to create a notification"""
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        deal_id=deal_id,
        priority=priority
    )
    notif_dict = notification.model_dump()
    notif_dict["created_at"] = notif_dict["created_at"].isoformat()
    await db.notifications.insert_one(notif_dict)
    return notification


async def check_and_create_at_risk_notifications(user_id: str):
    """Check for at-risk deals and create notifications"""
    at_risk_deals = await db.deals.find({
        "user_id": user_id,
        "stage": {"$in": ["negotiation", "proposal"]},
        "probability": {"$lt": 40}
    }, {"_id": 0}).to_list(100)

    for deal in at_risk_deals:
        existing = await db.notifications.find_one({
            "user_id": user_id,
            "deal_id": deal["deal_id"],
            "type": "at_risk",
            "read": False
        })

        if not existing:
            priority = "critical" if deal.get("probability", 0) < 20 else "high"
            await create_notification(
                user_id=user_id,
                type="at_risk",
                title=f"At-Risk: {deal['name']}",
                message=f"{deal['company']} deal has {deal.get('probability', 0)}% probability. Consider immediate action.",
                deal_id=deal["deal_id"],
                priority=priority
            )


@router.get("/notifications")
async def get_notifications(user: User = Depends(get_current_user)):
    """Get all notifications for current user"""
    await check_and_create_at_risk_notifications(user.user_id)

    notifications = await db.notifications.find(
        {"user_id": user.user_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    unread_count = len([n for n in notifications if not n.get("read", False)])

    return {
        "notifications": notifications,
        "unread_count": unread_count
    }


@router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: User = Depends(get_current_user)):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user.user_id},
        {"$set": {"read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


@router.put("/notifications/read-all")
async def mark_all_notifications_read(user: User = Depends(get_current_user)):
    """Mark all notifications as read"""
    await db.notifications.update_many(
        {"user_id": user.user_id, "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All notifications marked as read"}


@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user: User = Depends(get_current_user)):
    """Delete a notification"""
    result = await db.notifications.delete_one(
        {"notification_id": notification_id, "user_id": user.user_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}
