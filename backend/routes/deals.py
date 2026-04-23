from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone

from database import db
from models import User, Deal, DealCreate, DealUpdate
from dependencies import get_current_user, require_owner, org_filter

router = APIRouter()


@router.get("/deals", response_model=List[Deal])
async def get_deals(user: User = Depends(get_current_user)):
    """Get all deals in the user's organization (shared)."""
    deals = await db.deals.find(org_filter(user), {"_id": 0}).to_list(2000)
    return deals


@router.post("/deals", response_model=Deal)
async def create_deal(deal_data: DealCreate, user: User = Depends(require_owner)):
    """Create a deal (owner only — members have read access)."""
    deal = Deal(user_id=user.user_id, **deal_data.model_dump())
    deal_dict = deal.model_dump()
    deal_dict["created_at"] = deal_dict["created_at"].isoformat()
    deal_dict["updated_at"] = deal_dict["updated_at"].isoformat()
    deal_dict["org_id"] = user.org_id

    await db.deals.insert_one(deal_dict)
    return deal


@router.put("/deals/{deal_id}", response_model=Deal)
async def update_deal(deal_id: str, deal_data: DealUpdate, user: User = Depends(require_owner)):
    """Update a deal (owner only)."""
    existing = await db.deals.find_one(
        {"deal_id": deal_id, **org_filter(user)}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Deal not found")

    update_data = {k: v for k, v in deal_data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.deals.update_one(
        {"deal_id": deal_id},
        {"$set": update_data}
    )

    updated = await db.deals.find_one({"deal_id": deal_id}, {"_id": 0})
    return updated


@router.delete("/deals/{deal_id}")
async def delete_deal(deal_id: str, user: User = Depends(require_owner)):
    """Delete a deal (owner only)."""
    result = await db.deals.delete_one({"deal_id": deal_id, **org_filter(user)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deal not found")
    return {"message": "Deal deleted"}
